#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// Uebersetzt alle AGS-Skripte (<gameDir>/*.ash, *.asc) nach <outDir>/game.js
// Aufruf: node tools/ags2js.mjs [--config ags-html.config.json] [--out <game.js>]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './config.mjs';

const { cfg, root } = loadConfig();
const gameDir = path.resolve(root, cfg.gameDir);
const outArgIdx = process.argv.indexOf('--out');
const outPath = outArgIdx > 0 ? path.resolve(process.argv[outArgIdx + 1]) : path.resolve(root, cfg.outDir, 'game.js');
const outDir = path.dirname(outPath);
fs.mkdirSync(outDir, { recursive: true });

// -----------------------------------------------------------------------------
// 1. Bekannte AGS-Typen & blockierende API-Funktionen
// -----------------------------------------------------------------------------

const AGS_TYPES = new Set([
  'void', 'int', 'bool', 'String', 'float', 'char', 'short', 'long', 'const',
  'Character', 'InventoryItem', 'Hotspot', 'Object', 'Region', 'WalkableArea', 'Walkbehind',
  'GUI', 'GUIControl', 'Button', 'Label', 'Slider', 'TextBox', 'ListBox', 'InvWindow',
  'Overlay', 'DynamicSprite', 'DrawingSurface', 'ViewFrame',
  'AudioClip', 'AudioChannel', 'DateTime', 'File', 'Point', 'Camera', 'Viewport',
  'Dialog', 'DialogOptionsRenderingInfo', 'Parser',
  'CursorMode', 'FontType', 'MouseButton', 'eKeyCode', 'EventType',
  'CharacterDirection', 'WalkWhere', 'BlockingStyle', 'RepeatStyle', 'Alignment',
  'Action', 'eLanguage', 'eVerbGuiOptions', 'eVerbGuiUnhandled', 'eDoorStrings',
  ...cfg.scripts.extraTypes   // Typen aus eigenen Modulen (Konfiguration)
]);

// Bekannte Struct-Namen (wird beim Lesen der Header/Skripte dynamisch ergaenzt)
const STRUCT_TYPES = new Set([
  'Verbs', 'Doors', 'Geometry', 'TimeCount', 'CustomSave', 'CustomLoad', 'OptionGui'
]);

const ENUM_TYPES = new Set();

// Blockierende AGS-Aufrufe (Kernliste fuer den async/await-Fixpunkt)
const BLOCKING_GLOBAL_FUNCS = new Set([
  'Wait', 'Display', 'SaveGameSlot', 'RestoreGameSlot', 'RestartGame', 'QuitGame',
  'Verbs_ClickAt',
  ...cfg.scripts.extraBlockingFuncs
]);

const BLOCKING_METHODS = new Set([
  'Say', 'Walk', 'FaceDirection', 'FaceCharacter', 'FaceLocation', 'Animate',
  'ChangeRoom', 'EnterRoom', 'Start', 'RunInteraction', 'ProcessClick',
  'GoTo', 'MovePlayer', 'MovePlayerEx', 'GoToCharacter', 'GoToCharacterEx', 'NPCGoToCharacter',
  'WalkOffScreen', 'Unhandled', 'AnyClickMove', 'AnyClickWalk', 'AnyClickWalkLook',
  'AnyClickWalkLookPick', 'AnyClickUseInv', 'SetPlayer', 'ShowGui',
  'AnyClick', 'AnyClickSpecial', 'OnClick',
  ...cfg.scripts.extraBlockingMethods
]);

// -----------------------------------------------------------------------------
// 2. Hilfsfunktionen zum Lesen und Vorverarbeiten (Kommentare & Praeprozessor)
// -----------------------------------------------------------------------------

function readFileText(fullPath) {
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
}

