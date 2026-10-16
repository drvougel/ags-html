// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// Haupt-Engine: verbindet data/*.json, ags-runtime.js und das uebersetzte game.js
import { CFG } from './config.js';

import {
  W, H, SCENE_H, GUI_TOP, GUI_H, GAME_SPEED, AGS_CONSTANTS,
  agsColorToCss, fontSpec, wrapLines, drawOutlinedText,
  AGSDrawingSurface, AGSDynamicSprite, AGSOverlay,
  AGSCharacter, AGSHotspot, AGSObject, AGSInventoryItem,
  AGSGUI, installAgsGlobalApi, setupTumbleweedDefaults
} from './ags-runtime.js';
import { Musik } from './musik.js';
import { Spielstand } from './spielstand.js';

// AGS-Standard der Sprachausgabe (SetSpeechVolume nicht gesetzt = 100 %). Die Regler im Optionsmenue
// (SetAudioTypeVolume: Musik/Sound/Ambient) betreffen Sprache im Original nicht.
const SPEECH_VOLUME = 1;

// -----------------------------------------------------------------------------
// 1. Asset- & Sprite-Manager (inkl. Fallback auf ../art/export/sprites/<slot>.png)
// -----------------------------------------------------------------------------

class AssetManager {
  constructor() {
    this.imageCache = new Map();
    this.spriteCache = new Map();
    this.spriteLoading = new Map();
    this.dynamicSprites = new Map();
    this.nextDynamicSlot = 50000;
    this.spritesMeta = {};
  }

  init(spritesMeta) {
    this.spritesMeta = spritesMeta || {};
  }

  resolveUrl(repoRelPath) {
    if (!repoRelPath) return null;
    if (
      repoRelPath.startsWith('http') ||
      repoRelPath.startsWith('data:') ||
      repoRelPath.startsWith('../')
    ) {
      return repoRelPath;
    }
    return CFG.assetBase + repoRelPath.replace(/^\/+/, '');
  }

  getSpriteUrl(slot) {
    const meta = this.spritesMeta[slot];
    if (meta && meta.path && meta.exists !== false) {
      return this.resolveUrl(meta.path);
    }
    return `${CFG.assetBase}${CFG.spriteFallbackDir || 'missing-sprites'}/${slot}.png`;
  }

  getSpriteWidth(slot) {
    const s = Number(slot);
    if (!s || s <= 0) return 0;
    if (this.dynamicSprites.has(s)) return this.dynamicSprites.get(s).width;
    if (this.spriteCache.has(s)) return this.spriteCache.get(s).width;
    return this.spritesMeta[s]?.width || 36;
  }

  getSpriteHeight(slot) {
    const s = Number(slot);
    if (!s || s <= 0) return 0;
    if (this.dynamicSprites.has(s)) return this.dynamicSprites.get(s).height;
    if (this.spriteCache.has(s)) return this.spriteCache.get(s).height;
    return this.spritesMeta[s]?.height || 36;
  }

  loadImage(url, fallbackW = 32, fallbackH = 32, label = '') {
    if (!url) return Promise.resolve(this.createPlaceholder(fallbackW, fallbackH, label));
    if (this.imageCache.has(url)) return this.imageCache.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(this.createPlaceholder(fallbackW, fallbackH, label));
      img.src = url;
    });
    this.imageCache.set(url, p);
    return p;
  }

  createPlaceholder(w, h, label = '') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w || 32);
    c.height = Math.max(1, h || 32);
    c._isPlaceholder = true;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(40, 45, 65, 0.35)';
    ctx.fillRect(0, 0, c.width, c.height);
    if (label && c.width >= 24 && c.height >= 14) {
      ctx.font = '11px VT323, monospace';
      ctx.fillStyle = 'rgba(246, 224, 138, 0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(label), c.width / 2, c.height / 2);
    }
    return c;
  }

  ensureSprite(slot) {
    const s = Number(slot);
    if (!s || s <= 0) return Promise.resolve(null);
    if (this.dynamicSprites.has(s)) return Promise.resolve(this.dynamicSprites.get(s));
    if (this.spriteCache.has(s)) return Promise.resolve(this.spriteCache.get(s));
    if (this.spriteLoading.has(s)) return this.spriteLoading.get(s);

    const meta = this.spritesMeta[s] || {};
    const primaryUrl = this.getSpriteUrl(s);
    const fallbackUrl = `${CFG.assetBase}${CFG.spriteFallbackDir || 'missing-sprites'}/${s}.png`;
    const w = meta.width || 36;
    const h = meta.height || 36;

    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.spriteCache.set(s, img);
        resolve(img);
      };
      img.onerror = () => {
        if (primaryUrl !== fallbackUrl) {
          const img2 = new Image();
          img2.onload = () => {
            this.spriteCache.set(s, img2);
            resolve(img2);
          };
          img2.onerror = () => {
            const ph = this.createPlaceholder(w, h, '');
            this.spriteCache.set(s, ph);
            resolve(ph);
          };
          img2.src = fallbackUrl;
        } else {
          const ph = this.createPlaceholder(w, h, '');
          this.spriteCache.set(s, ph);
          resolve(ph);
        }
      };
      img.src = primaryUrl;
    });

    this.spriteLoading.set(s, p);
    return p;
  }

  getSpriteSync(slot) {
    const s = Number(slot);
    if (!s || s <= 0) return null;
    if (this.dynamicSprites.has(s)) return this.dynamicSprites.get(s);
    if (this.spriteCache.has(s)) return this.spriteCache.get(s);
    this.ensureSprite(s);
    return null;
  }

  registerDynamicCanvas(canvas) {
    const slot = this.nextDynamicSlot++;
    this.dynamicSprites.set(slot, canvas);
    this.spriteCache.set(slot, canvas);
    return slot;
  }

  deleteDynamicSlot(slot) {
    this.dynamicSprites.delete(slot);
    this.spriteCache.delete(slot);
  }
}

// -----------------------------------------------------------------------------
// 2. Raum-Masken & A*-Pfadfinder
// -----------------------------------------------------------------------------

class RoomMasks {
  constructor(width, height, maskPalette) {
    this.width = width;
    this.height = height;
    this.walk = new Uint8Array(width * height);
    this.hot = new Uint8Array(width * height);
    this.wb = new Uint8Array(width * height);
    this.activeWalkAreas = 0xffff;
    this.palette = maskPalette || [];
    this.rgbLookup = new Map();

    // 1. Explizite Masken-Palette zuerst eintragen (niedrige Indizes gewinnen)
    for (let i = 0; i < this.palette.length && i < 256; i++) {
      const p = this.palette[i];
      if (!p) continue;
      const key = (p[0] << 16) | (p[1] << 8) | p[2];
      if (!this.rgbLookup.has(key)) {
        this.rgbLookup.set(key, i);
      }
    }

    // 2. Synthetische Fallback-Farben für 1..55 (nur wenn noch nicht belegt)
    for (let i = 1; i <= 55; i++) {
      const c = [(i * 97) % 200 + 55, (i * 57) % 200 + 55, (i * 137) % 200 + 55];
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      if (!this.rgbLookup.has(key)) {
        this.rgbLookup.set(key, i);
      }
    }
  }

  decodeMaskImage(img) {
    const w = this.width;
    const h = this.height;
    const out = new Uint8Array(w * h);
    if (!img || img._isPlaceholder) return out;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const maxIdx = Math.min(55, Math.max(20, this.palette.length - 1));

    for (let p = 0, j = 0; p < out.length; p++, j += 4) {
      const r = data[j];
      const g = data[j + 1];
      const b = data[j + 2];
      const a = data[j + 3];
      if (a < 16 || (r < 8 && g < 8 && b < 8)) {
        out[p] = 0;
        continue;
      }
      const key = (r << 16) | (g << 8) | b;
      const exact = this.rgbLookup.get(key);
      if (exact !== undefined) {
        out[p] = exact;
        continue;
      }
      let bestIdx = 0;
      let bestDist = 999;
      for (let idx = 1; idx <= maxIdx; idx++) {
        const pal = this.palette[idx];
        const cr = pal ? pal[0] : (idx * 97) % 200 + 55;
        const cg = pal ? pal[1] : (idx * 57) % 200 + 55;
        const cb = pal ? pal[2] : (idx * 137) % 200 + 55;
        const d = Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      }
      out[p] = bestDist <= 45 ? bestIdx : 0;
    }
    return out;
  }

