#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
//
// ags-html CLI:
//   ags-html export    [--config <datei>]            AGS-Projekt -> <outDir>/data/*.json
//   ags-html translate [--config <datei>]            AGS-Skripte -> <outDir>/game.js (inkl. Ganzzahl-Division)
//   ags-html bundle <site-dir> [--config <datei>]    Seite (index.html, Engine, game.js, data, Assets) nach <site-dir>
//   ags-html build <site-dir> [--config <datei>]     export + translate + bundle
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../tools/config.mjs';

const T = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const [cmd, ...rest] = process.argv.slice(2);
const USAGE = 'Aufruf: ags-html <export|translate|bundle|build> [<site-dir>] [--config ags-html.config.json]';

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(T, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

function translate(args) {
  const { cfg, root } = loadConfig(args);
  run('ags2js.mjs', args);
  const game = path.resolve(root, cfg.outDir, 'game.js');
  const floats = (cfg.floatNames || []).join(',');
  run('js-idiv.mjs', [game, ...(floats ? ['--float-names', floats] : [])]);
}

switch (cmd) {
  case 'export': run('export.mjs', rest); break;
  case 'translate': translate(rest); break;
  case 'bundle': run('bundle.mjs', rest); break;
  case 'build': run('export.mjs', rest); translate(rest); run('bundle.mjs', rest); break;
  default: console.error(USAGE); process.exit(cmd ? 1 : 2);
}