// Entfernt /* ... */ und // ..., schont aber Strings "..."
function stripComments(code) {
  let out = '';
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '"') {
      out += ch;
      i++;
      while (i < len) {
        const c = code[i];
        out += c;
        i++;
        if (c === '\\' && i < len) {
          out += code[i];
          i++;
        } else if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === "'" && i + 2 < len) {
      if (code[i + 1] === '\\' && code[i + 3] === "'") {
        out += code.slice(i, i + 4);
        i += 4;
        continue;
      }
      if (code[i + 2] === "'") {
        out += code.slice(i, i + 3);
        i += 3;
        continue;
      }
    }
    if (ch === '/' && next === '/') {
      while (i < len && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Wertet #define, #ifdef, #ifndef, #else, #endif aus (SCRIPT_API_v3507 und __VERB_GUI_MODULE__ sind aktiv)
function preprocess(code, definesMap) {
  const activeDefines = new Set(['SCRIPT_API_v3507', '__VERB_GUI_MODULE__', '__OPTION_GUI_MODULE__']);
  for (const k of Object.keys(definesMap)) activeDefines.add(k);

  const lines = code.split(/\r?\n/);
  const out = [];
  const stack = [true];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('#')) {
      const mDef = /^#define\s+([A-Za-z_]\w*)(?:\s+(.*))?$/.exec(trimmed);
      if (mDef) {
        if (stack[stack.length - 1]) {
          const name = mDef[1];
          const val = (mDef[2] ?? '').trim();
          activeDefines.add(name);
          if (val !== '') {
            definesMap[name] = val;
          }
        }
        out.push('');
        continue;
      }
      const mIfdef = /^#ifdef\s+([A-Za-z_]\w*)/.exec(trimmed);
      if (mIfdef) {
        const parent = stack[stack.length - 1];
        stack.push(parent && activeDefines.has(mIfdef[1]));
        out.push('');
        continue;
      }
      const mIfndef = /^#ifndef\s+([A-Za-z_]\w*)/.exec(trimmed);
      if (mIfndef) {
        const parent = stack[stack.length - 1];
        stack.push(parent && !activeDefines.has(mIfndef[1]));
        out.push('');
        continue;
      }
      if (/^#else\b/.test(trimmed)) {
        if (stack.length > 1) {
          const parent = stack[stack.length - 2];
          const curr = stack[stack.length - 1];
          stack[stack.length - 1] = parent && !curr;
        }
        out.push('');
        continue;
      }
      if (/^#endif\b/.test(trimmed)) {
        if (stack.length > 1) stack.pop();
        out.push('');
        continue;
      }
      // #error / sonstige Direktiven ignorieren
      out.push('');
      continue;
    }

    if (stack[stack.length - 1]) {
      out.push(rawLine);
    } else {
      out.push('');
    }
  }
  return out.join('\n');
}

// -----------------------------------------------------------------------------
// 3. Enums & Structs aus Headern und Skripten extrahieren
// -----------------------------------------------------------------------------

function extractEnumsAndStructs(code, enumsMap, structsMap) {
  // Enums extrahieren
  let cleaned = code.replace(/\benum\s+([A-Za-z_]\w*)?\s*\{([\s\S]*?)\}\s*;/g, (_, enumName, body) => {
    if (enumName) {
      AGS_TYPES.add(enumName);
      ENUM_TYPES.add(enumName);
    }
    let nextVal = 0;
    for (const part of body.split(',')) {
      const item = part.trim();
      if (!item) continue;
      const eq = item.indexOf('=');
      if (eq >= 0) {
        const k = item.slice(0, eq).trim();
        const vStr = item.slice(eq + 1).trim();
        const vNum = Number(vStr);
        if (Number.isFinite(vNum)) {
          enumsMap[k] = vNum;
          nextVal = vNum + 1;
        } else {
          enumsMap[k] = vStr;
        }
      } else {
        enumsMap[item] = nextVal++;
      }
    }
    return '';
  });

  // Structs extrahieren
  cleaned = cleaned.replace(/\bstruct\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}\s*;/g, (_, structName, body) => {
    AGS_TYPES.add(structName);
    STRUCT_TYPES.add(structName);
    if (!structsMap[structName]) {
      structsMap[structName] = { name: structName, fields: [] };
    }
    const stmts = body.split(';');
    for (const rawStmt of stmts) {
      const s = rawStmt.trim().replace(/\s+/g, ' ');
      if (!s) continue;
      if (/^import\b/.test(s) || /^static\b/.test(s) || s.includes('(')) continue;
      const parsed = parseVarDeclStatement(s);
      if (parsed) {
        for (const decl of parsed.decls) {
          structsMap[structName].fields.push({
            name: decl.name,
            baseType: parsed.baseType,
            isPointer: decl.isPointer || parsed.isPointer,
            arraySize: decl.arraySize
          });
        }
      }
    }
    return '';
  });

  return cleaned;
}

// -----------------------------------------------------------------------------
// 4. Statement-Splitter & Deklarations-Parser
// -----------------------------------------------------------------------------

function isTypeName(word) {
  return AGS_TYPES.has(word) || STRUCT_TYPES.has(word) || ENUM_TYPES.has(word);
}

function defaultInitForType(baseType, isPointer, arraySize) {
  if (arraySize !== null && arraySize !== undefined) {
    const sz = arraySize === '' ? 0 : arraySize;
    if (sz === 0) return '[]';
    if (!isPointer && STRUCT_TYPES.has(baseType)) {
      return `Array.from({ length: ${sz} }, () => __create_${baseType}())`;
    }
    const elemDefault = isPointer
      ? 'null'
      : (baseType === 'int' || baseType === 'float' || baseType === 'char' || baseType === 'short' || baseType === 'long' || ENUM_TYPES.has(baseType))
        ? '0'
        : baseType === 'bool'
          ? 'false'
          : baseType === 'String'
            ? '""'
            : 'null';
    return `new Array(${sz}).fill(${elemDefault})`;
  }
  if (isPointer) return 'null';
  if (STRUCT_TYPES.has(baseType)) return `__create_${baseType}()`;
  if (baseType === 'int' || baseType === 'float' || baseType === 'char' || baseType === 'short' || baseType === 'long' || ENUM_TYPES.has(baseType)) {
    return '0';
  }
  if (baseType === 'bool') return 'false';
  if (baseType === 'String') return '""';
  return 'null';
}

