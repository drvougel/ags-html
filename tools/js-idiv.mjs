#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// AGS rechnet int / int ganzzahlig (abgeschnitten), JavaScript liefert Kommazahlen (0.5 statt 0).
// Dieses Modul schreibt das uebersetzte game.js um: a / b -> __idiv(a, b), a /= b -> a = __idiv(a, b) (Laufzeit: ags-runtime.js).
// Ausnahmen (echte float-Rechnung): Operanden mit IntToFloat, Maths., Kommazahl-Literal, float-Variablen (floatNames).
// Idempotent: bereits umgeschriebene Divisionen gibt es nicht mehr.
// CLI: node tools/js-idiv.mjs <game.js> [--float-names a,b,c]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const FLOAT = /IntToFloat|Maths\.|\b\d+\.\d+\b|FloatToInt/;

// ---- Mini-Tokenizer (game.js enthaelt keine Regex-Literale; '/' ist immer Division)
function tokens(s) {
  const t = []; let i = 0;
  const P3 = ['===', '!==', '**=', '<<=', '>>=', '...', '>>>'], P2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    const a = i;
    if (c === '"' || c === "'") { i++; while (i < s.length && s[i] !== c) { if (s[i] === '\\') i++; i++; } i++; t.push({ k: 's', a, e: i }); continue; }
    if (c === '`') { // Template: ${…} grob ueberspringen (Divisionen darin bleiben unangetastet)
      i++; let d = 0;
      while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (d === 0 && s[i] === '`') break; if (s[i] === '$' && s[i + 1] === '{') { d++; i += 2; continue; } if (d > 0 && s[i] === '}') d--; i++; }
      i++; t.push({ k: 's', a, e: i }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) { i++; while (i < s.length && /[0-9a-fA-FxX._]/.test(s[i])) i++; t.push({ k: 'n', a, e: i }); continue; }
    if (/[A-Za-z_$]/.test(c)) { i++; while (i < s.length && /[\w$]/.test(s[i])) i++; t.push({ k: 'i', a, e: i }); continue; }
    const p3 = s.substr(i, 3), p2 = s.substr(i, 2);
    const p = P3.includes(p3) ? p3 : P2.includes(p2) ? p2 : c;
    i += p.length; t.push({ k: 'p', v: p, a, e: i });
  }
  return t;
}
let s;   // wird in idivSource gesetzt (Tokentext)
const istOp = (tk) => tk.k === 'p' && !(tk.v === ')' || tk.v === ']');
const KEYW = new Set(['return', 'case', 'typeof', 'void', 'in', 'of', 'new', 'delete', 'else', 'do']);

