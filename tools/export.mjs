#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
//
// ags-html export: liest ein AGS-3.6-Projekt (Game.agf, GlobalScript.asc/.ash, optionale Raum-Spezifikationen,
// Sprites, Sprache) und schreibt <outDir>/data/*.json fuer die HTML5-Engine.
// Aufruf: node tools/export.mjs [--config ags-html.config.json]
// Spielspezifisches (Sprite-Slots, Figuren-Sprecher, Raumliste, Sprachpakete, Hinweise) kommt aus der
// Konfiguration und optionalen Hooks (cfg.hooks, siehe docs/HOOKS.md).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, loadHooks } from './config.mjs';

const { cfg, root } = loadConfig();
const hooks = await loadHooks(cfg, root);
const outDir = path.resolve(root, cfg.outDir, 'data');
fs.mkdirSync(outDir, { recursive: true });
const RES = cfg.resolution;

// -----------------------------------------------------------------------------
// Hilfsfunktionen: Dateisystem, XML-Parser & Bildgroessen
// -----------------------------------------------------------------------------

function exists(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(root, relPath));
}

function readText(relPath) {
  const p = path.join(root, relPath);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relPath, fallback = null) {
  const txt = readText(relPath);
  if (!txt) return fallback;
  try {
    return JSON.parse(txt);
  } catch (err) {
    console.warn(`[WARN] Konnte JSON nicht parsen: ${relPath} (${err.message})`);
    return fallback;
  }
}

function writeJson(fileName, data) {
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function unescapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function getTagValue(xml, tag, defVal = '') {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(xml);
  if (!m) return defVal;
  return unescapeXml(m[1].trim());
}

function getAllBlocks(xml, tag) {
  const results = [];
  const openToken = `<${tag}`;
  const closeToken = `</${tag}>`;
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(openToken, pos);
    if (start < 0) break;
    const nextChar = xml[start + openToken.length];
    if (nextChar !== '>' && nextChar !== ' ' && nextChar !== '\t' && nextChar !== '\r' && nextChar !== '\n' && nextChar !== '/') {
      pos = start + openToken.length;
      continue;
    }
    const openEnd = xml.indexOf('>', start);
    if (openEnd < 0) break;
    if (xml[openEnd - 1] === '/') {
      results.push({ attrs: xml.slice(start + openToken.length, openEnd - 1).trim(), inner: '' });
      pos = openEnd + 1;
      continue;
    }
    // Verschachtelte gleichnamige Tags sauber behandeln (z. B. <SpriteFolder>, <GUIMain>)
    let depth = 1;
    let searchPos = openEnd + 1;
    while (depth > 0 && searchPos < xml.length) {
      const nextOpen = xml.indexOf(openToken, searchPos);
      const nextClose = xml.indexOf(closeToken, searchPos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const nc = xml[nextOpen + openToken.length];
        const oe = xml.indexOf('>', nextOpen);
        if ((nc === '>' || nc === ' ' || nc === '\r' || nc === '\n') && oe > nextOpen && xml[oe - 1] !== '/') {
          depth++;
        }
        searchPos = oe > nextOpen ? oe + 1 : nextOpen + openToken.length;
      } else {
        depth--;
        if (depth === 0) {
          results.push({
            attrs: xml.slice(start + openToken.length, openEnd).trim(),
            inner: xml.slice(openEnd + 1, nextClose)
          });
        }
        searchPos = nextClose + closeToken.length;
      }
    }
    pos = searchPos;
  }
  return results;
}

function parseAttrs(attrStr) {
  const out = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    out[m[1]] = unescapeXml(m[2]);
  }
  return out;
}

// Liest Bildabmessungen direkt aus PNG/GIF/JPEG-Header
function readImageDimensions(relPath) {
  if (!relPath) return null;
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  try {
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    if (bytesRead >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (bytesRead >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
  } catch {
    // ignorieren
  }
  return null;
}

// Wandelt AGS 16-Bit RGB565 / 32-Bit Farbnummer oder RGB-Tripel in Hex um
function agsColorToHex(num) {
  const n = Number(num) || 0;
  if (n === 65535) return '#ffffff';
  if (n === 0) return '#000000';
  const r = ((n >> 11) & 0x1f) << 3;
  const g = ((n >> 5) & 0x3f) << 2;
  const b = (n & 0x1f) << 3;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, '0')).join('');
}