  isWalkable(x, y) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= SCENE_H) return false;
    const area = this.walk[iy * this.width + ix];
    if (area === 0) return false;
    return (this.activeWalkAreas & (1 << area)) !== 0;
  }

  getHotspotAt(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return 0;
    return this.hot[iy * this.width + ix];
  }

  findNearestWalkable(tx, ty) {
    const sx = Math.max(0, Math.min(this.width - 1, Math.round(tx)));
    const sy = Math.max(0, Math.min(SCENE_H - 1, Math.round(ty)));
    if (this.isWalkable(sx, sy)) return [sx, sy];

    for (let r = 2; r < Math.max(this.width, SCENE_H); r += 2) {
      let best = null;
      let bestDist = Infinity;
      const x0 = Math.max(0, sx - r);
      const x1 = Math.min(this.width - 1, sx + r);
      const y0 = Math.max(0, sy - r);
      const y1 = Math.min(SCENE_H - 1, sy + r);

      for (let x = x0; x <= x1; x += 2) {
        if (this.isWalkable(x, y0)) {
          const d = (x - sx) ** 2 + (y0 - sy) ** 2;
          if (d < bestDist) { bestDist = d; best = [x, y0]; }
        }
        if (this.isWalkable(x, y1)) {
          const d = (x - sx) ** 2 + (y1 - sy) ** 2;
          if (d < bestDist) { bestDist = d; best = [x, y1]; }
        }
      }
      for (let y = y0; y <= y1; y += 2) {
        if (this.isWalkable(x0, y)) {
          const d = (x0 - sx) ** 2 + (y - sy) ** 2;
          if (d < bestDist) { bestDist = d; best = [x0, y]; }
        }
        if (this.isWalkable(x1, y)) {
          const d = (x1 - sx) ** 2 + (y - sy) ** 2;
          if (d < bestDist) { bestDist = d; best = [x1, y]; }
        }
      }
      if (best) return best;
    }
    return [sx, sy];
  }

  hasLineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  findPath(startX, startY, targetX, targetY, anywhere = false) {
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    if (anywhere) {
      return [[Math.round(targetX), Math.round(targetY)]];
    }

    const [gx, gy] = this.findNearestWalkable(targetX, targetY);
    const [ox, oy] = this.isWalkable(sx, sy) ? [sx, sy] : this.findNearestWalkable(sx, sy);

    if (Math.hypot(gx - ox, gy - oy) <= 2) {
      return [[gx, gy]];
    }
    if (this.hasLineOfSight(ox, oy, gx, gy)) {
      return [[gx, gy]];
    }

    const STEP = 3;
    const gw = Math.ceil(this.width / STEP);
    const gh = Math.ceil(SCENE_H / STEP);
    const startNode = Math.floor(oy / STEP) * gw + Math.floor(ox / STEP);
    const goalNode = Math.floor(gy / STEP) * gw + Math.floor(gx / STEP);
    const total = gw * gh;

    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);

    const open = [startNode];
    gScore[startNode] = 0;
    fScore[startNode] = Math.hypot(gx - ox, gy - oy);

    const dirs = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414]
    ];

    let bestNode = startNode;
    let bestH = fScore[startNode];
    let iterations = 0;

    while (open.length > 0 && iterations++ < 25000) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestIdx]]) bestIdx = i;
      }
      const current = open[bestIdx];
      open[bestIdx] = open[open.length - 1];
      open.pop();

      if (current === goalNode) {
        bestNode = goalNode;
        break;
      }
      if (closed[current]) continue;
      closed[current] = 1;

      const cx = current % gw;
      const cy = (current / gw) | 0;

      for (const [ddx, ddy, cost] of dirs) {
        const nx = cx + ddx;
        const ny = cy + ddy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        const nIdx = ny * gw + nx;
        if (closed[nIdx]) continue;

        const px = Math.min(this.width - 1, nx * STEP + 1);
        const py = Math.min(SCENE_H - 1, ny * STEP + 1);
        if (!this.isWalkable(px, py)) continue;

        const tentativeG = gScore[current] + cost * STEP;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = current;
          gScore[nIdx] = tentativeG;
          const h = Math.hypot(gx - px, gy - py);
          fScore[nIdx] = tentativeG + h;
          if (h < bestH) {
            bestH = h;
            bestNode = nIdx;
          }
          if (!open.includes(nIdx)) open.push(nIdx);
        }
      }
    }

    const rawPath = [];
    let curr = bestNode;
    while (curr !== -1 && curr !== startNode) {
      const cx = curr % gw;
      const cy = (curr / gw) | 0;
      rawPath.push([
        Math.min(this.width - 1, cx * STEP + 1),
        Math.min(SCENE_H - 1, cy * STEP + 1)
      ]);
      curr = cameFrom[curr];
    }
    rawPath.reverse();
    if (bestNode === goalNode || rawPath.length === 0) {
      rawPath.push([gx, gy]);
    }

    const full = [[ox, oy], ...rawPath];
    const smooth = [];
    let anchor = 0;
    while (anchor < full.length - 1) {
      let next = full.length - 1;
      for (let probe = full.length - 1; probe > anchor + 1; probe--) {
        if (this.hasLineOfSight(full[anchor][0], full[anchor][1], full[probe][0], full[probe][1])) {
          next = probe;
          break;
        }
      }
      smooth.push(full[next]);
      anchor = next;
    }
    return smooth;
  }
}

// -----------------------------------------------------------------------------
// 3. AgsHtmlEngine Hauptklasse
// -----------------------------------------------------------------------------