// Ende eines unaeren Ausdrucks ab Token j (rechter Operand)
function rechts(t, j) {
  while (j < t.length && ((t[j].k === 'p' && ['-', '+', '!', '~'].includes(t[j].v)) || (t[j].k === 'i' && s(t[j]) === 'await'))) j++;
  if (j >= t.length) return -1;
  let k = j;
  if (t[k].k === 'p' && (t[k].v === '(' || t[k].v === '[')) k = passend(t, k);
  else if (t[k].k === 'p') return -1;
  for (;;) {   // Postfix: .x  ?.x  [..]  (..)
    const n = t[k + 1];
    if (!n || n.k !== 'p') break;
    if ((n.v === '.' || n.v === '?.') && t[k + 2]?.k === 'i') { k += 2; continue; }
    if (n.v === '[' || n.v === '(') { k = passend(t, k + 1); continue; }
    break;
  }
  return k;
}
// Anfang des linken Operanden (multiplikative Kette, links-assoziativ) vor Token j
function links(t, j) {
  let k = j - 1;
  for (;;) {
    // ein Term: Postfix-Kette rueckwaerts
    for (;;) {
      const tk = t[k];
      if (!tk) return -1;
      if (tk.k === 'p' && (tk.v === ')' || tk.v === ']')) { k = passendRueck(t, k); }
      else if (tk.k === 'i' || tk.k === 'n' || tk.k === 's') { /* Primaer */ }
      else return -1;
      const v = t[k - 1];
      if (v && v.k === 'p' && (v.v === '.' || v.v === '?.')) { k -= 2; continue; }
      if (tk.k === 'p' && tk.v === ')' && v && (v.k === 'i' && !KEYW.has(s(v)) || (v.k === 'p' && (v.v === ')' || v.v === ']')))) { k--; continue; }   // Aufruf f(..)
      if (tk.k === 'p' && tk.v === ']' && v && (v.k === 'i' || (v.k === 'p' && (v.v === ')' || v.v === ']')))) { k--; continue; }   // Index a[..]
      break;
    }
    // unaeres Vorzeichen / await davor
    while (t[k - 1] && ((t[k - 1].k === 'p' && ['-', '+', '!', '~'].includes(t[k - 1].v) && (!t[k - 2] || istOp(t[k - 2]) || (t[k - 2].k === 'i' && KEYW.has(s(t[k - 2]))))) || (t[k - 1].k === 'i' && s(t[k - 1]) === 'await'))) k--;
    const op = t[k - 1];
    if (op && op.k === 'p' && (op.v === '*' || op.v === '%')) { k -= 2; continue; }   // gleiche Prioritaet, links-assoziativ
    return k;
  }
}
function passend(t, k) { const o = t[k].v, z = o === '(' ? ')' : ']'; let d = 0; for (let i = k; i < t.length; i++) { if (t[i].k !== 'p') continue; if (t[i].v === o) d++; else if (t[i].v === z && --d === 0) return i; } return t.length - 1; }
function passendRueck(t, k) { const z = t[k].v, o = z === ')' ? '(' : '['; let d = 0; for (let i = k; i >= 0; i--) { if (t[i].k !== 'p') continue; if (t[i].v === z) d++; else if (t[i].v === o && --d === 0) return i; } return 0; }

export function idivSource(code, floatNames = []) {
let src = code;
const FLOAT_NAMEN = new RegExp(`\\b(${['Geometry__Distance', 'Distance', ...floatNames].join('|')})\\b`);
s = (tk) => src.slice(tk.a, tk.e);
let ersetzt = 0, float = 0, unklar = 0, pos = 0;
for (;;) {
  const t = tokens(src);
  const j = t.findIndex((tk) => tk.k === 'p' && (tk.v === '/' || tk.v === '/=') && tk.a >= pos);
  if (j < 0) break;
  const l = links(t, j), r = rechts(t, j + 1);
  if (l < 0 || r < 0) { unklar++; pos = t[j].e; continue; }
  const L = src.slice(t[l].a, t[j - 1].e), R = src.slice(t[j + 1].a, t[r].e);
  if (FLOAT.test(L + ' ' + R) || FLOAT_NAMEN.test(L + ' ' + R)) { float++; pos = t[j].e; continue; }
  const neu = t[j].v === '/' ? `__idiv(${L}, ${R})` : `${L} = __idiv(${L}, ${R})`;
  src = src.slice(0, t[l].a) + neu + src.slice(t[r].e);
  pos = t[l].a + neu.length - R.length - 1;   // innerhalb von R weitersuchen (verschachtelte Divisionen)
  ersetzt++;
}
return { src, ersetzt, float, unklar };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const datei = process.argv[2];
  if (!datei) { console.error('Aufruf: node tools/js-idiv.mjs <game.js> [--float-names a,b]'); process.exit(2); }
  const i = process.argv.indexOf('--float-names');
  const names = i > 0 ? process.argv[i + 1].split(',').filter(Boolean) : [];
  const r = idivSource(fs.readFileSync(datei, 'utf8'), names);
  fs.writeFileSync(datei, r.src);
  console.log(`js-idiv: ${r.ersetzt} Divisionen ganzzahlig, ${r.float} float belassen, ${r.unklar} unklar (unveraendert)`);
}