// Splittet einen Ausdruck auf Top-Level-Kommas (ignoriert Kommas in (), [], {}, "")
function splitTopLevelCommas(str) {
  const parts = [];
  let cur = '';
  let pDepth = 0, bDepth = 0, cDepth = 0;
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\' && i + 1 < str.length) {
        cur += str[++i];
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') { inStr = true; cur += ch; continue; }
    if (ch === '(') pDepth++;
    else if (ch === ')') pDepth = Math.max(0, pDepth - 1);
    else if (ch === '[') bDepth++;
    else if (ch === ']') bDepth = Math.max(0, bDepth - 1);
    else if (ch === '{') cDepth++;
    else if (ch === '}') cDepth = Math.max(0, cDepth - 1);

    if (ch === ',' && pDepth === 0 && bDepth === 0 && cDepth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Erkennt eine AGS-Variablendeklaration (ohne abschliessendes Semikolon)
// z. B. "Overlay* ov = ...", "int a = 1, b = 2", "DynamicSprite *slotSprites[SAVE_SLOTS]", "String upperkey = String.Format(...)"
function parseVarDeclStatement(stmtNoSemi) {
  const s = stmtNoSemi.trim();
  const mType = /^(?:const\s+)?([A-Za-z_]\w*)\s*(\*+)?\s*(.+)$/.exec(s);
  if (!mType) return null;

  const baseType = mType[1];
  if (!isTypeName(baseType)) return null;

  const typeStar = !!mType[2];
  const rest = mType[3].trim();

  // Nicht verwechseln mit statischem Methodenaufruf wie "String.Format(...)" oder "Verbs.SetAction(...)"
  if (rest.startsWith('.') || rest.startsWith('::') || rest.startsWith('(')) return null;

  const items = splitTopLevelCommas(rest);
  if (items.length === 0) return null;

  const decls = [];
  for (const item of items) {
    // Erlaubt: "*varName[size] = initVal" oder "varName = initVal"
    const mItem = /^(\*+)?\s*([A-Za-z_]\w*)\s*(?:\[\s*([^\]]*)\s*\])?\s*(?:=\s*([\s\S]+))?$/.exec(item);
    if (!mItem) return null;
    const varStar = !!mItem[1];
    const name = mItem[2];
    const arraySize = mItem[3] !== undefined ? mItem[3].trim() : null;
    const initExpr = mItem[4] !== undefined ? mItem[4].trim() : null;
    decls.push({
      name,
      isPointer: typeStar || varStar,
      arraySize,
      initExpr
    });
  }

  return {
    baseType,
    isPointer: typeStar,
    decls
  };
}

// Zerlegt C/AGS-Code in saubere Einzelzeilen-Statements:
// - Mehrzeilige Statements (wie "int x = a,\n y = b;") werden zusammengefuegt
// - Mehrere Statements auf einer Zeile (wie "int a; Overlay* b;") werden getrennt
// - Inline-Bloecke (wie "if (c) { Hotspot* h = ...; }") werden aufgebrochen
function normalizeStatements(code) {
  const rawLines = code.split(/\r?\n/);
  const joined = rawLines.join('\n');
  const out = [];
  let buf = '';
  let pDepth = 0;
  let bDepth = 0;
  let inStr = false;

  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };

  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];

    if (inStr) {
      buf += ch;
      if (ch === '\\' && i + 1 < joined.length) {
        buf += joined[++i];
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }

    if (ch === "'" && i + 2 < joined.length) {
      if (joined[i + 1] === '\\' && joined[i + 3] === "'") {
        buf += joined.slice(i, i + 4);
        i += 3;
        continue;
      }
      if (joined[i + 2] === "'") {
        buf += joined.slice(i, i + 3);
        i += 2;
        continue;
      }
    }

    if (ch === '(') pDepth++;
    else if (ch === ')') pDepth = Math.max(0, pDepth - 1);
    else if (ch === '[') bDepth++;
    else if (ch === ']') bDepth = Math.max(0, bDepth - 1);

    if (ch === '\n' || ch === '\r') {
      if (buf.length > 0 && !buf.endsWith(' ')) buf += ' ';
      continue;
    }

    if (pDepth === 0 && bDepth === 0) {
      if (ch === '{') {
        buf += ' {';
        flush();
        continue;
      }
      if (ch === '}') {
        flush();
        // Pruefen, ob direkt ";" folgt
        let k = i + 1;
        while (k < joined.length && (joined[k] === ' ' || joined[k] === '\t')) k++;
        if (joined[k] === ';') {
          out.push('}');
          i = k;
        } else {
          out.push('}');
        }
        continue;
      }
      if (ch === ';') {
        buf += ';';
        flush();
        continue;
      }
      if (ch === ':') {
        // case X: oder default: auf eigene Zeile trennen
        const trimmedBuf = buf.trim();
        if (/^(case\s+.+|default)$/.test(trimmedBuf)) {
          buf += ':';
          flush();
          continue;
        }
      }
    }

    buf += ch;
  }
  flush();

  // Falls "if (...) stmt;" oder "else stmt;" vor einem Block oder einer Deklaration steht, Pruefung auf Einzeiler
  return out;
}

// -----------------------------------------------------------------------------
// 5. Ausdrucks-Transformation (new Type[n], Char-Literale, Integer-Division)
// -----------------------------------------------------------------------------

// Ersetzt 'x' (Einzelzeichen-Literale ausserhalb von "...") durch ihren ASCII-Code (wie in C/AGS char)
function transformCharLiterals(expr) {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"') {
      out += ch;
      i++;
      while (i < expr.length) {
        const c = expr[i];
        out += c;
        i++;
        if (c === '\\' && i < expr.length) {
          out += expr[i++];
        } else if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === "'") {
      if (expr[i + 1] === '\\' && expr[i + 3] === "'") {
        const esc = expr[i + 2];
        const map = { n: 10, r: 13, t: 9, '0': 0, '\\': 92, "'": 39 };
        const code = map[esc] !== undefined ? map[esc] : esc.charCodeAt(0);
        out += String(code);
        i += 4;
        continue;
      }
      if (i + 2 < expr.length && expr[i + 2] === "'") {
        out += String(expr.charCodeAt(i + 1));
        i += 3;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

// Ersetzt "new Type[size]" durch "new Array(size).fill(...)"
function transformNewArrays(expr) {
  return expr.replace(/\bnew\s+([A-Za-z_]\w*)\s*\[\s*([^\]]+)\s*\]/g, (_, typeName, sizeExpr) => {
    const defVal = (typeName === 'int' || typeName === 'float' || typeName === 'char') ? '0' : 'null';
    return `new Array(${sizeExpr}).fill(${defVal})`;
  });
}

// Wandelt Ganzzahl-Divisionen a / b in __div(a, b) (= Math.trunc(a / b)) um,
// sofern kein Float-Literal (wie 5.0 oder 0.12) beteiligt ist.
function transformIntegerDivision(expr) {
  if (!expr.includes('/')) return expr;
  // Zeichenketten (z. B. "%d/6") nie anfassen -> durch Platzhalter ersetzen und danach zurueck
  const strs = [];
  const masked = expr.replace(/"(?:[^"\\]|\\.)*"/g, (m) => { strs.push(m); return `\u0001${strs.length - 1}\u0002`; });
  if (strs.length) return transformIntegerDivision(masked).replace(/\u0001(\d+)\u0002/g, (_, i) => strs[Number(i)]);
  // Einfache und geklammerte Operanden links und rechts von '/' (nicht '//' oder '/*')
  // Wir fuehren das iterativ durch, damit Ketten wie a * b / c / d sauber zu __div(__div(a * b, c), d) werden.
  let prev = '';
  let cur = expr;
  const operandLeft = String.raw`(?:\([^()]*\)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\([^()]*\)|\[[^[\]]*\])*|\d+(?:\.\d+)?)(?:\s*[*%]\s*(?:\([^()]*\)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\([^()]*\)|\[[^[\]]*\])*|\d+(?:\.\d+)?))*`;
  const operandRight = String.raw`(?:\([^()]*\)|[+-]?\s*(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\([^()]*\)|\[[^[\]]*\])*|\d+(?:\.\d+)?))`;
  const re = new RegExp(`(${operandLeft})\\s*\\/\\s*(${operandRight})`);

  let guard = 0;
  while (cur !== prev && guard++ < 12) {
    prev = cur;
    cur = cur.replace(re, (full, lhs, rhs) => {
      if (/\d+\.\d+/.test(lhs) || /\d+\.\d+/.test(rhs)) {
        return `${lhs.trim()} / ${rhs.trim()}`;
      }
      return `__div(${lhs.trim()}, ${rhs.trim()})`;
    });
  }
  return cur;
}

function transformExpression(expr) {
  let e = expr;
  e = transformCharLiterals(e);
  e = transformNewArrays(e);
  e = transformIntegerDivision(e);
  return e;
}

// -----------------------------------------------------------------------------
// 6. Funktions- und Statement-Parser je Skriptdatei
// -----------------------------------------------------------------------------

function parseFunctionParams(paramStr) {
  const s = paramStr.trim();
  if (!s) return { params: [], staticStruct: null, extenderType: null };

  const rawParts = splitTopLevelCommas(s);
  const params = [];
  let staticStruct = null;
  let extenderType = null;

  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i].trim();
    if (!p) continue;

    // 1. "(static Verbs, ...)" fuer statische Attribute
    const mStatic = /^static\s+([A-Za-z_]\w*)$/.exec(p);
    if (mStatic && i === 0) {
      staticStruct = mStatic[1];
      continue;
    }

    // 2. "(this Character*, ...)" fuer Extender-Methoden
    const mExt = /^this\s+([A-Za-z_]\w*)\s*\*?\s*([A-Za-z_]\w*)?$/.exec(p);
    if (mExt && i === 0) {
      extenderType = mExt[1];
      continue;
    }

    // 3. Normaler Parameter: "Character *thisCharacter" oder "int blocking=2"
    const eqIdx = p.indexOf('=');
    const leftPart = (eqIdx >= 0 ? p.slice(0, eqIdx) : p).trim();
    const defPart = eqIdx >= 0 ? transformExpression(p.slice(eqIdx + 1).trim()) : null;

    const mParam = /^(?:const\s+)?([A-Za-z_]\w*)\s*(?:\*+\s*)?([A-Za-z_]\w*)$/.exec(leftPart);
    if (mParam) {
      const pName = mParam[2];
      params.push(defPart !== null ? `${pName} = ${defPart}` : pName);
    } else {
      params.push(p);
    }
  }

  return { params, staticStruct, extenderType };
}

