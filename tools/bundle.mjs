#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
//
// Seite buendeln: <site>/<engineDir>/ (index.html, Engine, game.js, data/) + alle Dateien, auf die data/*.json zeigen.
// Vorher: `export` und `translate` (erzeugen <outDir>/data und <outDir>/game.js).
// Aufruf: node tools/bundle.mjs <site-dir> [--config ags-html.config.json]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

const RUNTIME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runtime');
const { cfg, root } = loadConfig();
const siteArg = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--config' && all[i - 1] !== '--root');
if (!siteArg) { console.error('Aufruf: node tools/bundle.mjs <site-dir> [--config <datei>]'); process.exit(2); }
const site = path.resolve(siteArg);
const engineDir = path.join(site, cfg.bundle.engineDir);
const outDir = path.resolve(root, cfg.outDir);

const kopiere = (quelle, ziel) => {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.copyFileSync(quelle, ziel);
};
const kopiereBaum = (quelle, ziel) => {
  if (fs.statSync(quelle).isDirectory()) {
    for (const e of fs.readdirSync(quelle)) kopiereBaum(path.join(quelle, e), path.join(ziel, e));
  } else kopiere(quelle, ziel);
};

// ---- Engine + Spielskript + Daten
for (const f of ['engine.js', 'ags-runtime.js', 'musik.js', 'spielstand.js', 'config.js']) kopiere(path.join(RUNTIME, f), path.join(engineDir, f));
if (!fs.existsSync(path.join(outDir, 'game.js'))) { console.error('game.js fehlt – zuerst `translate` ausfuehren'); process.exit(1); }
kopiere(path.join(outDir, 'game.js'), path.join(engineDir, 'game.js'));

// ---- Service Worker: VERSION = Umgebungsvariable REV, sonst Git-Revision des Projekts, sonst «dev»
let rev = process.env.REV || '';
if (!rev) { try { rev = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { rev = 'dev'; } }
fs.writeFileSync(path.join(engineDir, 'sw.js'), fs.readFileSync(path.join(RUNTIME, 'sw.js'), 'utf8').replace('__REV__', rev || 'dev'));

// ---- index.html aus der Vorlage
{
  const p = cfg.page;
  const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const attr = (s) => html(s).replace(/"/g, '&quot;');
  const fontFace = p.fontFile ? `@font-face {\n  font-family: "GameFont";\n  src: url("${attr(p.fontFile)}") format("truetype");\n  font-display: swap;\n}\n` : '';
  const werte = {
    lang: attr(p.lang),
    title: html(p.title),
    heading: p.heading || html(p.title),            // heading darf HTML enthalten (z. B. <br>)
    startText: html(p.startText),
    loadingText: html(p.loadingText),
    rotateText: html(p.rotateText),
    accent: p.accent,
    iconLinks: p.icon ? `<link rel="icon" href="${attr(p.icon)}">\n<link rel="apple-touch-icon" href="${attr(p.icon)}">` : '',
    fontFace,
    fontStack: p.fontFile ? '"GameFont", monospace' : p.fontFamily,
    titleUrl: p.titleImage ? `url("${attr(p.titleImage)}")` : '',
    metaRobots: p.noindex ? '<meta name="robots" content="noindex">\n' : ''
  };
  const tpl = fs.readFileSync(path.join(RUNTIME, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(engineDir, 'index.html'), tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in werte ? werte[k] : m)));
}

// ---- data/*.json + alle darin genannten Dateien
const dateien = new Set();
const roots = cfg.bundle.roots;
const passt = (s) => /^[\w./-]+\.(png|jpg|jpeg|gif|webp|mp3|ogg|wav|json|ttf|woff2?)$/i.test(s) && !s.startsWith('/') && !s.includes('..')
  && (!roots || roots.some((r) => s.startsWith(r + '/')));
const sammle = (o) => {
  if (typeof o === 'string') { if (passt(o)) dateien.add(o); }
  else if (o && typeof o === 'object') for (const v of Object.values(o)) sammle(v);
};
for (const f of fs.readdirSync(path.join(outDir, 'data'))) {
  kopiere(path.join(outDir, 'data', f), path.join(engineDir, 'data', f));
  sammle(JSON.parse(fs.readFileSync(path.join(outDir, 'data', f), 'utf8')));
}
// Sprite-Rueckfall der Engine: <spriteFallbackDir>/<slot>.png (nicht in den JSON-Daten aufgefuehrt)
const fb = cfg.runtime?.spriteFallbackDir;
if (fb && fs.existsSync(path.join(root, fb))) for (const f of fs.readdirSync(path.join(root, fb))) dateien.add(`${fb}/${f}`);

let n = 0, bytes = 0, fehlt = 0;
const gross = [];
for (const rel of dateien) {
  const q = path.join(root, rel);
  if (!fs.existsSync(q) || !fs.statSync(q).isFile()) { fehlt++; continue; }
  const s = fs.statSync(q).size;
  if (s > cfg.bundle.maxFileMB * 1024 * 1024) { gross.push(rel); continue; }
  kopiere(q, path.join(site, rel)); n++; bytes += s;
}
for (const c of cfg.bundle.copy) {
  const q = path.join(root, c.from);
  if (fs.existsSync(q)) kopiereBaum(q, path.join(site, c.to));
  else console.warn(`[WARN] bundle.copy: ${c.from} fehlt`);
}
console.log(`bundle: ${n} Dateien (${(bytes / 1e6).toFixed(1)} MB), fehlend ${fehlt}${gross.length ? ', zu gross: ' + gross.join(' ') : ''}`);
