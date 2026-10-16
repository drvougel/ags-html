// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
//
// Konfiguration eines Spielprojekts laden: ags-html.config.json (JSON, Kommentarzeilen "//" erlaubt).
// Alle Pfade in der Konfiguration sind relativ zum Ordner der Konfigurationsdatei (= Projektwurzel).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CONFIG = {
  gameDir: 'game',                     // Ordner mit Game.agf, *.asc, *.ash, roomN.asc
  agf: null,                           // Standard: <gameDir>/Game.agf
  outDir: 'html',                      // Ausgabe: <outDir>/data/*.json und <outDir>/game.js
  resolution: { width: 640, height: 360, sceneHeight: 260, guiTop: 260, guiHeight: 100 },
  scripts: {
    headerOrder: [],                   // .ash-Dateien, die zuerst gelesen werden (Rest alphabetisch)
    globalOrder: null,                 // .asc-Module in dieser Reihenfolge; null = alle ausser roomN.asc (GlobalScript.asc zuletzt)
    extraTypes: [],                    // zusaetzliche Typnamen (Structs/Enums aus eigenen Modulen)
    extraBlockingFuncs: [],            // globale Funktionen, die blockieren (-> async/await)
    extraBlockingMethods: []           // Methodennamen, die blockieren
  },
  floatNames: [],                      // Variablen-/Funktionsnamen, bei denen «/» echte Kommazahl-Division bleibt
  rooms: [],                           // [{ number, slug, title?, spawn?, ... }] (oder per hooks.rooms)
  roomsDir: 'art/rooms',               // <roomsDir>/<slug>.room.json|.bg.png|.walk.png|.hot.png|.wb.png
  musicFile: null,                     // Raum -> Musikstueck (siehe docs/CONFIG.md); null = keine Musik
  castFile: null,                      // optionale Figuren-Metadaten {speakerKey: {color}}
  speechPacks: [],                     // [{ vox, mapFile, audioDirs, ep? }] (oder per hooks.speech)
  hintsFile: null,                     // optionale Hinweis-Datei
  hooks: null,                         // Pfad zu einem ES-Modul mit optionalen Hooks (docs/HOOKS.md)
  runtime: {},                         // wird nach <outDir>/data/config.json geschrieben (siehe runtime/config.js)
  page: {                              // index.html-Vorlage
    lang: 'en',
    title: 'AGS Game',
    heading: '',                       // HTML ueber dem Startknopf (leer = Titel)
    startText: 'Click to start',
    loadingText: 'Loading …',
    rotateText: 'Rotate your phone for a bigger picture',
    titleImage: '',                    // Hintergrundbild der Startseite (Pfad relativ zur Seite, z. B. ../art/title.png)
    icon: '',
    fontFamily: 'monospace',
    fontFile: '',                      // optionale .ttf (relativ zur Seite)
    accent: '#f6e08a'
  },
  bundle: {
    engineDir: 'html',                 // Unterordner der Seite, in den Engine + game.js + data/ kommen
    roots: null,                       // Dateien aus den JSON-Daten nur mit diesen Pfadanfaengen kopieren (null = alle vorhandenen)
    copy: [],                          // [{ from, to }] zusaetzliche Dateien/Ordner (Projektwurzel -> Seitenwurzel)
    maxFileMB: 25
  }
};

function stripJsonComments(txt) {
  return txt.replace(/^﻿/, '').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

function merge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (!over || typeof over !== 'object') return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && base[k] && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)
      ? merge(base[k], v) : v;
  }
  return out;
}

// argv: Argumente nach dem Kommando; erkennt --config <datei> und --root <ordner>.
export function loadConfig(argv = process.argv.slice(2)) {
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const cfgArg = get('--config');
  const cfgFile = path.resolve(cfgArg || 'ags-html.config.json');
  let user = {};
  if (fs.existsSync(cfgFile)) {
    try { user = JSON.parse(stripJsonComments(fs.readFileSync(cfgFile, 'utf8'))); }
    catch (e) { throw new Error(`Konfiguration nicht lesbar: ${cfgFile} (${e.message})`); }
  } else if (cfgArg) {
    throw new Error(`Konfigurationsdatei nicht gefunden: ${cfgFile}`);
  }
  // "extends": Pfad (relativ zur Konfigurationsdatei) einer Basiskonfiguration, die unter diese gelegt wird
  const readExtends = (obj, dir, depth = 0) => {
    if (!obj.extends || depth > 5) return obj;
    const baseFile = path.resolve(dir, obj.extends);
    const base = JSON.parse(stripJsonComments(fs.readFileSync(baseFile, 'utf8')));
    // Pfade der Basis sind relativ zur Projektwurzel (= Ordner der Hauptkonfiguration), nicht zur Basisdatei
    return merge(readExtends(base, path.dirname(baseFile), depth + 1), { ...obj, extends: undefined });
  };
  user = readExtends(user, path.dirname(cfgFile));
  const rootArg = get('--root');
  const root = path.resolve(rootArg || path.dirname(cfgFile));
  const cfg = merge(DEFAULT_CONFIG, user);
  cfg.agf = cfg.agf || `${cfg.gameDir}/Game.agf`;
  return { cfg, root, cfgFile };
}

export async function loadHooks(cfg, root) {
  if (!cfg.hooks) return {};
  const file = path.resolve(root, cfg.hooks);
  if (!fs.existsSync(file)) throw new Error(`Hook-Modul nicht gefunden: ${file}`);
  return await import(pathToFileURL(file).href);
}