function rgbToAgsColor(r, g, b) {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

// -----------------------------------------------------------------------------
// 1. Game.agf & GlobalScript.asc/.ash einlesen
// -----------------------------------------------------------------------------

const agfXml = readText(cfg.agf);
if (!agfXml) {
  console.error(`[FEHLER] ${cfg.agf} nicht gefunden!`);
  process.exit(1);
}
const globalAsc = readText(`${cfg.gameDir}/GlobalScript.asc`);
const globalAsh = readText(`${cfg.gameDir}/GlobalScript.ash`);

// #define Konstanten aus GlobalScript.ash extrahieren
const defines = {};
for (const line of globalAsh.split(/\r?\n/)) {
  const m = /^#define\s+([A-Za-z0-9_]+)\s+(-?\d+)/.exec(line.trim());
  if (m) defines[m[1]] = Number(m[2]);
}

// SpeechColors aus GlobalScript.asc (cX.SpeechColor = Game.GetColorFromRGB(r, g, b))
const scriptSpeechColors = {};
{
  const re = /\b(c[A-Za-z0-9_]+)\.SpeechColor\s*=\s*Game\.GetColorFromRGB\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(globalAsc)) !== null) {
    const [, charName, r, g, b] = m;
    scriptSpeechColors[charName] = {
      r: Number(r),
      g: Number(g),
      b: Number(b),
      hex: rgbToHex(r, g, b),
      agsColor: rgbToAgsColor(Number(r), Number(g), Number(b))
    };
  }
}

// optionale Figuren-Metadaten (Sprecher-Schluessel -> { color })
const castData = cfg.castFile ? readJson(cfg.castFile, {}) : {};

// -----------------------------------------------------------------------------
// 2. Sprites & Views sammeln (aus Game.agf + Hook "sprites")
// -----------------------------------------------------------------------------

const spriteMap = {}; // slot -> { slot, path, width, height, source }

function registerSprite(slot, relPath, source = '') {
  const s = Number(slot);
  if (!Number.isFinite(s) || !relPath) return;
  let normPath = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  // Falls Pfad relativ zu game/ angegeben ist (z. B. "assets/gui/...")
  if (!exists(normPath) && exists('game/' + normPath)) {
    normPath = 'game/' + normPath;
  }
  const dims = readImageDimensions(normPath) || spriteMap[s]?.dims || null;
  spriteMap[s] = {
    slot: s,
    path: normPath,
    exists: exists(normPath),
    width: dims ? dims.width : (spriteMap[s]?.width || 0),
    height: dims ? dims.height : (spriteMap[s]?.height || 0),
    source: source || spriteMap[s]?.source || 'repo'
  };
}

// 2a) Sprites aus Game.agf <Sprites>
for (const spBlock of getAllBlocks(agfXml, 'Sprite')) {
  const attrs = parseAttrs(spBlock.attrs);
  const slot = Number(attrs.Slot);
  const w = Number(attrs.Width) || 0;
  const h = Number(attrs.Height) || 0;
  const fileName = getTagValue(spBlock.inner, 'FileName', '');
  if (fileName) {
    registerSprite(slot, fileName, 'Game.agf');
  }
  if (spriteMap[slot]) {
    if (!spriteMap[slot].width && w) spriteMap[slot].width = w;
    if (!spriteMap[slot].height && h) spriteMap[slot].height = h;
  } else {
    spriteMap[slot] = { slot, path: null, exists: false, width: w, height: h, source: 'Game.agf' };
  }
}

