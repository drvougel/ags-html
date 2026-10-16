// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = path.join(PKG, 'bin', 'ags-html.mjs');

// Kleines AGS-Projekt in einem Temp-Ordner anlegen
export function miniProject(extraConfig = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ags-html-test-'));
  fs.mkdirSync(path.join(dir, 'game'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'game', 'GlobalScript.ash'), '#define MAXHP 10\nimport int Twice(int v);\nexport Twice;\n');
  fs.writeFileSync(path.join(dir, 'game', 'GlobalScript.asc'),
    'int counter;\n' +
    'int Twice(int v) { return v * 2; }\n' +
    'function game_start() {\n  counter = 7 / 2;\n  counter /= 2;\n  float f = IntToFloat(7) / 2.0;\n  cEgo.SpeechColor = Game.GetColorFromRGB(10, 20, 30);\n}\n' +
    'function on_key_press(eKeyCode k) {\n  cEgo.Say("hi");\n}\n');
  fs.writeFileSync(path.join(dir, 'game', 'Game.agf'),
    '<?xml version="1.0" encoding="utf-8"?>\n<Game>\n  <PlayerCharacter>0</PlayerCharacter>\n  <Characters>\n    <Character>\n      <ID>0</ID>\n      <ScriptName>cEgo</ScriptName>\n      <RealName>Ego</RealName>\n      <NormalView>1</NormalView>\n    </Character>\n  </Characters>\n  <InventoryItems>\n    <InventoryItem>\n      <ID>1</ID>\n      <Name>iKey</Name>\n      <Description>Key</Description>\n    </InventoryItem>\n  </InventoryItems>\n</Game>\n');
  fs.writeFileSync(path.join(dir, 'ags-html.config.json'), JSON.stringify({
    page: { title: 'Mini', lang: 'en' },
    rooms: [{ number: 1, slug: 'start', title: 'Start', spawn: [10, 20] }],
    ...extraConfig
  }));
  return dir;
}

export function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}