export class AgsHtmlEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.assets = new AssetManager();
    this.data = {};
    this.characters = [];
    this.charByName = {};
    this.inventory = [null];
    this.invByName = {};
    this.guis = [];
    this.guiByName = {};
    this.player = null;

    this.currentRoomNumber = 0;
    this.currentRoom = null;
    this.currentBgCanvas = null;
    this.currentMasks = null;
    this.currentWbLayers = [];
    this.roomHotspots = [];
    this.roomObjects = [];
    this.overlays = [];

    this.viewport = { x: 0, y: 0, width: W, height: H };
    this.camera = {
      X: 0,
      Y: 0,
      Width: W,
      Height: SCENE_H,
      AutoTracking: true,
      SetAt: (x, y) => {
        const maxX = Math.max(0, (this.currentRoom?.width || W) - this.camera.Width);
        const maxY = Math.max(0, SCENE_H - this.camera.Height);
        this.camera.X = Math.max(0, Math.min(maxX, Math.round(x || 0)));
        this.camera.Y = Math.max(0, Math.min(maxY, Math.round(y || 0)));
      },
      SetSize: (w, h) => {
        this.camera.Width = Math.max(1, Math.round(w || W));
        this.camera.Height = Math.max(1, Math.round(h || SCENE_H));
      }
    };

    const self = this;
    this.mouse = {
      x: 320,
      y: 180,
      Mode: AGS_CONSTANTS.eModeUsermode2,
      leftDown: false,
      rightDown: false,
      IsButtonDown(btn) {
        return btn === AGS_CONSTANTS.eMouseRight ? self.mouse.rightDown : self.mouse.leftDown;
      },
      Update() {}
    };

    this.keysDown = new Set();
    this.paused = false;
    this.debugShowWalkable = false;
    this.actionOccupied = false;
    this.repExecRunning = false;
    this.lastClickTime = 0;
    this.lastActivatedInvId = 1;

    const qModus = new URLSearchParams(location.search).get('modus');
    const isTouchStart = qModus
      ? qModus === 'handy'
      : (location.hash.includes('touch') || matchMedia('(pointer: coarse)').matches);
    this.translationFilename = isTouchStart ? 'Touch' : '';

    this.speechVox = '';
    this.activeSpeech = null;
    this.currentAudio = null;
    this.audioVolumes = { 1: 0.9, 2: 0.8, 3: 0.9 };
    this.spielstand = new Spielstand(this);   // Autosave + Stand herunterladen/hochladen (spielstand.js)
    this.musik = new Musik(this.assets);   // Raummusik + Musik-Regler (musik.js)

    this.roomScripts = {};
    this.captureGlobalVariables = () => ({});
    this.restoreGlobalVariables = () => {};
  }

  registerExtender(typeName, funcName, fn) {
    if (typeName === 'Character') {
      AGSCharacter.prototype[funcName] = function (...args) {
        return fn.call(this, ...args);
      };
    }
  }

  registerRoomScript(roomNum, scriptObj) {
    this.roomScripts[Number(roomNum)] = scriptObj;
  }

  async init() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.hidden = false;

    const [rooms, characters, views, inventory, gui, speech, hints] = await Promise.all([
      fetch('./data/rooms.json').then((r) => r.json()),
      fetch('./data/characters.json').then((r) => r.json()),
      fetch('./data/views.json').then((r) => r.json()),
      fetch('./data/inventory.json').then((r) => r.json()),
      fetch('./data/gui.json').then((r) => r.json()),
      fetch('./data/speech.json').then((r) => r.json()),
      fetch('./data/hints.json').then((r) => r.json())
    ]);

    this.data = { rooms, characters, views, inventory, gui, speech, hints };
    this.assets.init(views.sprites);

    // 1. Globale AGS-API installieren
    installAgsGlobalApi(this);
    if (views.defines) Object.assign(globalThis, views.defines);

    // 2. Inventar, Figuren und GUIs anlegen
    this.initInventory(inventory.items);
    this.initCharacters(characters.characters);
    this.initGuis(gui.guis);
    this.initDefaultHotspotsAndObjects();

    // 3. Generiertes html/game.js laden und registrieren
    try {
      const gameMod = await import('./game.js');
      if (gameMod && typeof gameMod.registerGame === 'function') {
        gameMod.registerGame(this);
      }
    } catch (err) {
      console.error('[Engine] Konnte ./game.js nicht laden:', err);
    }

    // 4. Tumbleweed-Standardwerte setzen + Verbs.GoTo-Raumkoordinaten-Fix
    if (CFG.tumbleweed) setupTumbleweedDefaults(CFG.tumbleweed);
    if (CFG.verbsGoToFix) this.installVerbsGoToFix();

    // 5. Kern-Sprites (Cursor, Verbleiste usw. laut Konfiguration) vorab laden
    await this.preloadCoreSprites();

    // 6. game_start() ausfuehren
    if (typeof globalThis.game_start === 'function') {
      await globalThis.game_start();
    }
    if (typeof globalThis.SetzeLeiste === 'function') {
      await globalThis.SetzeLeiste(1);
    }
    await this.musik.laden();
    this.musik.wiederherstellen(globalThis.sldOptionsMusic);

    this.bindInputEvents();
    this.preloadSaveThumbs();

    if (loadingEl) loadingEl.hidden = true;

    // 7. Startraum laden (?room=N fuer Direktstart, sonst player.Room = 5 Intro)
    const urlRoom = Number(new URLSearchParams(location.search).get('room'));
    const startRoom = urlRoom || this.player.Room || 5;
    const roomDef = this.data.rooms.rooms[startRoom];
    if (urlRoom && roomDef && roomDef.spawn) {
      this.player.x = roomDef.spawn[0];
      this.player.y = roomDef.spawn[1];
      if (startRoom >= 3 && startRoom !== 5) {
        globalThis.gIntroFertig = true;
      }
    }

    await this.loadRoom(startRoom, this.player.x, this.player.y);
    this.startGameLoop();
  }

  initInventory(itemsData) {
    this.inventory = [null];
    for (const it of itemsData) {
      const itemObj = new AGSInventoryItem(it, this);
      this.inventory[itemObj.ID] = itemObj;
      this.invByName[itemObj.ScriptName] = itemObj;
      globalThis[itemObj.ScriptName] = itemObj;
    }
    globalThis.inventory = this.inventory;
  }

  initCharacters(charsData) {
    this.characters = [];
    for (const cd of charsData) {
      const ch = new AGSCharacter(cd, this);
      this.characters[ch.ID] = ch;
      this.charByName[ch.ScriptName] = ch;
      globalThis[ch.ScriptName] = ch;
      if (cd.isPlayer) this.player = ch;
    }
    if (!this.player) this.player = this.charByName[CFG.playerScriptName] || this.characters[0];
    globalThis.player = this.player;
    globalThis.character = this.characters;

    for (const itemObj of this.inventory) {
      if (itemObj && itemObj.PlayerStartsWithItem) {
        this.player.AddInventory(itemObj);
      }
    }
  }

  initGuis(guisData) {
    this.guis = [];
    for (const gd of guisData) {
      const g = new AGSGUI(gd, this);
      this.guis[g.ID] = g;
      this.guiByName[g.Name] = g;
      globalThis[g.Name] = g;
      for (const ctrl of g.Controls) {
        if (ctrl.Name) globalThis[ctrl.Name] = ctrl;
      }
    }
    globalThis.gui = this.guis;
  }

  initDefaultHotspotsAndObjects() {
    this.roomHotspots.length = 0;
    for (let i = 0; i < 50; i++) {
      this.roomHotspots.push(new AGSHotspot({ index: i, name: '', script: '', enabled: false }, this));
    }
    this.roomObjects.length = 0;
  }

  // Nachbildung von Verbs::GoTo des Moduls «Tumbleweed Verbs» (MIT-Lizenz, Copyright (c) 2017-present Dirk Kreyenberg;
  // Hauptautor abstauber u. a.) fuer die Browser-Laufzeit – siehe THIRD_PARTY.md. Der Hinweistext der MIT-Lizenz steht dort.
  installVerbsGoToFix() {
    const G = globalThis;
    if (!G.Verbs) return;
    const engine = this;
    G.Verbs.GoTo = async function (blocking = 2) {
      const locType = engine.getLocationTypeAtScreen(engine.mouse.x, engine.mouse.y);
      if (locType === AGS_CONSTANTS.eLocationCharacter) {
        const ch = engine.getCharacterAtScreen(engine.mouse.x, engine.mouse.y);
        if (ch && typeof G.Verbs.GoToCharacter === 'function') {
          return await G.Verbs.GoToCharacter(ch, 0, Boolean(G.Verbs.VerbGuiOptions?.[G.eVerbGuiNPCfacingPlayer]), blocking);
        }
      }
      let xtogo = 0;
      let ytogo = 0;
      const h = engine.getHotspotAtScreen(engine.mouse.x, engine.mouse.y);
      if (locType === AGS_CONSTANTS.eLocationHotspot && h && h.ID > 0 && (h.WalkToX > 0 || h.WalkToY > 0)) {
        xtogo = h.WalkToX;
        ytogo = h.WalkToY;
      } else {
        const pt = engine.screenToRoomPoint(engine.mouse.x, engine.mouse.y);
        xtogo = pt.x;
        ytogo = pt.y;
      }

      if (blocking === 0) {
        await engine.player.Walk(xtogo, ytogo, AGS_CONSTANTS.eNoBlock, AGS_CONSTANTS.eWalkableAreas);
        return 0;
      } else if (blocking === 1) {
        await engine.player.Walk(xtogo, ytogo, AGS_CONSTANTS.eBlock, AGS_CONSTANTS.eWalkableAreas);
        return 1;
      } else if (typeof G.Verbs.MovePlayer === 'function') {
        return await G.Verbs.MovePlayer(xtogo, ytogo);
      } else {
        await engine.player.Walk(xtogo, ytogo, AGS_CONSTANTS.eBlock, AGS_CONSTANTS.eWalkableAreas);
        return 1;
      }
    };
  }

  async preloadCoreSprites() {
    // Nur Cursor und Verbleiste werden vor dem Start abgewartet; der Rest laedt im Hintergrund
    // (getSpriteSync stoesst fehlende Sprites ohnehin an, sie erscheinen beim naechsten Bild).
    const coreSlots = [...CFG.preload.core];
    const restSlots = [];
    for (const [von, bis] of CFG.preload.restRanges) for (let s = von; s <= bis; s++) restSlots.push(s);
    await Promise.all(coreSlots.map((s) => this.assets.ensureSprite(s)));
    for (const s of restSlots) this.assets.ensureSprite(s);
  }

  // ---------------------------------------------------------------------------
  // 4. Raum-Laden & Walk-behind-Aufbau
  // ---------------------------------------------------------------------------

  async loadRoom(roomNum, startX, startY) {
    const rNum = Number(roomNum);
    const prevScript = this.roomScripts[this.currentRoomNumber];
    if (prevScript && typeof prevScript.room_Leave === 'function') {
      await prevScript.room_Leave();
    }

    this.overlays = this.overlays.filter((ov) => !ov.InRoom && ov.Valid);

    const fb = CFG.fallbackRoom || {};
    const roomDef = this.data.rooms.rooms[rNum] || {
      number: rNum,
      width: W,
      height: H,
      background: fb.background || null,
      walkable: fb.walkable || null,
      hotspotMask: fb.hotspotMask || null,
      walkbehind: null,
      walkbehindBaselines: [],
      hotspots: []
    };

    this.currentRoomNumber = rNum;
    this.musik.raum(rNum);
    this.currentRoom = roomDef;
    this.player.Room = rNum;
    if (startX !== undefined) this.player.x = Math.round(startX);
    if (startY !== undefined) this.player.y = Math.round(startY);
    this.player.StopMoving();

    this.viewport = { x: 0, y: 0, width: W, height: H };
    this.camera.Width = W;
    this.camera.Height = SCENE_H;
    this.camera.AutoTracking = true;

    // Ladeanzeige erst nach 200 ms, damit schnelle Raumwechsel ohne Flackern bleiben
    const loadingEl = document.getElementById('loading');
    const loadingTimer = loadingEl ? setTimeout(() => { loadingEl.hidden = false; }, 200) : null;
    const [bgImg, walkImg, hotImg, wbImg] = await Promise.all([
      this.assets.loadImage(this.assets.resolveUrl(roomDef.background), roomDef.width, roomDef.height, roomDef.title),
      this.assets.loadImage(this.assets.resolveUrl(roomDef.walkable), roomDef.width, roomDef.height),
      this.assets.loadImage(this.assets.resolveUrl(roomDef.hotspotMask), roomDef.width, roomDef.height),
      roomDef.walkbehind
        ? this.assets.loadImage(this.assets.resolveUrl(roomDef.walkbehind), roomDef.width, roomDef.height)
        : Promise.resolve(null)
    ]);
    clearTimeout(loadingTimer);
    if (loadingEl) loadingEl.hidden = true;

    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = roomDef.width;
    bgCanvas.height = roomDef.height;
    bgCanvas.getContext('2d').drawImage(bgImg, 0, 0, roomDef.width, roomDef.height);
    this.currentBgCanvas = bgCanvas;

    const masks = new RoomMasks(roomDef.width, roomDef.height, this.data.rooms.maskPalette);
    masks.walk = masks.decodeMaskImage(walkImg);
    masks.hot = masks.decodeMaskImage(hotImg);
    masks.wb = wbImg ? masks.decodeMaskImage(wbImg) : new Uint8Array(roomDef.width * roomDef.height);
    this.currentMasks = masks;

    this.rebuildWalkbehindLayers();

    this.initDefaultHotspotsAndObjects();
    for (const h of roomDef.hotspots || []) {
      const hObj = new AGSHotspot(h, this);
      this.roomHotspots[h.index] = hObj;
      if (hObj.ScriptName) globalThis[hObj.ScriptName] = hObj;
    }

    this.updateCamera();

    const script = this.roomScripts[rNum];
    if (script && typeof script.room_Load === 'function') {
      await script.room_Load();
    }

    if (typeof globalThis.on_event === 'function') {
      await globalThis.on_event(AGS_CONSTANTS.eEventEnterRoomBeforeFadein, rNum);
    }

    this.updateCamera();

    // AGS: AfterFadeIn laeuft nach dem Raumwechsel, auch wenn der Wechsel aus einer laufenden Aktion kam (Tuer, Cutscene).
    // runAsyncAction wuerde es bei belegter Aktion verwerfen -> in die Warteschlange, updateTick startet es, sobald frei.
    this.afterFadeInQueue = (script && typeof script.room_AfterFadeIn === 'function') ? () => script.room_AfterFadeIn() : null;

    // Nachbarraeume (Nummer -1/+1) im Leerlauf vorladen: der naechste Raumwechsel zeigt dann sofort das Bild
    if (this.spielstand) this.spielstand.raumGewechselt(rNum);
    setTimeout(() => { this.prefetchRoom(rNum - 1); this.prefetchRoom(rNum + 1); }, 400);
  }

  // Hintergrund, Walk- und Hotspot-Maske eines Raums in den Bildcache laden (keine Engine-Wirkung)
  prefetchRoom(roomNum) {
    const roomDef = this.data.rooms.rooms[roomNum];
    if (!roomDef || !roomDef.background) return;
    for (const f of [roomDef.background, roomDef.walkable, roomDef.hotspotMask, roomDef.walkbehind]) {
      if (f) this.assets.loadImage(this.assets.resolveUrl(f), roomDef.width, roomDef.height);
    }
  }

  getRoomDrawingSurface() {
    if (!this.currentBgCanvas) {
      this.currentBgCanvas = document.createElement('canvas');
      this.currentBgCanvas.width = W;
      this.currentBgCanvas.height = H;
    }
    return new AGSDrawingSurface(this.currentBgCanvas, this, () => {
      this.rebuildWalkbehindLayers();
    });
  }