// Hook "sprites": weitere Sprite-Slots registrieren (Dateien ausserhalb der Game.agf, z. B. aus Import-Skripten)
const hookCtx = { root, cfg, fs, path, pathToFileURL, exists, readText, readJson, readImageDimensions, registerSprite, spriteMap, castData, agfXml, defines };
if (typeof hooks.sprites === 'function') await hooks.sprites(hookCtx);

// 2h) Kontaktdaten / Metadaten aus <spriteSheetsDir>/*/sprites.json sammeln (optional)
const spriteSheets = {};
if (cfg.spriteSheetsDir) {
  const s2Root = path.join(root, cfg.spriteSheetsDir);
  if (fs.existsSync(s2Root)) {
    for (const entry of fs.readdirSync(s2Root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sjRel = `${cfg.spriteSheetsDir}/${entry.name}/sprites.json`;
      const contactRel = `${cfg.spriteSheetsDir}/${entry.name}/contact.png`;
      const sj = readJson(sjRel);
      if (sj) {
        spriteSheets[entry.name] = {
          ...sj,
          spritesJson: sjRel,
          contactPng: exists(contactRel) ? contactRel : null
        };
      }
    }
  }
}

// 2i) Views aus Game.agf <Views>
const views = {};
for (const vBlock of getAllBlocks(agfXml, 'View')) {
  const id = Number(getTagValue(vBlock.inner, 'ID', '0'));
  const name = getTagValue(vBlock.inner, 'Name', '');
  const loops = {};
  for (const lBlock of getAllBlocks(vBlock.inner, 'Loop')) {
    const loopId = Number(getTagValue(lBlock.inner, 'ID', '0'));
    const runNextLoop = getTagValue(lBlock.inner, 'RunNextLoop', 'False') === 'True';
    const frames = [];
    for (const fBlock of getAllBlocks(lBlock.inner, 'ViewFrame')) {
      const frameId = Number(getTagValue(fBlock.inner, 'ID', '0'));
      const imageSlot = Number(getTagValue(fBlock.inner, 'Image', '0'));
      const delay = Number(getTagValue(fBlock.inner, 'Delay', '0'));
      const flipped = getTagValue(fBlock.inner, 'Flipped', 'False') === 'True';
      const sound = Number(getTagValue(fBlock.inner, 'Sound', '0'));
      frames.push({
        id: frameId,
        sprite: imageSlot,
        delay,
        flipped,
        sound
      });
    }
    loops[loopId] = { id: loopId, runNextLoop, frames };
  }
  views[id] = { id, name, loops };
}

// -----------------------------------------------------------------------------
// 3. Figuren (data/characters.json)
// -----------------------------------------------------------------------------

// Sprecher-Schluessel je Figur (Sprachzeilen/cast): Hook "speakerKeys" { cScriptName: 'key' }, sonst Skriptname ohne «c», klein
const SPEAKER_BY_CHAR = hooks.speakerKeys || {};

const playerCharId = Number(getTagValue(agfXml, 'PlayerCharacter', '0'));
const characters = [];

for (const cBlock of getAllBlocks(agfXml, 'Character')) {
  const inner = cBlock.inner;
  const id = Number(getTagValue(inner, 'ID', '0'));
  const scriptName = getTagValue(inner, 'ScriptName', '');
  const realName = getTagValue(inner, 'RealName', '');
  const normalView = Number(getTagValue(inner, 'NormalView', '0'));
  const speechView = Number(getTagValue(inner, 'SpeechView', '0'));
  const idleView = Number(getTagValue(inner, 'IdleView', '0'));
  const thinkingView = Number(getTagValue(inner, 'ThinkingView', '0'));
  const blinkingView = Number(getTagValue(inner, 'BlinkingView', '0'));
  const startingRoom = Number(getTagValue(inner, 'StartingRoom', '0'));
  const startX = Number(getTagValue(inner, 'StartX', '0'));
  const startY = Number(getTagValue(inner, 'StartY', '0'));
  const clickable = getTagValue(inner, 'Clickable', 'True') === 'True';
  const solid = getTagValue(inner, 'Solid', 'False') === 'True';
  const movementSpeed = Number(getTagValue(inner, 'MovementSpeed', '3'));
  const movementSpeedX = Number(getTagValue(inner, 'MovementSpeedX', '0'));
  const movementSpeedY = Number(getTagValue(inner, 'MovementSpeedY', '0'));
  const animationDelay = Number(getTagValue(inner, 'AnimationDelay', '4'));
  const speechAnimationDelay = Number(getTagValue(inner, 'SpeechAnimationDelay', '5'));
  const agfSpeechColor = Number(getTagValue(inner, 'SpeechColor', '65535'));
  const useRoomAreaScaling = getTagValue(inner, 'UseRoomAreaScaling', 'False') === 'True';
  const adjustSpeedWithScaling = getTagValue(inner, 'AdjustSpeedWithScaling', 'False') === 'True';
  const movementLinkedToAnimation = getTagValue(inner, 'MovementLinkedToAnimation', 'True') === 'True';
  const turnBeforeWalking = getTagValue(inner, 'TurnBeforeWalking', 'True') === 'True';
  const diagonalLoops = getTagValue(inner, 'DiagonalLoops', 'False') === 'True';

  const events = {};
  for (const evBlock of getAllBlocks(inner, 'Event')) {
    const ea = parseAttrs(evBlock.attrs);
    if (evBlock.inner.trim()) {
      events[Number(ea.Index)] = evBlock.inner.trim();
    }
  }

  const speakerKey = SPEAKER_BY_CHAR[scriptName] || scriptName.replace(/^c/, '').toLowerCase();
  const scInfo = scriptSpeechColors[scriptName];
  const castInfo = castData[speakerKey] || {};
  const speechColorHex = scInfo ? scInfo.hex : (agfSpeechColor !== 65535 ? agsColorToHex(agfSpeechColor) : (castInfo.color || '#ffffff'));
  const speechColorAgs = scInfo ? scInfo.agsColor : agfSpeechColor;

  characters.push({
    id,
    scriptName,
    realName,
    speakerKey,
    isPlayer: id === playerCharId,
    normalView,
    speechView,
    idleView,
    thinkingView,
    blinkingView,
    startingRoom,
    startX,
    startY,
    clickable,
    solid,
    movementSpeed,
    movementSpeedX,
    movementSpeedY,
    animationDelay,
    speechAnimationDelay,
    speechColor: speechColorAgs,
    speechColorHex,
    useRoomAreaScaling,
    adjustSpeedWithScaling,
    movementLinkedToAnimation,
    turnBeforeWalking,
    diagonalLoops,
    anyClick: events[4] || `${scriptName}_AnyClick`,
    events
  });
}

// Hook "extraCharacters": Figuren, die (noch) nicht in der Game.agf stehen ([{ scriptName, realName, speakerKey, color, clickable }])
const E4_EXTRA_CHARS = hooks.extraCharacters || [];
for (const ec of E4_EXTRA_CHARS) {
  if (!characters.some((c) => c.scriptName === ec.scriptName)) {
    const nextId = characters.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    characters.push({
      id: nextId,
      scriptName: ec.scriptName,
      realName: ec.realName,
      speakerKey: ec.speakerKey,
      isPlayer: false,
      normalView: 30,
      speechView: 0,
      idleView: 0,
      thinkingView: 0,
      blinkingView: 0,
      startingRoom: 2,
      startX: 320,
      startY: 216,
      clickable: ec.clickable,
      solid: false,
      movementSpeed: 6,
      movementSpeedX: 3,
      movementSpeedY: 0,
      animationDelay: 3,
      speechAnimationDelay: 5,
      speechColor: 65535,
      speechColorHex: castData[ec.speakerKey]?.color || ec.color,
      useRoomAreaScaling: false,
      adjustSpeedWithScaling: true,
      movementLinkedToAnimation: true,
      turnBeforeWalking: true,
      diagonalLoops: false,
      anyClick: `${ec.scriptName}_AnyClick`,
      events: ec.clickable ? { 4: `${ec.scriptName}_AnyClick` } : {}
    });
  }
}

// -----------------------------------------------------------------------------
// 4. Inventar (html/data/inventory.json)
// -----------------------------------------------------------------------------

const inventoryItems = [];
for (const iBlock of getAllBlocks(agfXml, 'InventoryItem')) {
  const inner = iBlock.inner;
  const id = Number(getTagValue(inner, 'ID', '0'));
  const scriptName = getTagValue(inner, 'Name', '');
  const name = getTagValue(inner, 'Description', '');
  const graphic = Number(getTagValue(inner, 'Image', '0'));
  const cursorGraphic = Number(getTagValue(inner, 'CursorImage', '0'));
  const hotspotX = Number(getTagValue(inner, 'HotspotX', '0'));
  const hotspotY = Number(getTagValue(inner, 'HotspotY', '0'));
  const playerStartsWithItem = getTagValue(inner, 'PlayerStartsWithItem', 'False') === 'True';
  const events = {};
  for (const evBlock of getAllBlocks(inner, 'Event')) {
    const ea = parseAttrs(evBlock.attrs);
    if (evBlock.inner.trim()) {
      events[Number(ea.Index)] = evBlock.inner.trim();
    }
  }
  inventoryItems.push({
    id,
    scriptName,
    name,
    graphic,
    cursorGraphic,
    hotspotX,
    hotspotY,
    playerStartsWithItem,
    otherClick: events[4] || events[0] || `${scriptName}_OtherClick`,
    events
  });
}

// -----------------------------------------------------------------------------
// 5. GUIs, Verbleiste, Fonts & Cursor (html/data/gui.json)
// -----------------------------------------------------------------------------

const guis = [];
for (const gBlock of getAllBlocks(agfXml, 'GUIMain')) {
  const normalBlock = getAllBlocks(gBlock.inner, 'NormalGUI')[0];
  if (!normalBlock) continue;
  const ni = normalBlock.inner;
  const guiObj = {
    id: Number(getTagValue(ni, 'ID', '0')),
    name: getTagValue(ni, 'Name', ''),
    left: Number(getTagValue(ni, 'Left', '0')),
    top: Number(getTagValue(ni, 'Top', '0')),
    width: Number(getTagValue(ni, 'Width', '0')),
    height: Number(getTagValue(ni, 'Height', '0')),
    backgroundColor: Number(getTagValue(ni, 'BackgroundColor', '0')),
    backgroundGraphic: Number(getTagValue(ni, 'BackgroundImage', '0')),
    clickable: getTagValue(ni, 'Clickable', 'True') === 'True',
    visible: getTagValue(ni, 'Visible', 'True') === 'True',
    popupStyle: getTagValue(ni, 'PopupStyle', 'Normal'),
    transparency: Number(getTagValue(ni, 'Transparency', '0')),
    zOrder: Number(getTagValue(ni, 'ZOrder', '0')),
    controls: []
  };

  const controlsBlock = getAllBlocks(gBlock.inner, 'Controls')[0];
  if (controlsBlock) {
    for (const type of ['GUIButton', 'GUILabel', 'GUIInventory', 'GUISlider']) {
      for (const cBlock of getAllBlocks(controlsBlock.inner, type)) {
        const ci = cBlock.inner;
        const ctrl = {
          type,
          id: Number(getTagValue(ci, 'ID', '0')),
          name: getTagValue(ci, 'Name', ''),
          left: Number(getTagValue(ci, 'Left', '0')),
          top: Number(getTagValue(ci, 'Top', '0')),
          width: Number(getTagValue(ci, 'Width', '0')),
          height: Number(getTagValue(ci, 'Height', '0')),
          visible: getTagValue(ci, 'Visible', 'True') === 'True',
          enabled: getTagValue(ci, 'Enabled', 'True') === 'True',
          clickable: getTagValue(ci, 'Clickable', 'True') === 'True',
          zOrder: Number(getTagValue(ci, 'ZOrder', '0'))
        };
        if (type === 'GUIButton') {
          ctrl.text = getTagValue(ci, 'Text', '');
          ctrl.font = Number(getTagValue(ci, 'Font', '0'));
          ctrl.textColor = Number(getTagValue(ci, 'TextColor', '0'));
          ctrl.normalGraphic = Number(getTagValue(ci, 'Image', '0'));
          ctrl.mouseOverGraphic = Number(getTagValue(ci, 'MouseoverImage', '0'));
          ctrl.pushedGraphic = Number(getTagValue(ci, 'PushedImage', '0'));
          ctrl.onClick = getTagValue(ci, 'OnClick', '');
        } else if (type === 'GUILabel') {
          ctrl.text = getTagValue(ci, 'Text', '');
          ctrl.font = Number(getTagValue(ci, 'Font', '0'));
          ctrl.textColor = Number(getTagValue(ci, 'TextColor', '0'));
          ctrl.textColorHex = agsColorToHex(ctrl.textColor);
          ctrl.textAlignment = getTagValue(ci, 'TextAlignment', 'Left');
        } else if (type === 'GUIInventory') {
          ctrl.itemWidth = Number(getTagValue(ci, 'ItemWidth', '58'));
          ctrl.itemHeight = Number(getTagValue(ci, 'ItemHeight', '36'));
        } else if (type === 'GUISlider') {
          ctrl.minValue = Number(getTagValue(ci, 'MinValue', '0'));
          ctrl.maxValue = Number(getTagValue(ci, 'MaxValue', '100'));
          ctrl.value = Number(getTagValue(ci, 'Value', '50'));
          ctrl.onChange = getTagValue(ci, 'OnChange', '');
        }
        guiObj.controls.push(ctrl);
      }
    }
    guiObj.controls.sort((a, b) => a.id - b.id);
  }
  guis.push(guiObj);
}

const fonts = [];
for (const fBlock of getAllBlocks(agfXml, 'Font')) {
  const fi = fBlock.inner;
  fonts.push({
    id: Number(getTagValue(fi, 'ID', '0')),
    name: getTagValue(fi, 'Name', ''),
    pointSize: Number(getTagValue(fi, 'PointSize', '12')),
    sourceFilename: getTagValue(fi, 'SourceFilename', ''),
    outlineStyle: getTagValue(fi, 'OutlineStyle', 'None'),
    outlineThickness: Number(getTagValue(fi, 'AutoOutlineThickness', '1'))
  });
}

const cursors = [];
for (const curBlock of getAllBlocks(agfXml, 'MouseCursor')) {
  const ci = curBlock.inner;
  cursors.push({
    id: Number(getTagValue(ci, 'ID', '0')),
    name: getTagValue(ci, 'Name', ''),
    graphic: Number(getTagValue(ci, 'Image', '0')),
    hotspotX: Number(getTagValue(ci, 'HotspotX', '0')),
    hotspotY: Number(getTagValue(ci, 'HotspotY', '0')),
    standardMode: getTagValue(ci, 'StandardMode', 'False') === 'True'
  });
}

// Hook "verbBar": optionale Beschreibung der Verbleiste (wird unveraendert nach gui.json geschrieben)
const verbBar = hooks.verbBar ?? null;

// -----------------------------------------------------------------------------
// 6. Raeume (data/rooms.json)
// -----------------------------------------------------------------------------

// Raumliste: Hook "rooms"(ctx) oder cfg.rooms: [{ number, slug, title?, desc?, episode?, spawn? }]
// Dateien je Raum (alle optional): <roomsDir>/<slug>.room.json, .bg.png, .walk.png, .hot.png, .wb.png
const ROOM_INDEX = typeof hooks.rooms === 'function' ? await hooks.rooms(hookCtx) : cfg.rooms;
// Hook "roomMeta"(ctx) -> { [number]: { title, spawn, ... } } ueberschreibt Titel/Startpunkt
const extraRoomMeta = typeof hooks.roomMeta === 'function' ? (await hooks.roomMeta(hookCtx)) || {} : {};

// Skalierungs-Regeln pro Raum: Hook "roomScaling"(roomNum); Standard = keine Skalierung
function getRoomScalingSpec(roomNum) {
  if (typeof hooks.roomScaling === 'function') {
    const s = hooks.roomScaling(roomNum);
    if (s) return s;
  }
  return { y0: 0, h0: 175, y1: RES.sceneHeight, h1: 175, baseHeight: 175 };
}

// Deterministische Masken-Farbpalette (Index 0..31)
const maskPalette = Array.from({ length: 32 }, (_, i) =>
  i === 0 ? [0, 0, 0] : [(i * 97) % 200 + 55, (i * 57) % 200 + 55, (i * 137) % 200 + 55]
);

const rooms = {};
for (const entry of ROOM_INDEX) {
  const specRel = `${cfg.roomsDir}/${entry.slug}.room.json`;
  const roomSpec = readJson(specRel, null);
  const meta = extraRoomMeta[entry.number] || {};
  const bgPath = roomSpec?.background || (exists(`${cfg.roomsDir}/${entry.slug}.bg.png`) ? `${cfg.roomsDir}/${entry.slug}.bg.png` : (cfg.runtime?.fallbackRoom?.background || null));
  const walkPath = roomSpec?.walkable || `${cfg.roomsDir}/${entry.slug}.walk.png`;
  const hotPath = roomSpec?.hotspots?.png || `${cfg.roomsDir}/${entry.slug}.hot.png`;
  const wbPath = roomSpec?.walkbehind || (exists(`${cfg.roomsDir}/${entry.slug}.wb.png`) ? `${cfg.roomsDir}/${entry.slug}.wb.png` : null);
  const dims = readImageDimensions(bgPath) || readImageDimensions(walkPath) || { width: RES.width, height: RES.height };

  const hotspots = (roomSpec?.hotspots?.list || []).map((h) => ({
    index: h.index,
    name: h.name,
    script: h.script,
    walkTo: h.walkTo || [0, 0],
    events: h.events || ['AnyClick'],
    anyClick: `${h.script}_AnyClick`
  }));

  rooms[entry.number] = {
    number: entry.number,
    episode: entry.episode,
    slug: entry.slug,
    title: meta.title || entry.desc || entry.title,
    width: dims.width,
    height: dims.height,
    sceneHeight: RES.sceneHeight,
    spawn: meta.spawn || entry.spawn,
    background: bgPath,
    walkable: walkPath,
    hotspotMask: hotPath,
    walkbehind: wbPath,
    walkbehindBaselines: roomSpec?.walkbehindBaselines || [],
    edges: roomSpec?.edges || { left: 0, right: dims.width - 3 },
    roomEvents: roomSpec?.roomEvents || ['Load', 'AfterFadeIn', 'RepExec'],
    scaling: getRoomScalingSpec(entry.number),
    hotspots
  };
}

// -----------------------------------------------------------------------------
// 7. Sprache & Texte (data/speech.json)
// -----------------------------------------------------------------------------

// Sprachpakete: Hook "speechPacks"(ctx) oder cfg.speechPacks:
//   [{ vox, mapFile, audioDirs: [...], extra?: { lineId: { char, n, speaker } } }]
// mapFile: JSON { lineId: { char, n, speaker } } (char = Skriptname der Figur, n = Nummer der Zeile in der Figur)
const SPEECH_SOURCES = typeof hooks.speechPacks === 'function' ? await hooks.speechPacks(hookCtx) : cfg.speechPacks;

function resolveMp3Path(lineId, preferredDirs) {
  const allDirs = [...preferredDirs, ...(cfg.speechFallbackDirs || [])];
  for (const d of allDirs) {
    const mp3 = `${d}/${lineId}.mp3`;
    if (exists(mp3)) return mp3;
  }
  return `${preferredDirs[0]}/${lineId}.mp3`;
}

const byChar = {}; // charScriptName -> { [n]: { id, mp3, speaker, vox } }
const byVox = {};
for (const src of SPEECH_SOURCES) byVox[src.vox] = {};
const byId = {};   // lineId -> { id, n, char, speaker, mp3, vox }

for (const src of SPEECH_SOURCES) {
  const mapObj = { ...(readJson(src.mapFile, {}) || {}), ...(src.extra || {}) };
  for (const [lineId, info] of Object.entries(mapObj)) {
    const charName = info.char;
    const n = Number(info.n);
    const mp3 = resolveMp3Path(lineId, src.audioDirs);
    const entry = {
      id: lineId,
      n,
      char: charName,
      speaker: info.speaker,
      mp3,
      vox: src.vox
    };
    byId[lineId] = entry;
    if (!byChar[charName]) byChar[charName] = {};
    byChar[charName][n] = entry;
    if (!byVox[src.vox]) byVox[src.vox] = {};
    if (!byVox[src.vox][charName]) byVox[src.vox][charName] = {};
    byVox[src.vox][charName][n] = entry;
  }
}

// -----------------------------------------------------------------------------
// 8. Hinweise (data/hints.json): Hook "hints"(ctx, { byId }) -> { hinweise: [], zusatz: {} }
// -----------------------------------------------------------------------------

const hintsData = typeof hooks.hints === 'function' ? await hooks.hints(hookCtx, { byId }) : { hinweise: [], zusatz: {} };
const hintsList = hintsData.hinweise || [];
const hintsZusatz = hintsData.zusatz || {};

// -----------------------------------------------------------------------------
// 9. Dateien nach <outDir>/data/*.json schreiben
// -----------------------------------------------------------------------------

writeJson('rooms.json', {
  resolution: RES,
  maskPalette,
  rooms
});

writeJson('characters.json', {
  playerCharacterId: playerCharId,
  cast: castData,
  characters
});

writeJson('views.json', {
  defines,
  spriteSheets,
  views,
  sprites: spriteMap
});

writeJson('inventory.json', {
  items: inventoryItems
});

writeJson('gui.json', {
  resolution: RES,
  fonts,
  cursors,
  verbBar,
  guis
});

// Nur byVox: Die Engine sucht Sprache nur im eigenen Sprachpaket (AGS: fehlt eine Zeile dort, bleibt es beim Text).
writeJson('speech.json', {
  byVox
});

// Musik: <musicFile> (Raum -> Stueck) unveraendert uebernehmen; der Bundler kopiert die referenzierten Dateien
{
  const musik = cfg.musicFile ? readJson(cfg.musicFile, { stuecke: {}, raeume: {} }) : { stuecke: {}, raeume: {} };
  for (const [name, s] of Object.entries(musik.stuecke || {})) if (!exists(s.datei)) console.warn(`[WARN] Musik «${name}»: Datei fehlt: ${s.datei}`);
  for (const [raum, name] of Object.entries(musik.raeume || {})) if (name && !musik.stuecke?.[name]) console.warn(`[WARN] Musik Raum ${raum}: unbekanntes Stueck «${name}»`);
  writeJson('musik.json', musik);
}

writeJson('hints.json', {
  hinweise: hintsList,
  zusatz: hintsZusatz
});

// Laufzeit-Konfiguration (runtime/config.js liest sie vor dem Start)
writeJson('config.json', cfg.runtime || {});

if (typeof hooks.afterExport === 'function') await hooks.afterExport(hookCtx, { rooms, characters, views, spriteMap, byId });

console.log(
  `Export nach ${path.relative(root, outDir).replace(/\\/g, '/')}/ abgeschlossen:\n` +
  `  - rooms.json:      ${Object.keys(rooms).length} Raeume\n` +
  `  - characters.json: ${characters.length} Figuren\n` +
  `  - views.json:      ${Object.keys(views).length} Views, ${Object.keys(spriteMap).length} Sprite-Slots\n` +
  `  - inventory.json:  ${inventoryItems.length} Inventar-Gegenstaende\n` +
  `  - gui.json:        ${guis.length} GUIs, ${fonts.length} Schriften, ${cursors.length} Cursor\n` +
  `  - speech.json:     ${Object.keys(byId).length} Sprachzeilen\n` +
  `  - hints.json:      ${hintsList.length} Hinweis-Eintraege`
);
