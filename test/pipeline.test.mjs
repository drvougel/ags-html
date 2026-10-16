// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { miniProject, cli } from './helpers.mjs';

test('translate: AGS-Mini-Skript wird zu gueltigem JavaScript mit ganzzahliger Division', () => {
  const dir = miniProject();
  const r = cli(['translate', '--config', path.join(dir, 'ags-html.config.json')], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const js = fs.readFileSync(path.join(dir, 'html', 'game.js'), 'utf8');
  assert.match(js, /game_start/);
  assert.match(js, /counter = __div\(7, 2\);/);          // a / b -> ganzzahlige Division
  assert.match(js, /counter = __idiv\(counter, 2\);/);   // a /= b (js-idiv)
  assert.match(js, /Twice/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('export: schreibt data/*.json inkl. config.json, Figuren, Inventar, Raeume', () => {
  const dir = miniProject({ runtime: { storagePrefix: 'mini' } });
  const r = cli(['export', '--config', path.join(dir, 'ags-html.config.json')], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'html', 'data', f), 'utf8'));
  assert.equal(d('config.json').storagePrefix, 'mini');
  assert.equal(d('characters.json').characters[0].scriptName, 'cEgo');
  assert.equal(d('characters.json').characters[0].speechColorHex, '#0a141e');   // aus Game.GetColorFromRGB(10, 20, 30)
  assert.equal(d('inventory.json').items[0].scriptName, 'iKey');
  assert.equal(d('rooms.json').rooms[1].title, 'Start');
  assert.deepEqual(d('rooms.json').rooms[1].spawn, [10, 20]);
  for (const f of ['views.json', 'gui.json', 'speech.json', 'hints.json', 'musik.json']) assert.ok(fs.existsSync(path.join(dir, 'html', 'data', f)), f);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build: komplette Seite mit Engine, index.html, game.js und Daten', () => {
  const dir = miniProject({ page: { title: 'Mini <Spiel>', lang: 'en', startText: 'Go' } });
  const site = path.join(dir, 'site');
  const r = cli(['build', site, '--config', path.join(dir, 'ags-html.config.json')], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of ['index.html', 'engine.js', 'ags-runtime.js', 'config.js', 'musik.js', 'spielstand.js', 'sw.js', 'game.js', 'data/rooms.json', 'data/config.json']) {
    assert.ok(fs.existsSync(path.join(site, 'html', f)), f);
  }
  const html = fs.readFileSync(path.join(site, 'html', 'index.html'), 'utf8');
  assert.match(html, /<title>Mini &lt;Spiel>/);
  assert.ok(!/\{\{\w+\}\}/.test(html), 'unersetzte Platzhalter');
  assert.ok(!/__REV__/.test(fs.readFileSync(path.join(site, 'html', 'sw.js'), 'utf8')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Hooks: Raumliste und Sprecher kommen aus dem Spielprojekt', () => {
  const dir = miniProject({ hooks: './hooks.mjs', rooms: [] });
  fs.writeFileSync(path.join(dir, 'hooks.mjs'), "export const speakerKeys = { cEgo: 'hero' };\nexport function rooms() { return [{ number: 7, slug: 'x', title: 'Sieben', spawn: [1, 2] }]; }\n");
  const r = cli(['export', '--config', path.join(dir, 'ags-html.config.json')], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'html', 'data', f), 'utf8'));
  assert.equal(d('rooms.json').rooms[7].title, 'Sieben');
  assert.equal(d('characters.json').characters[0].speakerKey, 'hero');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Konfiguration: "extends" legt eine Basis darunter', () => {
  const dir = miniProject({ extends: './base.json', runtime: { storagePrefix: 'child' } });
  fs.writeFileSync(path.join(dir, 'base.json'), JSON.stringify({ runtime: { storagePrefix: 'base', saveFormat: 'base-save' } }));
  const r = cli(['export', '--config', path.join(dir, 'ags-html.config.json')], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'html', 'data', 'config.json'), 'utf8'));
  assert.equal(c.storagePrefix, 'child');
  assert.equal(c.saveFormat, 'base-save');
  fs.rmSync(dir, { recursive: true, force: true });
});