rebuildWalkbehindLayers() {
    this.currentWbLayers = [];
    const roomDef = this.currentRoom;
    const masks = this.currentMasks;
    if (!roomDef || !masks || !roomDef.walkbehindBaselines || roomDef.walkbehindBaselines.length === 0) return;

    const w = roomDef.width;
    const h = Math.min(roomDef.height || SCENE_H, masks.height);
    const bgData = this.currentBgCanvas.getContext('2d').getImageData(0, 0, w, h);
    const src = bgData.data;

    for (const wbDef of roomDef.walkbehindBaselines) {
      const idx = wbDef.index;
      const baseline = wbDef.baseline;
      if (!idx || baseline <= 0) continue;

      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = w;
      layerCanvas.height = h;
      const lCtx = layerCanvas.getContext('2d');
      const lImg = lCtx.createImageData(w, h);
      const dst = lImg.data;
      let hasPixels = false;

      for (let p = 0, j = 0; p < w * h; p++, j += 4) {
        if (masks.wb[p] === idx) {
          dst[j] = src[j];
          dst[j + 1] = src[j + 1];
          dst[j + 2] = src[j + 2];
          dst[j + 3] = 255;
          hasPixels = true;
        }
      }
      if (hasPixels) {
        lCtx.putImageData(lImg, 0, 0);
        this.currentWbLayers.push({ index: idx, baseline, canvas: layerCanvas });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Koordinaten- & Treffer-Abfragen (Screen / Room / GUI)
  // ---------------------------------------------------------------------------

  screenToRoomPoint(sx, sy) {
    const scaleX = this.camera.Width / W;
    const scaleY = this.camera.Width < W ? (this.camera.Height / H) : 1;
    return {
      x: Math.round(this.camera.X + sx * scaleX),
      y: Math.round(this.camera.Y + sy * scaleY)
    };
  }

  roomToScreenPoint(rx, ry) {
    const scaleX = W / this.camera.Width;
    const scaleY = this.camera.Width < W ? (H / this.camera.Height) : 1;
    return {
      x: Math.round((rx - this.camera.X) * scaleX),
      y: Math.round((ry - this.camera.Y) * scaleY)
    };
  }

  getGuiAtScreen(sx, sy) {
    const visibleGuis = this.guis
      .filter((g) => g && g.Visible && g.Clickable)
      .sort((a, b) => (b.ZOrder || 0) - (a.ZOrder || 0) || b.ID - a.ID);

    for (const g of visibleGuis) {
      if (sx >= g.X && sx < g.X + g.Width && sy >= g.Y && sy < g.Y + g.Height) {
        return g;
      }
    }
    return null;
  }

  getGuiControlAtScreen(sx, sy) {
    const visibleGuis = this.guis
      .filter((g) => g && g.Visible)
      .sort((a, b) => (b.ZOrder || 0) - (a.ZOrder || 0) || b.ID - a.ID);

    for (const g of visibleGuis) {
      if (sx < g.X || sx >= g.X + g.Width || sy < g.Y || sy >= g.Y + g.Height) continue;
      const lx = sx - g.X;
      const ly = sy - g.Y;
      const ctrls = [...g.Controls]
        .filter((c) => c && c.Visible && c.Enabled && c.Clickable)
        .sort((a, b) => (b.ZOrder || 0) - (a.ZOrder || 0) || b.ID - a.ID);
      for (const c of ctrls) {
        if (lx >= c.X && lx < c.X + c.Width && ly >= c.Y && ly < c.Y + c.Height) {
          return c;
        }
      }
      if (g.Clickable) return null;
    }
    return null;
  }

  getInventoryItemAtScreen(sx, sy) {
    const gMain = this.guiByName.gMain;
    const invMain = globalThis.invMain;
    if (!gMain || !gMain.Visible || !invMain || !invMain.Visible || !this.player) return null;
    const lx = sx - gMain.X - invMain.X;
    const ly = sy - gMain.Y - invMain.Y;
    if (lx < 0 || lx >= invMain.Width || ly < 0 || ly >= invMain.Height) return null;
    const col = Math.floor(lx / invMain.ItemWidth);
    const row = Math.floor(ly / invMain.ItemHeight);
    if (col < 0 || col >= invMain.ItemsPerRow || row < 0 || row >= invMain.RowCount) return null;
    const idx = invMain.TopItem + row * invMain.ItemsPerRow + col;
    return this.player.inventory[idx] || null;
  }

  getCharacterAtRoom(rx, ry) {
    const roomChars = this.characters
      .filter((c) => c && c.Room === this.currentRoomNumber && c.Clickable && c.Transparency < 100 && c !== this.player)
      .sort((a, b) => b.y - a.y);

    for (const ch of roomChars) {
      const bbox = this.getCharacterRoomBBox(ch);
      if (rx >= bbox.x && rx <= bbox.x + bbox.w && ry >= bbox.y && ry <= bbox.y + bbox.h) {
        return ch;
      }
    }
    return null;
  }

  getCharacterAtScreen(sx, sy) {
    if (this.getGuiAtScreen(sx, sy)) return null;
    const maxSceneY = (this.guiByName.gMain && this.guiByName.gMain.Visible) ? SCENE_H : H;
    if (sy >= maxSceneY) return null;
    const rp = this.screenToRoomPoint(sx, sy);
    return this.getCharacterAtRoom(rp.x, rp.y);
  }

  getObjectAtRoom(rx, ry) {
    for (let i = this.roomObjects.length - 1; i >= 0; i--) {
      const o = this.roomObjects[i];
      if (!o || !o.Visible || !o.Clickable) continue;
      const w = this.assets.getSpriteWidth(o.Graphic) || 32;
      const h = this.assets.getSpriteHeight(o.Graphic) || 32;
      if (rx >= o.X && rx <= o.X + w && ry >= o.Y && ry <= o.Y + h) {
        return o;
      }
    }
    return null;
  }

  getObjectAtScreen(sx, sy) {
    if (this.getGuiAtScreen(sx, sy)) return null;
    const maxSceneY = (this.guiByName.gMain && this.guiByName.gMain.Visible) ? SCENE_H : H;
    if (sy >= maxSceneY) return null;
    const rp = this.screenToRoomPoint(sx, sy);
    return this.getObjectAtRoom(rp.x, rp.y);
  }

  getHotspotAtRoom(rx, ry) {
    if (!this.currentMasks) return this.roomHotspots[0];
    const idx = this.currentMasks.getHotspotAt(rx, ry);
    if (idx > 0 && this.roomHotspots[idx] && this.roomHotspots[idx].Enabled) {
      return this.roomHotspots[idx];
    }
    return this.roomHotspots[0];
  }

  getHotspotAtScreen(sx, sy) {
    if (this.getGuiAtScreen(sx, sy)) return this.roomHotspots[0];
    const maxSceneY = (this.guiByName.gMain && this.guiByName.gMain.Visible) ? SCENE_H : H;
    if (sy >= maxSceneY) return this.roomHotspots[0];
    const rp = this.screenToRoomPoint(sx, sy);
    return this.getHotspotAtRoom(rp.x, rp.y);
  }

  getLocationTypeAtScreen(sx, sy) {
    if (this.getGuiAtScreen(sx, sy)) return AGS_CONSTANTS.eLocationNothing;
    if (this.getCharacterAtScreen(sx, sy)) return AGS_CONSTANTS.eLocationCharacter;
    if (this.getObjectAtScreen(sx, sy)) return AGS_CONSTANTS.eLocationObject;
    const h = this.getHotspotAtScreen(sx, sy);
    if (h && h.ID > 0 && h.Enabled) return AGS_CONSTANTS.eLocationHotspot;
    return AGS_CONSTANTS.eLocationNothing;
  }

  getLocationNameAtScreen(sx, sy) {
    const invItem = this.getInventoryItemAtScreen(sx, sy);
    if (invItem) return invItem.Name || '';
    if (this.getGuiAtScreen(sx, sy)) return '';
    const ch = this.getCharacterAtScreen(sx, sy);
    if (ch) return ch.Name || '';
    const obj = this.getObjectAtScreen(sx, sy);
    if (obj) return obj.Name || '';
    const h = this.getHotspotAtScreen(sx, sy);
    if (h && h.ID > 0 && h.Enabled) return h.Name || '';
    return '';
  }

  isInteractionAvailableAtScreen(sx, sy, mode) {
    const ch = this.getCharacterAtScreen(sx, sy);
    if (ch) return ch.IsInteractionAvailable(mode);
    const obj = this.getObjectAtScreen(sx, sy);
    if (obj) return obj.IsInteractionAvailable(mode);
    const h = this.getHotspotAtScreen(sx, sy);
    if (h && h.ID > 0 && h.Enabled) return h.IsInteractionAvailable(mode);
    return 0;
  }

  async processRoomClick(sx, sy, mode) {
    if (mode === AGS_CONSTANTS.eModeWalkto) {
      const rp = this.screenToRoomPoint(sx, sy);
      await this.player.Walk(rp.x, rp.y, AGS_CONSTANTS.eNoBlock, AGS_CONSTANTS.eWalkableAreas);
      return;
    }
    const ch = this.getCharacterAtScreen(sx, sy);
    if (ch) {
      await ch.RunInteraction(mode);
      return;
    }
    const obj = this.getObjectAtScreen(sx, sy);
    if (obj) {
      await obj.RunInteraction(mode);
      return;
    }
    const h = this.getHotspotAtScreen(sx, sy);
    if (h && h.ID > 0 && h.Enabled) {
      await h.RunInteraction(mode);
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Sprache, Audio & DialogBox (Display)
  // ---------------------------------------------------------------------------

  getViewFrames(viewId, loopId) {
    const v = this.data.views.views[viewId];
    if (!v || !v.loops) return [];
    const loop = v.loops[loopId] || v.loops[0];
    return loop ? loop.frames : [];
  }

  Wait(ticks) {
    const t = Math.max(1, Number(ticks) || 1);
    return new Promise((resolve) => {
      setTimeout(resolve, (t * 1000) / GAME_SPEED);
    });
  }

  setAudioVolume(type, vol) {
    const v = Math.max(0, Math.min(100, Number(vol) || 0)) / 100;
    this.audioVolumes[type] = v;
    if (type === 1) this.musik.setzeLautstaerke(v);   // eAudioTypeMusic
    if (type === 3 && this.currentAudio) { try { this.currentAudio.volume = v; } catch {} }   // eVolExistingAndFuture
  }

  lookupSpeech(charObj, n) {
    const charName = typeof charObj === 'string' ? charObj : charObj?.ScriptName;
    if (!charName || !n) return null;
    const voxEntry = this.data.speech.byVox?.[this.speechVox]?.[charName]?.[n];
    if (voxEntry) return voxEntry;
    for (const vox of CFG.speechFallbackVox) {
      const f = this.data.speech.byVox?.[vox]?.[charName]?.[n];
      if (f) return f;
    }
    return null;
  }

  playVoiceClip(charObj, n) {
    const entry = this.lookupSpeech(charObj, Number(n));
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch {}
      this.currentAudio = null;
    }
    const channel = { IsPlaying: false, Stop: () => {} };
    if (!entry || !entry.mp3) return channel;

    const audio = new Audio(this.assets.resolveUrl(entry.mp3));
    audio.volume = SPEECH_VOLUME;
    this.currentAudio = audio;
    channel.IsPlaying = true;
    channel.Stop = () => {
      try { audio.pause(); } catch {}
      channel.IsPlaying = false;
    };
    audio.onended = () => { channel.IsPlaying = false; };
    audio.onerror = () => { channel.IsPlaying = false; };
    audio.play().catch(() => { channel.IsPlaying = false; });
    return channel;
  }

  async sayCharacter(charObj, rawText) {
    if (!charObj) return;
    let text = String(rawText ?? '');
    let voiceNum = null;
    const m = /^&(\d+)\s*(.*)$/.exec(text);
    if (m) {
      voiceNum = Number(m[1]);
      text = m[2];
    }

    if (charObj.Moving) charObj.StopMoving();

    charObj.Speaking = true;
    charObj.walkTick = 0;
    charObj.Frame = 0;

    // AGS: ein neuer Spruch bricht den vorherigen (auch eine laufende Tutorial-Stimme) sofort ab
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch {}
      this.currentAudio = null;
    }

    let audio = null;
    if (voiceNum !== null) {
      const entry = this.lookupSpeech(charObj, voiceNum);
      if (entry && entry.mp3) {
        audio = new Audio(this.assets.resolveUrl(entry.mp3));
        audio.volume = SPEECH_VOLUME;
        this.currentAudio = audio;
      }
    }

    await new Promise((resolve) => {
      let finished = false;
      let minTimerDone = false;
      let audioDone = !audio;
      let fallbackTimer = null;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (audio) {
          try { audio.pause(); } catch {}
        }
        charObj.Speaking = false;
        charObj.Frame = 0;
        this.activeSpeech = null;
        resolve();
      };

      const readMs = Math.max(1700, Math.min(6500, text.length * 60));
      fallbackTimer = setTimeout(() => {
        minTimerDone = true;
        if (audioDone) finish();
      }, readMs);

      if (audio) {
        audio.onended = () => {
          audioDone = true;
          finish();
        };
        audio.onerror = () => {
          audioDone = true;
          if (minTimerDone) finish();
        };
        audio.play().catch(() => {
          audioDone = true;
          if (minTimerDone) finish();
        });
      }

      const startedAt = performance.now();
      this.activeSpeech = {
        char: charObj,
        text,
        skip: () => {
          if (performance.now() - startedAt < 120) return;
          finish();
        }
      };
    });
  }

  async displayMessageBox(text) {
    const f = fontSpec(AGS_CONSTANTS.eFontTumbleDlg);
    this.ctx.save();
    this.ctx.font = `${f.size}px VT323, monospace`;
    const lines = wrapLines(this.ctx, text, 420);
    this.ctx.restore();

    const boxW = 460;
    const boxH = Math.max(60, lines.length * f.lineHeight + 28);
    const bx = Math.floor((W - boxW) / 2);
    const by = Math.floor((SCENE_H - boxH) / 2);

    const sp = globalThis.DynamicSprite.Create(boxW, boxH);
    const s = sp.GetDrawingSurface();
    s.DrawingColor = globalThis.Game.GetColorFromRGB(20, 25, 40);
    s.DrawRectangle(0, 0, boxW - 1, boxH - 1);
    s.DrawingColor = globalThis.Game.GetColorFromRGB(246, 224, 138);
    s.DrawRectangle(2, 2, boxW - 3, boxH - 3);
    s.DrawingColor = globalThis.Game.GetColorFromRGB(28, 34, 52);
    s.DrawRectangle(4, 4, boxW - 5, boxH - 5);
    s.DrawingColor = globalThis.Game.GetColorFromRGB(246, 224, 138);
    let ty = 12;
    for (const l of lines) {
      s.DrawString(16, ty, AGS_CONSTANTS.eFontTumbleDlg, l);
      ty += f.lineHeight;
    }
    s.Release();

    const ov = globalThis.Overlay.CreateGraphical(bx, by, sp.Graphic);
    ov.ZOrder = 980;

    while (this.mouse.leftDown || this.mouse.rightDown) await this.Wait(1);
    while (!this.mouse.leftDown && !this.mouse.rightDown && !this.keysDown.has(AGS_CONSTANTS.eKeyReturn) && !this.keysDown.has(AGS_CONSTANTS.eKeyEscape)) {
      await this.Wait(1);
    }
    while (this.mouse.leftDown || this.mouse.rightDown) await this.Wait(1);

    ov.Remove();
    sp.Delete();
  }

  // ---------------------------------------------------------------------------
  // 7. Spielstaende (localStorage)
  // ---------------------------------------------------------------------------

  getSaveKey(slot) {
    return slot === 'auto' ? `${CFG.storagePrefix}_autosave` : `${CFG.storagePrefix}_save_slot_${slot}`;
  }

  getSaveSlotDescription(slot) {
    try {
      const raw = localStorage.getItem(this.getSaveKey(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.desc || 'Spielstand';
    } catch {
      return null;
    }
  }

  // Vorschaubilder gespeicherter Staende nach dem Seitenstart vordekodieren (Laden-Menue braucht sie synchron)
  preloadSaveThumbs() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const m = new RegExp(`^${CFG.storagePrefix.replace(/[^\w-]/g, '')}_save_slot_(\\d+)$`).exec(localStorage.key(i) || '');
        if (!m) continue;
        const slot = Number(m[1]);
        const parsed = JSON.parse(localStorage.getItem(this.getSaveKey(slot)) || 'null');
        if (!parsed || !parsed.screenshot) continue;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const entry = { canvas, ready: false };
        (this.thumbCache ||= {})[slot] = entry;
        const img = new Image();
        img.onload = () => { canvas.getContext('2d').drawImage(img, 0, 0, 160, 90); entry.ready = true; };
        img.src = parsed.screenshot;
      }
    } catch {}
  }

  createSpriteFromSaveGame(slot, w, h) {
    try {
      const raw = localStorage.getItem(this.getSaveKey(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.screenshot) return null;
      const c = document.createElement('canvas');
      c.width = w || W;
      c.height = h || H;
      // Vorschaubild synchron aus dem Zwischenspeicher (das Skript beschneidet/skaliert sofort; ein spaet ladendes Bild blieb leer)
      const cached = this.thumbCache && this.thumbCache[slot];
      if (cached && cached.ready) {
        c.getContext('2d').drawImage(cached.canvas, 0, 0, c.width, c.height);
      } else {
        const img = new Image();
        img.onload = () => {
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        };
        img.src = parsed.screenshot;
      }
      return new AGSDynamicSprite(c, this);
    } catch {
      return null;
    }
  }

async saveGameSlot(slot, desc, nurErzeugen) {
    try {
      const thumb = document.createElement('canvas');
      thumb.width = 160;
      thumb.height = 90;
      thumb.getContext('2d').drawImage(this.canvas, 0, 0, W, H, 0, 0, 160, 90);
      (this.thumbCache ||= {})[slot] = { canvas: thumb, ready: true };

      const roomStates = {};
      for (const [rNum, rScript] of Object.entries(this.roomScripts)) {
        if (rScript && typeof rScript.__getState === 'function') {
          const st = rScript.__getState() || {};
          // wie globals: nur einfache Werte (Overlay/Character-Referenzen haben Rueckverweise auf die Engine)
          roomStates[rNum] = Object.fromEntries(Object.entries(st).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => x === null || ['number', 'string', 'boolean'].includes(typeof x)))));
        }
      }

      const payload = {
        desc: String(desc || 'Spielstand'),
        timestamp: Date.now(),
        room: this.currentRoomNumber,
        speechVox: this.speechVox,
        // nur Zahlen/Text/Wahrheitswerte und Listen davon (Objekte wie Character/Overlay haben Rueckverweise auf die Engine)
        globals: Object.fromEntries(Object.entries(this.captureGlobalVariables() || {}).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => x === null || ['number', 'string', 'boolean'].includes(typeof x))))),
        roomStates,
        inventoryIds: this.player.inventory.map((it) => it.ID),
        characters: this.characters.filter(Boolean).map((c) => ({
          id: c.ID,
          room: c.Room,
          x: Math.round(c.x),
          y: Math.round(c.y),
          loop: c.Loop,
          view: c.View,
          lockedView: c.LockedView,
          clickable: c.Clickable,
          transparency: c.Transparency,
          scaling: c.Scaling,
          manualScaling: c.ManualScaling,
          speechView: c.SpeechView
        })),
        screenshot: thumb.toDataURL('image/jpeg', 0.75)
      };

      if (nurErzeugen) return payload;
      localStorage.setItem(this.getSaveKey(slot), JSON.stringify(payload));
      return payload;
    } catch (err) {
      console.warn('[SaveGameSlot Fehler]', err);
    }
  }