function parseScriptModule(moduleName, code, isRoom = false) {
  const stmts = normalizeStatements(code);
  const items = []; // { kind: 'var'|'func'|'stmt', ... }
  const declaredGlobals = new Set();

  let i = 0;
  while (i < stmts.length) {
    const line = stmts[i].trim();
    if (!line) { i++; continue; }

    // 1. import / export Zeilen ueberspringen
    if (/^(import|export)\b/.test(line) && line.endsWith(';')) {
      i++;
      continue;
    }

    // 2. Funktionsdefinition am Zeilenanfang erkennen (endet mit "{")
    // z. B. "static int Verbs::GoTo(int blocking) {" oder "function room_Load() {" oder "InventoryItem* E3_It() {"
    if (line.endsWith('{') && !/^(if|else|while|for|switch)\b/.test(line)) {
      const header = line.slice(0, -1).trim().replace(/\bnoloopcheck\b/g, '').trim();
      const mFunc = /^(?:static\s+)?([A-Za-z_]\w*(?:\s*\*+)?)\s+(?:([A-Za-z_]\w*)::)?([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/.exec(header);

      if (mFunc) {
        const structName = mFunc[2] || null;
        const rawFuncName = mFunc[3];
        const paramSpec = parseFunctionParams(mFunc[4]);

        // Funktionsrumpf bis zur schliessenden '}' sammeln
        const bodyLines = [];
        let depth = 1;
        i++;
        while (i < stmts.length && depth > 0) {
          const bl = stmts[i];
          if (bl.endsWith('{')) depth++;
          else if (bl === '}') {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          bodyLines.push(bl);
          i++;
        }

        const jsFuncName = structName ? `${structName}__${rawFuncName}` : rawFuncName;
        items.push({
          kind: 'func',
          moduleName,
          isRoom,
          structName,
          rawFuncName,
          jsFuncName,
          params: paramSpec.params,
          staticStruct: paramSpec.staticStruct,
          extenderType: paramSpec.extenderType,
          bodyStmts: bodyLines
        });
        continue;
      }
    }

    // 3. Top-Level Variablendeklaration
    if (line.endsWith(';')) {
      const noSemi = line.slice(0, -1).trim();
      const varDecl = parseVarDeclStatement(noSemi);
      if (varDecl) {
        items.push({
          kind: 'var',
          moduleName,
          isRoom,
          varDecl
        });
        for (const d of varDecl.decls) declaredGlobals.add(d.name);
        i++;
        continue;
      }
    }

    // 4. Sonstiges Statement
    items.push({ kind: 'stmt', line });
    i++;
  }

  return items;
}

// Transformiert die Statements innerhalb eines Funktionsrumpfs (Typen entfernen, Ausdruecke anpassen)
function transformFunctionBody(bodyStmts, localVars = new Set()) {
  const out = [];

  for (const rawStmt of bodyStmts) {
    let s = rawStmt.trim();
    if (!s) continue;
    s = s.replace(/\bnoloopcheck\b/g, '').trim();

    // 1. Blockende "}"
    if (s === '}') {
      out.push('}');
      continue;
    }

    // 2. "for (int i = 0; i < N; i++) {"
    const mFor = /^for\s*\(\s*([^;]+);\s*([^;]*);\s*([\s\S]*)\)\s*(\{?)$/.exec(s);
    if (mFor) {
      let initPart = mFor[1].trim();
      const condPart = transformExpression(mFor[2].trim());
      const incPart = transformExpression(mFor[3].trim());
      const brace = mFor[4] ? ' {' : '';

      const initDecl = parseVarDeclStatement(initPart);
      if (initDecl) {
        const dStrings = initDecl.decls.map((d) => {
          const val = d.initExpr !== null ? transformExpression(d.initExpr) : defaultInitForType(initDecl.baseType, d.isPointer, d.arraySize);
          return `${d.name} = ${val}`;
        });
        initPart = `let ${dStrings.join(', ')}`;
      } else {
        initPart = transformExpression(initPart);
      }
      out.push(`for (${initPart}; ${condPart}; ${incPart})${brace}`);
      continue;
    }

    // 3. "if (...) {", "else if (...) {", "while (...) {", "switch (...) {"
    const mCtrl = /^(else\s+if|if|while|switch)\s*\(([\s\S]*)\)\s*\{$/.exec(s);
    if (mCtrl) {
      out.push(`${mCtrl[1]} (${transformExpression(mCtrl[2])}) {`);
      continue;
    }

    if (/^else\s*\{$/.test(s)) {
      out.push('else {');
      continue;
    }

    // 4. Einzeiliges "if (...) stmt;" oder "else if (...) stmt;" oder "else stmt;"
    const mInlineIf = /^(else\s+if|if|while)\s*\(([\s\S]+?)\)\s+([^{][\s\S]*);$/.exec(s);
    if (mInlineIf) {
      // Pruefen, ob die Klammer um die Bedingung balanciert ist
      let depth = 0, balanced = true;
      const condCand = mInlineIf[2];
      for (let c of condCand) {
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth < 0) { balanced = false; break; }
        }
      }
      if (balanced && depth === 0) {
        const innerTransformed = transformFunctionBody([mInlineIf[3] + ';'], localVars)[0] || (transformExpression(mInlineIf[3]) + ';');
        out.push(`${mInlineIf[1]} (${transformExpression(condCand)}) ${innerTransformed}`);
        continue;
      }
    }

    const mInlineElse = /^else\s+(?!if\b)([^{][\s\S]*);$/.exec(s);
    if (mInlineElse) {
      const innerTransformed = transformFunctionBody([mInlineElse[1] + ';'], localVars)[0] || (transformExpression(mInlineElse[1]) + ';');
      out.push(`else ${innerTransformed}`);
      continue;
    }

    // 5. Lokale Variablendeklaration "Type* name = expr;"
    if (s.endsWith(';')) {
      const noSemi = s.slice(0, -1).trim();
      const varDecl = parseVarDeclStatement(noSemi);
      if (varDecl) {
        const parts = [];
        for (const d of varDecl.decls) {
          const val = d.initExpr !== null
            ? transformExpression(d.initExpr)
            : defaultInitForType(varDecl.baseType, d.isPointer, d.arraySize);
          if (localVars.has(d.name)) {
            out.push(`${d.name} = ${val};`);
          } else {
            localVars.add(d.name);
            parts.push(`${d.name} = ${val}`);
          }
        }
        if (parts.length > 0) {
          out.push(`let ${parts.join(', ')};`);
        }
        continue;
      }

      // 6. return-Statement
      const mRet = /^return(?:\s+([\s\S]+))?$/.exec(noSemi);
      if (mRet) {
        out.push(mRet[1] !== undefined ? `return ${transformExpression(mRet[1])};` : 'return;');
        continue;
      }

      // 7. Normales Statement mit Semikolon
      out.push(`${transformExpression(noSemi)};`);
      continue;
    }

    out.push(transformExpression(s));
  }

  return out;
}

// -----------------------------------------------------------------------------
// 7. Fixpunkt-Analyse fuer async/await & Einsetzen von (await ...)
// -----------------------------------------------------------------------------

function computeAsyncFixpoint(allFuncs) {
  const asyncFuncNames = new Set(BLOCKING_GLOBAL_FUNCS);
  const asyncMethodNames = new Set(BLOCKING_METHODS);

  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of allFuncs) {
      if (fn.isAsync) continue;
      const code = fn.transformedBody.join('\n');

      // Pruefen, ob eine blockierende Methode (.Say(, .Walk(, etc.) aufgerufen wird
      let callsAsync = false;
      for (const mName of asyncMethodNames) {
        const reM = new RegExp(`\\.${mName}\\s*\\(`);
        if (reM.test(code)) {
          callsAsync = true;
          break;
        }
      }

      // Pruefen, ob eine globale async-Funktion aufgerufen wird
      if (!callsAsync) {
        for (const fName of asyncFuncNames) {
          const reF = new RegExp(`(?<![.\\w])${fName}\\s*\\(`);
          if (reF.test(code)) {
            callsAsync = true;
            break;
          }
        }
      }

      if (callsAsync) {
        fn.isAsync = true;
        changed = true;
        asyncFuncNames.add(fn.rawFuncName);
        asyncFuncNames.add(fn.jsFuncName);
        if (fn.structName) {
          asyncMethodNames.add(fn.rawFuncName);
        }
        if (fn.extenderType) {
          asyncMethodNames.add(fn.rawFuncName);
        }
      }
    }
  }

  return { asyncFuncNames, asyncMethodNames };
}

// Setzt "(await ...)" um jeden Aufruf einer async-Funktion oder async-Methode
function insertAwaitsInLine(line, asyncFuncNames, asyncMethodNames) {
  if (!line || line === '{' || line === '}') return line;

  // Findet alle Aufruf-Stellen im Ausdruck (von innen nach aussen)
  let out = line;

  // Hilfsfunktion: ersetzt in `str` einen Funktionsaufruf ab `callStart` (vor dem Funktionsnamen) und `openParenIdx`
  function wrapCalls(str) {
    let i = 0;
    let result = '';
    let inStr = false;

    while (i < str.length) {
      const ch = str[i];
      if (inStr) {
        result += ch;
        if (ch === '\\' && i + 1 < str.length) {
          result += str[++i];
        } else if (ch === '"') {
          inStr = false;
        }
        i++;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        result += ch;
        i++;
        continue;
      }

      // Bezeichner oder Member-Kette lesen
      const mIdent = /^(?:([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*|\s*\[[^[\]]+\])*)\s*\.\s*)?([A-Za-z_]\w*)\s*\(/.exec(str.slice(i));
      if (mIdent) {
        const fullPrefix = mIdent[0];
        const receiver = mIdent[1] || null;
        const fnName = mIdent[2];

        // Sicherstellen, dass links kein Wortzeichen oder '.' klebt
        const prevChar = i > 0 ? str[i - 1] : '';
        if (!/[A-Za-z0-9_.]/.test(prevChar)) {
          const openParenOffset = fullPrefix.length - 1;
          const openParenPos = i + openParenOffset;

          // Schliessende Klammer finden
          let depth = 1;
          let k = openParenPos + 1;
          let sIn = false;
          while (k < str.length && depth > 0) {
            const c = str[k];
            if (sIn) {
              if (c === '\\') k++;
              else if (c === '"') sIn = false;
            } else {
              if (c === '"') sIn = true;
              else if (c === '(') depth++;
              else if (c === ')') depth--;
            }
            k++;
          }

          if (depth === 0) {
            const innerArgs = str.slice(openParenPos + 1, k - 1);
            const transformedArgs = wrapCalls(innerArgs);
            const callHeader = str.slice(i, openParenPos);
            const rebuiltCall = `${callHeader}(${transformedArgs})`;

            const isControlKeyword = !receiver && /^(if|while|for|switch|return|catch)$/.test(fnName);
            const shouldAwait = !isControlKeyword && (
              (receiver && asyncMethodNames.has(fnName)) ||
              (!receiver && asyncFuncNames.has(fnName))
            );

            if (shouldAwait) {
              result += `(await ${rebuiltCall})`;
            } else {
              result += rebuiltCall;
            }
            i = k;
            continue;
          }
        }
      }

      result += ch;
      i++;
    }
    return result;
  }

  return wrapCalls(out);
}

// -----------------------------------------------------------------------------
// 8. Hauptablauf: Dateien einlesen, uebersetzen, pruefen und schreiben
// -----------------------------------------------------------------------------

const definesMap = {};
const enumsMap = {};
const structsMap = {};

// 8a) Alle .ash Header in definierter Reihenfolge lesen
const headerOrder = [...cfg.scripts.headerOrder];
const allGameFiles = fs.readdirSync(gameDir);
for (const f of allGameFiles) {
  if (f.endsWith('.ash') && !headerOrder.includes(f)) headerOrder.push(f);
}

for (const hFile of headerOrder) {
  const full = path.join(gameDir, hFile);
  if (!fs.existsSync(full)) continue;
  const noComments = stripComments(readFileText(full));
  const pre = preprocess(noComments, definesMap);
  extractEnumsAndStructs(pre, enumsMap, structsMap);
}

// 8b) Globale Skripte und Raumskripte sammeln
const globalScriptOrder = cfg.scripts.globalOrder || [
  ...allGameFiles.filter((f) => /\.asc$/i.test(f) && !/^room\d+\.asc$/i.test(f) && f !== 'GlobalScript.asc').sort(),
  'GlobalScript.asc'
];
const roomFiles = allGameFiles
  .filter((f) => /^room\d+\.asc$/i.test(f))
  .sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));

const modulesToCompile = [
  ...globalScriptOrder.filter((f) => fs.existsSync(path.join(gameDir, f))).map((f) => ({
    file: f,
    name: f.replace(/\.asc$/i, ''),
    isRoom: false,
    roomNum: null
  })),
  ...roomFiles.map((f) => ({
    file: f,
    name: f.replace(/\.asc$/i, ''),
    isRoom: true,
    roomNum: Number(/\d+/.exec(f)[0])
  }))
];

// Erster Pass ueber alle .asc-Dateien: #define, enum und struct extrahieren
for (const mod of modulesToCompile) {
  const raw = readFileText(path.join(gameDir, mod.file));
  const noComments = stripComments(raw);
  const pre = preprocess(noComments, definesMap);
  mod.cleanCode = extractEnumsAndStructs(pre, enumsMap, structsMap);
}

// Zweiter Pass: Module in Variablen und Funktionen zerlegen
const allFunctions = [];
const report = [];

for (const mod of modulesToCompile) {
  mod.items = parseScriptModule(mod.name, mod.cleanCode, mod.isRoom);
  let fnCount = 0;
  for (const item of mod.items) {
    if (item.kind === 'func') {
      fnCount++;
      const paramSet = new Set(
        item.params.map((p) => p.split('=')[0].trim()).filter(Boolean)
      );
      item.transformedBody = transformFunctionBody(item.bodyStmts, paramSet);
      // Lifecycle-Hooks und Click-Handler sind grundsaetzlich async
      item.isAsync = /^(game_start|on_event|on_key_press|on_mouse_click|repeatedly_execute|room_Load|room_AfterFadeIn|room_Leave|room_RepExec|.*_AnyClick|.*_OtherClick|.*_OnClick)$/.test(item.rawFuncName);
      allFunctions.push(item);
    }
  }
  report.push({ file: mod.file, functions: fnCount });
}

// Dritter Pass: Fixpunkt fuer async/await berechnen und (await ...) einsetzen
const { asyncFuncNames, asyncMethodNames } = computeAsyncFixpoint(allFunctions);

for (const fn of allFunctions) {
  if (fn.isAsync) {
    fn.finalBody = fn.transformedBody.map((line) => insertAwaitsInLine(line, asyncFuncNames, asyncMethodNames));
  } else {
    fn.finalBody = fn.transformedBody;
  }
}

// -----------------------------------------------------------------------------
// 9. Code-Generierung fuer game.js
// -----------------------------------------------------------------------------

const outLines = [];
outLines.push('// GENERIERT von tools/ags2js.mjs aus game/*.ash und game/*.asc.');
outLines.push('// NICHT VON HAND AENDERN.');
outLines.push('');
outLines.push('const __div = (a, b) => Math.trunc((Number(a) || 0) / (Number(b) || 1));');
outLines.push('');
outLines.push('export function registerGame(engine) {');
outLines.push('  const G = globalThis;');
outLines.push('');

// 9a) #define und enum Konstanten
outLines.push('  // --- #define & enum Konstanten ---');
for (const [k, v] of Object.entries(definesMap)) {
  if (/^-?\d+(\.\d+)?$/.test(v) || /^0x[0-9a-fA-F]+$/.test(v) || /^".*"$/.test(v)) {
    outLines.push(`  const ${k} = ${v}; G.${k} = ${k};`);
  } else if (/^'.'$/.test(v)) {
    const code = v.charCodeAt(1);
    outLines.push(`  const ${k} = ${code}; G.${k} = ${k};`);
  }
}
for (const [k, v] of Object.entries(enumsMap)) {
  outLines.push(`  const ${k} = ${JSON.stringify(v)}; G.${k} = ${k};`);
}
outLines.push('');

// 9b) Struct-Fabriken und statische Struct-Container
outLines.push('  // --- Struct-Fabriken & Statische Struct-Objekte ---');
for (const st of STRUCT_TYPES) {
  const info = structsMap[st];
  const fieldInits = (info?.fields || []).map((f) => {
    const defVal = defaultInitForType(f.baseType, f.isPointer, f.arraySize);
    return `${f.name}: ${defVal}`;
  });
  outLines.push(`  function __create_${st}() { return { ${fieldInits.join(', ')} }; }`);
  outLines.push(`  const ${st} = G.${st} || {}; G.${st} = ${st};`);
}
outLines.push('');

// 9c) Globale Module (Skriptmodule ausser Raumskripten) ausgeben
const globalVarRegistry = new Map(); // varName -> defaultExpr
const lifecycleHooks = {
  game_start: [],
  repeatedly_execute: [],
  repeatedly_execute_always: [],
  on_event: [],
  on_key_press: [],
  on_mouse_click: []
};
const staticAttrSetterHooks = [];

for (const mod of modulesToCompile.filter((m) => !m.isRoom)) {
  outLines.push(`  // =========================================================================`);
  outLines.push(`  // Modul: ${mod.file}`);
  outLines.push(`  // =========================================================================`);

  for (const item of mod.items) {
    if (item.kind === 'var') {
      const { baseType, decls } = item.varDecl;
      for (const d of decls) {
        const initVal = d.initExpr !== null
          ? transformExpression(d.initExpr)
          : defaultInitForType(baseType, d.isPointer, d.arraySize);
        if (globalVarRegistry.has(d.name)) {
          outLines.push(`  ${d.name} = ${initVal};`);
        } else {
          globalVarRegistry.set(d.name, initVal);
          outLines.push(`  let ${d.name} = ${initVal};`);
          outLines.push(`  Object.defineProperty(G, '${d.name}', { get: () => ${d.name}, set: (v) => { ${d.name} = v; }, configurable: true, enumerable: true });`);
        }
      }
    } else if (item.kind === 'func') {
      const asyncKw = item.isAsync ? 'async ' : '';
      let emitName = item.jsFuncName;
      // Accessoren statischer Attribute mit gleichem Namen in mehreren Structs (set_slotSprite fuer CustomLoad UND CustomSave) duerfen sich nicht ueberschreiben
      if (item.staticStruct) emitName = `${item.jsFuncName}__${item.staticStruct}`;

      // Falls es ein mehrfach vorhandener Lifecycle-Hook ist (z. B. game_start in verbgui, optiongui, GlobalScript)
      if (lifecycleHooks[item.rawFuncName]) {
        emitName = `${mod.name}__${item.rawFuncName}`;
        lifecycleHooks[item.rawFuncName].push(emitName);
      }

      // Im Rumpf "this." bei Extender-Funktionen erhalten
      outLines.push(`  ${asyncKw}function ${emitName}(${item.params.join(', ')}) {`);
      for (const bLine of item.finalBody) {
        outLines.push(`    ${bLine}`);
      }
      outLines.push(`  }`);

      if (!lifecycleHooks[item.rawFuncName]) {
        outLines.push(`  G.${emitName} = ${emitName};`);
      }

      if (item.structName) {
        outLines.push(`  ${item.structName}.${item.rawFuncName} = ${emitName};`);
      }

      if (item.extenderType) {
        outLines.push(`  engine.registerExtender('${item.extenderType}', '${item.rawFuncName}', ${emitName});`);
      }

      if (item.staticStruct) {
        staticAttrSetterHooks.push({
          structName: item.staticStruct,
          funcName: item.rawFuncName,
          jsFuncName: emitName
        });
      }
    }
  }
  outLines.push('');
}

// Statische Attribute (seti_/geti_ und set_/get_) auf Structs verdrahten
outLines.push('  // --- Statische Struct-Attribute (Proxy/Getter/Setter) ---');
const indexedProps = new Map();
const scalarProps = new Map();

for (const h of staticAttrSetterHooks) {
  let m = /^(get|set)i_([A-Za-z_]\w*)$/.exec(h.funcName);
  if (m) {
    const key = `${h.structName}.${m[2]}`;
    if (!indexedProps.has(key)) indexedProps.set(key, { structName: h.structName, prop: m[2] });
    indexedProps.get(key)[m[1]] = h.jsFuncName;
    continue;
  }
  m = /^(get|set)_([A-Za-z_]\w*)$/.exec(h.funcName);
  if (m) {
    const key = `${h.structName}.${m[2]}`;
    if (!scalarProps.has(key)) scalarProps.set(key, { structName: h.structName, prop: m[2] });
    scalarProps.get(key)[m[1]] = h.jsFuncName;
  }
}

for (const info of indexedProps.values()) {
  outLines.push(
    `  ${info.structName}.${info.prop} = new Proxy([], { ` +
    `get(t, p) { const idx = Number(p); return Number.isFinite(idx) && typeof ${info.get || 'undefined'} === 'function' ? ${info.get}(idx) : t[p]; }, ` +
    `set(t, p, v) { const idx = Number(p); if (Number.isFinite(idx) && typeof ${info.set || 'undefined'} === 'function') ${info.set}(idx, v); else t[p] = v; return true; } ` +
    `});`
  );
}

for (const info of scalarProps.values()) {
  outLines.push(
    `  Object.defineProperty(${info.structName}, '${info.prop}', { ` +
    `get: () => ${info.get ? `${info.get}()` : 'undefined'}, ` +
    `set: (v) => { ${info.set ? `${info.set}(v);` : ''} }, configurable: true });`
  );
}
outLines.push('');

// Master-Lifecycle-Dispatcher
outLines.push('  // --- Master Lifecycle Dispatcher ---');
for (const [hookName, fnList] of Object.entries(lifecycleHooks)) {
  outLines.push(`  G.${hookName} = async function(...args) {`);
  for (const fn of fnList) {
    outLines.push(`    await ${fn}(...args);`);
  }
  outLines.push(`  };`);
}
outLines.push('');

// 9d) Raumskripte (room3.asc .. room33.asc) in jeweils eigenem Closure-Scope ausgeben
for (const mod of modulesToCompile.filter((m) => m.isRoom)) {
  outLines.push(`  // =========================================================================`);
  outLines.push(`  // Raum ${mod.roomNum}: ${mod.file}`);
  outLines.push(`  // =========================================================================`);
  outLines.push(`  engine.registerRoomScript(${mod.roomNum}, (() => {`);

  const exportedRoomFns = [];
  const roomLocalVars = [];

  for (const item of mod.items) {
    if (item.kind === 'var') {
      const { baseType, decls } = item.varDecl;
      for (const d of decls) {
        const initVal = d.initExpr !== null
          ? transformExpression(d.initExpr)
          : defaultInitForType(baseType, d.isPointer, d.arraySize);
        outLines.push(`    let ${d.name} = ${initVal};`);
        roomLocalVars.push(d.name);
      }
    } else if (item.kind === 'func') {
      const asyncKw = item.isAsync ? 'async ' : '';
      outLines.push(`    ${asyncKw}function ${item.jsFuncName}(${item.params.join(', ')}) {`);
      for (const bLine of item.finalBody) {
        outLines.push(`      ${bLine}`);
      }
      outLines.push(`    }`);
      exportedRoomFns.push(item.jsFuncName);
    }
  }

  outLines.push(`    return {`);
  for (const fnName of exportedRoomFns) {
    outLines.push(`      ${fnName},`);
  }
  outLines.push(`      __getState: () => ({ ${roomLocalVars.join(', ')} }),`);
  outLines.push(`      __setState: (__s) => { ${roomLocalVars.map((v) => `if (__s && '${v}' in __s) ${v} = __s.${v};`).join(' ')} }`);
  outLines.push(`    };`);
  outLines.push(`  })());`);
  outLines.push('');
}

// 9e) Zustandssicherung (fuer Spielstaende in localStorage)
const allGlobalVarNames = Array.from(globalVarRegistry.keys());
outLines.push('  // --- Spielstand-Serialisierung aller globalen Variablen ---');
outLines.push('  engine.captureGlobalVariables = () => {');
outLines.push('    const snap = {};');
outLines.push(`    const raw = { ${allGlobalVarNames.join(', ')} };`);
outLines.push('    for (const [k, v] of Object.entries(raw)) {');
outLines.push('      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") snap[k] = v;');
outLines.push('      else if (Array.isArray(v) && v.every((x) => typeof x === "number" || typeof x === "boolean" || typeof x === "string")) snap[k] = [...v];');
outLines.push('    }');
outLines.push('    return snap;');
outLines.push('  };');
outLines.push('  engine.restoreGlobalVariables = (snap) => {');
outLines.push('    if (!snap) return;');
outLines.push('    for (const [k, v] of Object.entries(snap)) {');
outLines.push('      if (k in G) G[k] = Array.isArray(v) ? [...v] : v;');
outLines.push('    }');
outLines.push('  };');
outLines.push('}');

const finalJs = outLines.join('\n') + '\n';
fs.writeFileSync(outPath, finalJs, 'utf8');

// -----------------------------------------------------------------------------
// 10. Selbstpruefung: Keine uebrig gebliebenen AGS-Typen & `node --check`
// -----------------------------------------------------------------------------

const typeCheckList = Array.from(AGS_TYPES).filter((t) => t !== 'const');
const leftoverLines = [];
const jsLines = finalJs.split('\n');

for (let idx = 0; idx < jsLines.length; idx++) {
  const t = jsLines[idx].trim();
  if (!t || t.startsWith('//')) continue;
  const m = /^([A-Za-z_]\w*)\s*(\*+)?\s+([A-Za-z_]\w*)\s*(=|;|\[|,)/.exec(t);
  if (m && typeCheckList.includes(m[1])) {
    leftoverLines.push({ line: idx + 1, text: t });
  }
}

const syntaxCheck = spawnSync(process.execPath, ['--check', outPath], { encoding: 'utf8' });

console.log('=== ags2js.mjs Bericht ===');
for (const r of report) {
  console.log(`  ${r.file.padEnd(20)} : ${String(r.functions).padStart(3)} Funktionen`);
}
console.log(`  Gesamt-Funktionen    : ${allFunctions.length} (davon ${allFunctions.filter((f) => f.isAsync).length} async)`);
console.log(`  Globale Variablen    : ${allGlobalVarNames.length}`);
console.log(`  Nicht uebersetzte Typ-Zeilen: ${leftoverLines.length}`);

if (leftoverLines.length > 0) {
  for (const l of leftoverLines.slice(0, 10)) {
    console.error(`  [FEHLER Zeile ${l.line}] ${l.text}`);
  }
  process.exit(1);
}

if (syntaxCheck.status !== 0) {
  console.error('[FEHLER] node --check game.js fehlgeschlagen:\n' + syntaxCheck.stderr);
  process.exit(1);
} else {
  console.log('  Syntaxcheck (node --check game.js): OK (0 Fehler)');
}