async restoreGameSlot(slot, vorgabe) {
    try {
      let payload = vorgabe;
      if (!payload) {
        const raw = localStorage.getItem(this.getSaveKey(slot));
        if (!raw) return;
        payload = JSON.parse(raw);
      }

      for (const g of this.guis) {
        if (g && g.Name !== 'gMain' && g.Name !== 'gAction') g.Visible = false;
      }

      this.restoreGlobalVariables(payload.globals);

      if (payload.roomStates) {
        for (const [rNum, rState] of Object.entries(payload.roomStates)) {
          const rs = this.roomScripts[rNum];
          if (rs && typeof rs.__setState === 'function') {
            rs.__setState(rState);
          }
        }
      }

      if (Array.isArray(payload.inventoryIds)) {
        this.player.inventory = payload.inventoryIds
          .map((id) => this.inventory[id])
          .filter(Boolean);
        if (globalThis.invMain) globalThis.invMain._sync();
      }

      if (Array.isArray(payload.characters)) {
        for (const cs of payload.characters) {
          const ch = this.characters[cs.id];
          if (!ch) continue;
          ch.StopMoving();
          ch.Room = cs.room;
          ch.x = cs.x;
          ch.y = cs.y;
          ch.Loop = cs.loop;
          ch.View = cs.view;
          ch.LockedView = cs.lockedView || 0;
          ch.Clickable = cs.clickable;
          ch.Transparency = cs.transparency;
          ch.Scaling = cs.scaling;
          ch.ManualScaling = cs.manualScaling;
          if (cs.speechView !== undefined) ch.SpeechView = cs.speechView;
        }
      }

      this.speechVox = payload.speechVox || '';
      await this.loadRoom(payload.room, this.player.x, this.player.y);

      if (typeof globalThis.on_event === 'function') {
        await globalThis.on_event(AGS_CONSTANTS.eEventRestoreGame, Number.isFinite(Number(slot)) ? Number(slot) : 990);
      }
    } catch (err) {
      console.error('[RestoreGameSlot Fehler]', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Eingabe-Verarbeitung (Maus, Touch, Tastatur)
  // ---------------------------------------------------------------------------

bindInputEvents() {
    const updateCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      this.mouse.x = Math.max(0, Math.min(W - 1, Math.floor((e.clientX - rect.left) * scaleX)));
      this.mouse.y = Math.max(0, Math.min(H - 1, Math.floor((e.clientY - rect.top) * scaleY)));
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      updateCoords(e);
      const isRight = e.button === 2 || e.pointerType === 'pen';
      const btn = isRight ? AGS_CONSTANTS.eMouseRight : AGS_CONSTANTS.eMouseLeft;

      const now = performance.now();
      globalThis.DoubleClick.Event[btn] = (now - this.lastClickTime < 300);
      this.lastClickTime = now;

      this.mouseUpAt = 0;
      if (isRight) this.mouse.rightDown = true;
      else this.mouse.leftDown = true;

      this.handlePointerDown(btn);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      updateCoords(e);
      if (this.dragSlider) this.setSliderFromX(this.dragSlider, this.mouse.x);
    });

    // Skripte fragen Mouse.IsButtonDown pro Frame ab (40/s): kurze Klicks/Tipper sonst verpasst -> Taste 60 ms nachhalten
    window.addEventListener('pointerup', (e) => {
      this.dragSlider = null;
      const pending = this.pendingGuiClick;
      this.pendingGuiClick = null;
      const rechts = e.button === 2;
      const seit = performance.now();
      this.mouseUpAt = seit;
      setTimeout(() => {
        if (this.mouseUpAt === seit) {   // sonst: inzwischen erneut gedrueckt
          if (rechts) this.mouse.rightDown = false;
          else this.mouse.leftDown = false;
        }
        if (pending) {
          const c = pending.ctrl;
          const fn = globalThis[c.OnClick];
          if (typeof fn === 'function' && c.OwningGUI.Visible && c.Enabled !== false && this.getGuiControlAtScreen(this.mouse.x, this.mouse.y) === c) {
            this.runAsyncAction(async () => {
              await fn(c, pending.button);
            });
          }
        }
      }, 60);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const code = this.mapDomKeyToAgs(e);
      if (code) { this.keysDown.add(code); if (this.keyUpAt) this.keyUpAt[code] = 0; }

      if (this.activeSpeech && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
        e.preventDefault();
        this.activeSpeech.skip();
        return;
      }

      if (!this.actionOccupied && code && typeof globalThis.on_key_press === 'function') {
        const mod = e.ctrlKey ? AGS_CONSTANTS.eKeyModCtrl : 0;
        this.runAsyncAction(async () => {
          await globalThis.on_key_press(code, mod);
        });
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = this.mapDomKeyToAgs(e);
      // Skripte fragen IsKeyPressed pro Frame ab (40/s): kurze Tastendruecke (< 25 ms) sonst verpasst -> Taste 60 ms nachhalten
      if (code) {
        const seit = performance.now();
        (this.keyUpAt ||= {})[code] = seit;
        setTimeout(() => { if (this.keyUpAt[code] === seit) this.keysDown.delete(code); }, 60);
      }
    });
  }

  mapDomKeyToAgs(e) {
    if (e.key === 'Escape') return AGS_CONSTANTS.eKeyEscape;
    if (e.key === 'Enter') return AGS_CONSTANTS.eKeyReturn;
    if (e.key === ' ') return AGS_CONSTANTS.eKeySpace;
    if (e.key === 'Backspace') return AGS_CONSTANTS.eKeyBackspace;
    if (e.key === 'Tab') return AGS_CONSTANTS.eKeyTab;
    if (e.key === 'Home') return AGS_CONSTANTS.eKeyHome;
    if (e.key === 'End') return AGS_CONSTANTS.eKeyEnd;
    if (e.key === 'PageUp') return AGS_CONSTANTS.eKeyPageUp;
    if (e.key === 'PageDown') return AGS_CONSTANTS.eKeyPageDown;
    if (e.key === 'Insert') return AGS_CONSTANTS.eKeyInsert;
    if (e.key === 'Delete') return AGS_CONSTANTS.eKeyDelete;
    if (e.key === 'ArrowUp') return AGS_CONSTANTS.eKeyUpArrow;
    if (e.key === 'ArrowDown') return AGS_CONSTANTS.eKeyDownArrow;
    if (e.key === 'ArrowLeft') return AGS_CONSTANTS.eKeyLeftArrow;
    if (e.key === 'Control') return AGS_CONSTANTS.eKeyCtrlLeft;
    if (e.key === 'Shift') return AGS_CONSTANTS.eKeyShiftLeft;
    if (/^F([1-9]|1[0-2])$/.test(e.key)) {
      return AGS_CONSTANTS[`eKeyF${e.key.slice(1)}`];
    }
    if (e.key.length === 1) {
      const up = e.key.toUpperCase().charCodeAt(0);
      if ((up >= 48 && up <= 57) || (up >= 65 && up <= 90)) return up;
    }
    return 0;
  }

handlePointerDown(button) {
    if (this.activeSpeech) {
      this.activeSpeech.skip();
      return;
    }

    if (this.actionOccupied) return;

    const sx = this.mouse.x;
    const sy = this.mouse.y;

    // 1. GUI-Control unter dem Mauszeiger pruefen (oberste GUIs zuerst)
    const ctrl = this.getGuiControlAtScreen(sx, sy);
    if (ctrl) {
      if (ctrl.type === 'GUIButton' && ctrl.OnClick) {
        // AGS loest GUI-Knoepfe beim LOSLASSEN aus (nicht beim Druecken): sonst sieht das Skript die noch gedrueckte Taste
        // auf dem darunterliegenden Spiel (z. B. Eck-Knopf unter dem schliessenden Menue-X -> Menue oeffnet sich sofort wieder)
        this.pendingGuiClick = { ctrl, button };
        return;
      }

      if (ctrl.type === 'GUISlider') {
        this.dragSlider = ctrl;   // Ziehen mit gedrueckter Taste/Finger (pointermove)
        this.setSliderFromX(ctrl, sx);
        return;
      }

      if (ctrl.type === 'GUIInventory') {
        const item = this.getInventoryItemAtScreen(sx, sy);
        if (item) {
          this.lastActivatedInvId = item.ID;
          const invBtn = button === AGS_CONSTANTS.eMouseRight ? AGS_CONSTANTS.eMouseRightInv : AGS_CONSTANTS.eMouseLeftInv;
          if (typeof globalThis.Verbs_ClickAt === 'function') {
            this.runAsyncAction(async () => {
              await globalThis.Verbs_ClickAt(sx, sy, invBtn);
            });
          }
        }
        return;
      }
    }

    // 2. Klick im Raum -> on_mouse_click(button) (nicht bei sichtbarer Modal-GUI)
    if (!this.isPaused() && typeof globalThis.on_mouse_click === 'function') {
      this.runAsyncAction(async () => {
        await globalThis.on_mouse_click(button);
      });
    }
  }

  setSliderFromX(ctrl, sx) {
    const g = ctrl.OwningGUI;
    const rel = Math.max(0, Math.min(1, (sx - (g.X + ctrl.X)) / Math.max(1, ctrl.Width)));
    const v = Math.round(ctrl.Min + rel * (ctrl.Max - ctrl.Min));
    if (v === ctrl.Value) return;
    ctrl.Value = v;
    const fn = globalThis[ctrl.OnChange];
    if (typeof fn === 'function') {
      // nicht ueber runAsyncAction: das Ziehen darf laufende Skripte (offenes Menue) nicht verdraengen
      Promise.resolve().then(() => fn(ctrl)).catch((err) => console.error('[Slider Fehler]', err));
    }
  }

  runAsyncAction(fn) {
    if (this.actionOccupied) return;
    this.actionOccupied = true;
    Promise.resolve()
      .then(() => fn())
      .catch((err) => console.error('[Engine Action Error]', err))
      .finally(() => {
        this.actionOccupied = false;
      });
  }

  // ---------------------------------------------------------------------------
  // 9. Hauptschleife (Update & Render)
  // ---------------------------------------------------------------------------

  startGameLoop() {
    const tickMs = 1000 / GAME_SPEED;
    let lastTime = performance.now();
    let acc = 0;

    const frame = (now) => {
      const dt = Math.min(100, now - lastTime);
      lastTime = now;
      acc += dt;
      while (acc >= tickMs) {
        this.updateTick();
        acc -= tickMs;
      }
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  updateCamera() {
    if (!this.currentRoom) return;
    if (this.camera.AutoTracking && this.player && this.camera.Width === W) {
      const maxX = Math.max(0, this.currentRoom.width - this.camera.Width);
      const targetX = Math.round(this.player.x - this.camera.Width / 2);
      this.camera.X = Math.max(0, Math.min(maxX, targetX));
      this.camera.Y = 0;
    }
  }

  // AGS pausiert das Spiel, solange eine PopupModal-GUI (Optionen, Speichern, Laden, Beenden) sichtbar ist
  isPaused() {
    return this.paused || this.guis.some((g) => g && g.Visible && g.PopupStyle === 'PopupModal');
  }

  updateTick() {
    if (this.afterFadeInQueue && !this.actionOccupied) {
      const f = this.afterFadeInQueue;
      this.afterFadeInQueue = null;
      this.runAsyncAction(f);
    }
    const pausiert = this.isPaused();
    if (!pausiert) {
      for (const ch of this.characters) {
        if (ch && ch.Room === this.currentRoomNumber) {
          ch.updateTick();
        }
      }
    }

    this.updateCamera();

    const script = this.roomScripts[this.currentRoomNumber];
    if (!pausiert && script && typeof script.room_RepExec === 'function') {
      script.room_RepExec();
    }

    if (typeof globalThis.repeatedly_execute_always === 'function') {
      globalThis.repeatedly_execute_always();
    }

    if (!pausiert && !this.actionOccupied && !this.repExecRunning && typeof globalThis.repeatedly_execute === 'function') {
      this.repExecRunning = true;
      Promise.resolve(globalThis.repeatedly_execute())
        .catch((err) => console.error('[repExec Error]', err))
        .finally(() => {
          this.repExecRunning = false;
        });
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Rendering (Szene, Figuren, Walk-behinds, GUIs, Overlays, Untertitel)
  // ---------------------------------------------------------------------------

  getCharacterSprite(ch) {
    const viewId = ch.LockedView
      ? ch.LockedView
      : (ch.Speaking && ch.SpeechView > 0 ? ch.SpeechView : ch.NormalView);
    const frames = this.getViewFrames(viewId, ch.Loop);
    if (frames.length === 0) return { img: null, flipped: false };
    const f = frames[Math.min(ch.Frame, frames.length - 1)] || frames[0];
    return {
      img: this.assets.getSpriteSync(f.sprite),
      flipped: !!f.flipped
    };
  }

  getCharacterRoomBBox(ch) {
    const { img } = this.getCharacterSprite(ch);
    const baseW = img ? img.width : 70;
    const baseH = img ? img.height : 150;
    const scale = (ch.Scaling || 100) / 100;
    const w = Math.round(baseW * scale);
    const h = Math.round(baseH * scale);
    const x = Math.round(ch.x - w / 2);
    const y = Math.round(ch.y - h);
    return { x, y, w, h };
  }

render() {
    const mainCtx = this.ctx;
    mainCtx.fillStyle = '#000000';
    mainCtx.fillRect(0, 0, W, H);
    // Handy-Modus: Kamera kleiner als der Bildschirm (462x260) -> Szene in Zwischenpuffer, danach auf 640x360 gezoomt
    const zoom = this.camera.Width < W;
    let ctx = mainCtx;
    if (zoom) {
      if (!this.zoomCanvas) { this.zoomCanvas = document.createElement('canvas'); this.zoomCanvas.width = W; this.zoomCanvas.height = H; }
      ctx = this.zoomCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
    }

    // 1. Szene (0..260) mit Clipping zeichnen
    const gMainVisible = Boolean(this.guiByName.gMain?.Visible);
    const viewH = gMainVisible ? SCENE_H : H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, viewH);
    ctx.clip();

    const camX = Math.round(this.camera.X);
    const camY = Math.round(this.camera.Y);

    if (this.currentBgCanvas) {
      ctx.drawImage(this.currentBgCanvas, -camX, -camY);
    }

    const renderList = [];
    const ignoreWbList = [];
    let seq = 0;

    // Walk-behind-Layer
    for (const wb of this.currentWbLayers) {
      renderList.push({
        type: 'wb',
        sortY: wb.baseline,
        typeOrder: 0,
        z: 0,
        seq: seq++,
        wb
      });
    }

    // Raum-Objekte (this.roomObjects oder globalThis.object)
    const roomObjects = this.roomObjects || globalThis.object || [];
    for (const obj of roomObjects) {
      if (!obj || !obj.Visible || (obj.Transparency || 0) >= 100) continue;
      let img = null;
      let flipped = false;
      if (obj.View > 0) {
        const frames = this.getViewFrames(obj.View, obj.Loop || 0);
        if (frames.length > 0) {
          const f = frames[Math.min(obj.Frame || 0, frames.length - 1)] || frames[0];
          img = this.assets.getSpriteSync(f.sprite);
          flipped = !!f.flipped;
        }
      } else if (obj.Graphic > 0) {
        img = this.assets.getSpriteSync(obj.Graphic);
      }
      if (!img) continue;

      const sortY = obj.Baseline > 0 ? obj.Baseline : obj.Y;
      const entry = {
        type: 'obj',
        sortY,
        typeOrder: 1,
        z: obj.ZOrder || 0,
        seq: seq++,
        obj,
        img,
        flipped
      };
      if (obj.IgnoreWalkbehinds) ignoreWbList.push(entry);
      else renderList.push(entry);
    }

    // Raum-Overlays
    for (const ov of this.overlays) {
      if (!ov || !ov.Valid || !ov.InRoom || (ov.Transparency || 0) >= 100) continue;
      const img = ov.Graphic ? this.assets.getSpriteSync(ov.Graphic) : null;
      const bottomY = (ov.Y || 0) + (img ? img.height : 0);
      const sortY = ov.ZOrder !== undefined && ov.ZOrder !== 0 ? ov.ZOrder : bottomY;
      renderList.push({
        type: 'roomOverlay',
        sortY,
        typeOrder: 1,
        z: ov.ZOrder || 0,
        seq: seq++,
        ov,
        img
      });
    }

    // Figuren im aktuellen Raum (mit automatischer Skalierung ueber FigSkal)
    for (const ch of this.characters) {
      if (!ch || ch.Room !== this.currentRoomNumber || ch.Visible === false || (ch.Transparency || 0) >= 100) {
        continue;
      }
      if (!ch.ManualScaling && typeof globalThis.FigSkal === 'function') {
        ch.Scaling = globalThis.FigSkal(ch.Room, ch.x, ch.y);
      }
      const sortY = ch.Baseline > 0 ? ch.Baseline : ch.y;
      const entry = {
        type: 'char',
        sortY,
        typeOrder: 2,
        z: ch.ZOrder || 0,
        seq: seq++,
        ch
      };
      if (ch.IgnoreWalkbehinds) ignoreWbList.push(entry);
      else renderList.push(entry);
    }

    const compareDepth = (a, b) =>
      (a.sortY - b.sortY) ||
      (a.typeOrder - b.typeOrder) ||
      (a.z - b.z) ||
      (a.seq - b.seq);

    renderList.sort(compareDepth);
    ignoreWbList.sort(compareDepth);

    const drawSceneItem = (item) => {
      if (item.type === 'wb') {
        ctx.drawImage(item.wb.canvas, -camX, -camY);
      } else if (item.type === 'obj') {
        const obj = item.obj;
        const img = item.img;
        const drawX = Math.round((obj.X || 0) - camX);
        const drawY = Math.round((obj.Y || 0) - img.height - camY);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (100 - (obj.Transparency || 0)) / 100));
        if (item.flipped) {
          ctx.translate(drawX + img.width, drawY);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0);
        } else {
          ctx.drawImage(img, drawX, drawY);
        }
        ctx.restore();
      } else if (item.type === 'roomOverlay') {
        const ov = item.ov;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (100 - (ov.Transparency || 0)) / 100));
        if (ov.Text !== null && ov.Text !== undefined) {
          const f = fontSpec(ov.Font);
          ctx.font = `${f.size}px VT323, monospace`;
          const lines = wrapLines(ctx, ov.Text, ov.Width || 600);
          const col = agsColorToCss(ov.Color);
          let ty = Math.round(ov.Y - camY - 2);
          for (const line of lines) {
            drawOutlinedText(ctx, line, Math.round(ov.X - camX), ty, col, f.outline, 'left');
            ty += f.lineHeight;
          }
        } else if (item.img) {
          ctx.drawImage(item.img, Math.round(ov.X - camX), Math.round(ov.Y - camY));
        }
        ctx.restore();
      } else if (item.type === 'char') {
        this.drawCharacterInRoom(ctx, item.ch, camX, camY);
      }
    };

    for (const item of renderList) {
      drawSceneItem(item);
    }
    for (const item of ignoreWbList) {
      drawSceneItem(item);
    }

    ctx.restore();
    if (zoom) {
      mainCtx.drawImage(this.zoomCanvas, 0, 0, this.camera.Width, this.camera.Height, 0, 0, W, H);
      ctx = mainCtx;
    }

    // 2. GUIs nach ZOrder zeichnen (Sichtbarkeit steuern die GUIs selbst; game.js setzt guiVisible nicht)
    if (this.guiVisible !== false) {
      if (Array.isArray(this.guis) && this.guis.length > 0) {
        const visibleGuis = this.guis
          .filter((g) => g && g.Visible && (g.Transparency || 0) < 100)
          .sort((a, b) => (a.ZOrder || 0) - (b.ZOrder || 0));
        for (const g of visibleGuis) {
          if (g === globalThis.gMain && typeof this.renderClassicGui === 'function') {
            this.renderClassicGui(ctx);
          } else if (typeof this.renderGui === 'function') {
            this.renderGui(ctx, g);
          }
        }
      } else if (globalThis.gMain && globalThis.gMain.Visible && (globalThis.gMain.Transparency || 0) < 100 && typeof this.renderClassicGui === 'function') {
        this.renderClassicGui(ctx);
      }
    }

    // 3. Bildschirm-Overlays nach ZOrder
    const screenOverlays = this.overlays
      .filter((ov) => ov && ov.Valid && !ov.InRoom && (ov.Transparency || 0) < 100)
      .sort((a, b) => (a.ZOrder || 0) - (b.ZOrder || 0));

    for (const ov of screenOverlays) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (100 - (ov.Transparency || 0)) / 100));
      if (ov.Text !== null && ov.Text !== undefined) {
        const f = fontSpec(ov.Font);
        ctx.font = `${f.size}px VT323, monospace`;
        const lines = wrapLines(ctx, ov.Text, ov.Width || 600);
        const col = agsColorToCss(ov.Color);
        let ty = ov.Y - 2;
        for (const line of lines) {
          drawOutlinedText(ctx, line, ov.X, ty, col, f.outline, 'left');
          ty += f.lineHeight;
        }
      } else if (ov.Graphic) {
        const img = this.assets.getSpriteSync(ov.Graphic);
        if (img) ctx.drawImage(img, Math.round(ov.X), Math.round(ov.Y));
      }
      ctx.restore();
    }

    // 4. Untertitel
    if (this.activeSpeech) {
      this.renderSpeechSubtitle(ctx, this.activeSpeech);
    }

    // 5. Mauszeiger
    if (!globalThis.Touch_IsOn || !globalThis.Touch_IsOn()) {
      this.renderCursor(ctx);
    }
  }

  drawCharacterInRoom(ctx, ch, camX, camY) {
    const { img, flipped } = this.getCharacterSprite(ch);
    if (!img || img._isPlaceholder) return;
    const bbox = this.getCharacterRoomBBox(ch);
    const sx = bbox.x - camX;
    const sy = bbox.y - camY;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (100 - (ch.Transparency || 0)) / 100));
    if (flipped) {
      ctx.translate(sx + bbox.w, sy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, bbox.w, bbox.h);
    } else {
      ctx.drawImage(img, sx, sy, bbox.w, bbox.h);
    }
    ctx.restore();
  }

  renderGui(ctx, g, hoveredCtrl) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (100 - (g.Transparency || 0)) / 100));

    if (g.BackgroundGraphic > 0) {
      const bgImg = this.assets.getSpriteSync(g.BackgroundGraphic);
      if (bgImg && !bgImg._isPlaceholder) {
        ctx.drawImage(bgImg, g.X, g.Y, g.Width, g.Height);
      }
    } else if (g.BackgroundColor > 0) {
      ctx.fillStyle = agsColorToCss(g.BackgroundColor);
      ctx.fillRect(g.X, g.Y, g.Width, g.Height);
    }

    const ctrls = [...g.Controls]
      .filter((c) => c && c.Visible)
      .sort((a, b) => (a.ZOrder || 0) - (b.ZOrder || 0) || a.ID - b.ID);

    for (const c of ctrls) {
      const cx = g.X + c.X;
      const cy = g.Y + c.Y;
      const isHover = hoveredCtrl === c;

      if (c.type === 'GUIButton') {
        const slot = (isHover && c.MouseOverGraphic > 0) ? c.MouseOverGraphic : c.NormalGraphic;
        const bImg = slot > 0 ? this.assets.getSpriteSync(slot) : null;
        if (bImg && !bImg._isPlaceholder) {
          ctx.drawImage(bImg, cx, cy, c.Width, c.Height);
        }
        const label = c.Text && c.Text !== 'New Button' ? c.Text : '';
        if (label) {
          const f = fontSpec(c.Font);
          ctx.font = `${f.size}px VT323, monospace`;
          const col = agsColorToCss(c.TextColor);
          const ty = cy + Math.max(0, Math.floor((c.Height - f.lineHeight) / 2)) - 1;
          drawOutlinedText(ctx, label, cx + Math.floor(c.Width / 2), ty, col, f.outline, 'center');
        }
      } else if (c.type === 'GUILabel') {
        if (c.Text) {
          const f = fontSpec(c.Font);
          ctx.font = `${f.size}px VT323, monospace`;
          const col = agsColorToCss(c.TextColor);
          let align = 'left';
          let tx = cx;
          if (/Center/i.test(c.TextAlignment)) {
            align = 'center';
            tx = cx + Math.floor(c.Width / 2);
          } else if (/Right/i.test(c.TextAlignment)) {
            align = 'right';
            tx = cx + c.Width;
          }
          drawOutlinedText(ctx, c.Text, tx, cy - 2, col, f.outline, align);
        }
      } else if (c.type === 'GUIInventory') {
        const perRow = c.ItemsPerRow;
        const rows = c.RowCount;
        const maxVisible = perRow * rows;
        for (let i = 0; i < maxVisible; i++) {
          const item = this.player?.inventory[c.TopItem + i];
          if (!item) continue;
          const col = i % perRow;
          const row = (i / perRow) | 0;
          const ix = cx + col * c.ItemWidth;
          const iy = cy + row * c.ItemHeight;
          const icon = this.assets.getSpriteSync(item.Graphic);
          if (icon && !icon._isPlaceholder) {
            const dx = Math.round(ix + (c.ItemWidth - icon.width) / 2);
            const dy = Math.round(iy + (c.ItemHeight - icon.height) / 2);
            ctx.drawImage(icon, dx, dy);
          }
        }
      } else if (c.type === 'GUISlider') {
        ctx.fillStyle = '#27324e';
        ctx.fillRect(cx, cy + Math.floor(c.Height / 2) - 2, c.Width, 4);
        const rel = (c.Value - c.Min) / Math.max(1, c.Max - c.Min);
        const hx = Math.round(cx + rel * (c.Width - 8));
        ctx.fillStyle = '#f6e08a';
        ctx.fillRect(hx, cy + 1, 8, c.Height - 2);
      }
    }

    ctx.restore();
  }

  renderSpeechSubtitle(ctx, speech) {
    const ch = speech.char;
    const f = fontSpec(AGS_CONSTANTS.eFontTumbleSpeech);
    ctx.save();
    ctx.font = `${f.size}px VT323, monospace`;
    const isInvisible = ch.Transparency >= 100 || ch.Room !== this.currentRoomNumber;
    const maxW = isInvisible ? 560 : 400;
    const lines = wrapLines(ctx, speech.text, maxW);

    let maxLineW = 0;
    for (const l of lines) {
      const w = ctx.measureText(l).width;
      if (w > maxLineW) maxLineW = w;
    }

    const totalH = lines.length * f.lineHeight;
    let centerX = W / 2;
    let topY = 18;

    if (!isInvisible) {
      const bbox = this.getCharacterRoomBBox(ch);
      const spTop = this.roomToScreenPoint(bbox.x + bbox.w / 2, bbox.y);
      centerX = spTop.x;
      topY = spTop.y - totalH - 10;
    } else {
      const sp = this.roomToScreenPoint(ch.x, ch.y);
      centerX = sp.x;
      topY = Math.max(12, sp.y - 120);
    }

    const maxBottom = (this.guiByName.gMain && this.guiByName.gMain.Visible) ? SCENE_H - 6 : H - 10;
    const halfW = maxLineW / 2 + 10;
    centerX = Math.max(halfW, Math.min(W - halfW, centerX));
    topY = Math.max(6, Math.min(maxBottom - totalH, topY));

    const color = ch.speechColorHex || agsColorToCss(ch.SpeechColor);
    for (let i = 0; i < lines.length; i++) {
      drawOutlinedText(ctx, lines[i], centerX, topY + i * f.lineHeight, color, 2, 'center');
    }
    ctx.restore();
  }

  renderCursor(ctx) {
    const mx = this.mouse.x;
    const my = this.mouse.y;

    if (this.mouse.Mode === AGS_CONSTANTS.eModeUseinv && this.player?.ActiveInventory) {
      const curSlot = this.player.ActiveInventory.CursorGraphic || this.player.ActiveInventory.Graphic;
      const curImg = this.assets.getSpriteSync(curSlot);
      if (curImg && !curImg._isPlaceholder) {
        ctx.drawImage(curImg, Math.round(mx - curImg.width / 2), Math.round(my - curImg.height / 2));
      }
    }

    const crossImg = this.assets.getSpriteSync(77);
    if (crossImg && !crossImg._isPlaceholder) {
      ctx.drawImage(crossImg, mx - 7, my - 7);
    } else {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(mx - 6, my - 1, 13, 3);
      ctx.fillRect(mx - 1, my - 6, 3, 13);
      ctx.fillStyle = '#f6e08a';
      ctx.fillRect(mx - 5, my, 11, 1);
      ctx.fillRect(mx, my - 5, 1, 11);
      ctx.restore();
    }
  }
}

// -----------------------------------------------------------------------------
// 4. Bootstrap: Fenster-Skalierung & Startbildschirm
// -----------------------------------------------------------------------------

(() => {
  const stage = document.getElementById('stage');
  const startDiv = document.getElementById('start');
  const goBtn = document.getElementById('go');
  const canvas = document.getElementById('screen');

  function fitLayout() {
    // sichtbarer Bereich (Adressleiste/Notch beruecksichtigt), Leinwand fuellt Breite oder Hoehe
    const vv = window.visualViewport;
    const vw = Math.floor((vv && vv.width) || window.innerWidth);
    const vh = Math.floor((vv && vv.height) || window.innerHeight);
    if (stage) {
      stage.style.setProperty('--s', Math.min(vw / 1280, vh / 720));
    }
    if (canvas) {
      const scale = Math.min(vw / W, vh / H);
      canvas.style.width = `${Math.floor(W * scale)}px`;
      canvas.style.height = `${Math.floor(H * scale)}px`;
    }
  }

  fitLayout();
  window.addEventListener('resize', fitLayout);
  window.addEventListener('orientationchange', () => setTimeout(fitLayout, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitLayout);
  // kein Zoom durch Doppeltipp (iOS ignoriert user-scalable=no) und kein Zwicken
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(ev, (ev2) => ev2.preventDefault(), { passive: false });
  }
  let letzterTipp = 0;
  document.addEventListener('touchend', (ev2) => {
    const jetzt = Date.now();
    if (jetzt - letzterTipp < 350) ev2.preventDefault();
    letzterTipp = jetzt;
  }, { passive: false });

  let engineInstance = null;
  async function bootEngine() {
    if (engineInstance) return;
    if (startDiv) startDiv.hidden = true;
    engineInstance = new AgsHtmlEngine(canvas);
    window.agsHtmlEngine = engineInstance;
    await engineInstance.init();
    return engineInstance;
  }

  async function starte() {
    {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { const ctx = new AC(); await ctx.resume(); ctx.close(); }
      } catch {}
      if (matchMedia('(pointer: coarse)').matches) {
        try { document.documentElement.requestFullscreen().catch(() => {}); } catch {}
        try { screen.orientation.lock('landscape').catch(() => {}); } catch {}
      }
      return bootEngine();
    }
  }
  if (goBtn) goBtn.addEventListener('click', () => { goBtn.disabled = true; starte(); });
  // «Weiterspielen» nur ohne ?autostart/?room (Tests laufen unveraendert)
  { const q = new URLSearchParams(location.search); if (CFG.startKnopf && !q.get('autostart') && !q.get('room')) Spielstand.startKnopf(stage, starte); }

  if (new URLSearchParams(location.search).get('autostart') === '1') {
    bootEngine();
  }
})();
