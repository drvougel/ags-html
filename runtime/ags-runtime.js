// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// AGS-3.6-API-Laufzeit fuer das uebersetzte game.js und die Engine (engine.js)
import { CFG } from './config.js';

export const W = 640;
export const H = 360;
export const SCENE_H = 260;
export const GUI_TOP = 260;
export const GUI_H = 100;
export const GAME_SPEED = 40;

export const AGS_CONSTANTS = {
  eBlock: 919,
  eNoBlock: 920,
  eOnce: 0,
  eRepeat: 1,
  eWalkableAreas: 1,
  eAnywhere: 0,
  eDirectionDown: 0,
  eDirectionLeft: 1,
  eDirectionRight: 2,
  eDirectionUp: 3,
  eMouseLeft: 1,
  eMouseRight: 2,
  eMouseMiddle: 3,
  eMouseLeftInv: 4,
  eMouseRightInv: 5,
  eMouseMiddleInv: 6,
  eModeWalkto: 0,
  eModeLookat: 1,
  eModeInteract: 2,
  eModeTalkto: 3,
  eModeUseinv: 4,
  eModePickup: 5,
  eModePointer: 6,
  eModeWait: 7,
  eModeUsermode1: 8,
  eModeUsermode2: 9,
  eLocationNothing: 0,
  eLocationHotspot: 1,
  eLocationCharacter: 2,
  eLocationObject: 3,
  eFontTumbleText: 0,
  eFontTumbleSpeech: 1,
  eFontTumbleOutlineSpeech: 2,
  eFontTumbleTiny: 3,
  eFontTumbleTextOut: 4,
  eFontTumbleDlg: 5,
  eFontTumbleMenu: 6,
  eAlignLeft: 0,
  eAlignCenter: 1,
  eAlignRight: 2,
  eSpeechVoiceAndText: 0,
  eSpeechVoiceOnly: 1,
  eSpeechTextOnly: 2,
  eEventEnterRoomBeforeFadein: 1,
  eEventLeaveRoom: 2,
  eEventGotScore: 3,
  eEventDialogOptionsOpen: 4,
  eEventDialogOptionsClose: 5,
  eEventSaveGame: 6,
  eEventRestoreGame: 7,
  eAudioTypeAmbientSound: 1,
  eAudioTypeMusic: 2,
  eAudioTypeSound: 3,
  eVolExistingAndFuture: 0,
  eRoundDown: 0,
  eFileRead: 1,
  eFileWrite: 2,
  eFileAppend: 3,
  // Enum Action aus verbgui.ash (0..11)
  eGA_LookAt: 0,
  eGA_TalkTo: 1,
  eGA_GiveTo: 2,
  eGA_PickUp: 3,
  eGA_Use: 4,
  eGA_Open: 5,
  eGA_Close: 6,
  eGA_Push: 7,
  eGA_Pull: 8,
  eGA_UseInv: 9,
  eGA_Default: 10,
  eGA_WalkTo: 11,
  // Tasten
  eKeyEscape: 27,
  eKeyReturn: 13,
  eKeySpace: 32,
  eKeyBackspace: 8,
  eKeyTab: 9,
  eKey0: 48,
  eKey1: 49,
  eKey2: 50,
  eKey3: 51,
  eKey4: 52,
  eKey5: 53,
  eKey6: 54,
  eKey7: 55,
  eKey8: 56,
  eKey9: 57,
  eKeyA: 65,
  eKeyB: 66,
  eKeyC: 67,
  eKeyD: 68,
  eKeyE: 69,
  eKeyF: 70,
  eKeyG: 71,
  eKeyH: 72,
  eKeyI: 73,
  eKeyJ: 74,
  eKeyK: 75,
  eKeyL: 76,
  eKeyM: 77,
  eKeyN: 78,
  eKeyO: 79,
  eKeyP: 80,
  eKeyQ: 81,
  eKeyR: 82,
  eKeyS: 83,
  eKeyT: 84,
  eKeyU: 85,
  eKeyV: 86,
  eKeyW: 87,
  eKeyX: 88,
  eKeyY: 89,
  eKeyZ: 90,
  eKeyF1: 359,
  eKeyF2: 360,
  eKeyF3: 361,
  eKeyF4: 362,
  eKeyF5: 363,
  eKeyF6: 364,
  eKeyF7: 365,
  eKeyF8: 366,
  eKeyF9: 367,
  eKeyF10: 368,
  eKeyF11: 369,
  eKeyF12: 370,
  eKeyHome: 371,
  eKeyUpArrow: 372,
  eKeyPageUp: 373,
  eKeyLeftArrow: 375,
  eKeyRightArrow: 377,
  eKeyEnd: 379,
  eKeyDownArrow: 380,
  eKeyPageDown: 381,
  eKeyInsert: 382,
  eKeyDelete: 383,
  eKeyCtrlLeft: 403,
  eKeyShiftLeft: 404,
  eKeyModCtrl: 0x0040
};

// -----------------------------------------------------------------------------
// 1. Farben, Schriften & Text-Hilfsfunktionen
// -----------------------------------------------------------------------------

export function agsColorToCss(col) {
  if (typeof col === 'string') return col;
  const n = Number(col) || 0;
  if (n === 65535) return '#ffffff';
  if (n === 15) return '#fcfcfc';
  if (n === 0) return '#000000';
  if (n > 65535) {
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgb(${r},${g},${b})`;
  }
  const r = ((n >> 11) & 0x1f) << 3;
  const g = ((n >> 5) & 0x3f) << 2;
  const b = (n & 0x1f) << 3;
  return `rgb(${r},${g},${b})`;
}

export function rgbToAgsColor(r, g, b) {
  return (1 << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

export function fontSpec(fontId) {
  switch (Number(fontId)) {
    case 3: return { size: 11, lineHeight: 12, outline: 1 };
    case 5: return { size: 18, lineHeight: 16, outline: 1 }; // eFontTumbleDlg
    case 6: return { size: 14, lineHeight: 14, outline: 0 }; // eFontTumbleMenu
    case 1:
    case 2:
    case 4:
      return { size: 22, lineHeight: 22, outline: 2 };       // eFontTumbleSpeech
    case 0:
    default:
      return { size: 20, lineHeight: 19, outline: 0 };       // eFontTumbleText
  }
}

export function wrapLines(ctx, text, maxWidth) {
  const raw = String(text ?? '').replace(/\[/g, '\n');
  const paragraphs = raw.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = cur + ' ' + words[i];
      if (ctx.measureText(test).width <= maxWidth) {
        cur = test;
      } else {
        lines.push(cur);
        cur = words[i];
      }
    }
    lines.push(cur);
  }
  return lines;
}

export function drawOutlinedText(ctx, text, x, y, color, outlineWidth = 2, align = 'left') {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (outlineWidth > 0) {
    ctx.fillStyle = '#000000';
    for (let dy = -outlineWidth; dy <= outlineWidth; dy++) {
      for (let dx = -outlineWidth; dx <= outlineWidth; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > outlineWidth + 1) continue;
        ctx.fillText(text, Math.round(x + dx), Math.round(y + dy));
      }
    }
  }
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}

// -----------------------------------------------------------------------------
// 2. AGS String-Erweiterungen
// -----------------------------------------------------------------------------

export function installAgsStringExtensions() {
  String.Format = function (fmt, ...args) {
    let i = 0;
    return String(fmt ?? '').replace(/%(\d+)?([dsfc])/g, (_, pad, spec) => {
      const a = args[i++];
      if (spec === 'c') {
        return typeof a === 'number' ? String.fromCharCode(a) : String(a ?? '').charAt(0);
      }
      if (spec === 'd') {
        const numStr = String(Math.trunc(Number(a) || 0));
        if (pad && pad.startsWith('0')) return numStr.padStart(Number(pad), '0');
        return pad ? numStr.padStart(Number(pad), ' ') : numStr;
      }
      return String(a ?? '');
    });
  };

  String.IsNullOrEmpty = function (s) {
    return s === null || s === undefined || String(s).length === 0;
  };

  if (!Object.getOwnPropertyDescriptor(String.prototype, 'Length')) {
    Object.defineProperty(String.prototype, 'Length', {
      get() { return this.length; },
      configurable: true
    });
  }

  if (!Object.getOwnPropertyDescriptor(String.prototype, 'Chars')) {
    Object.defineProperty(String.prototype, 'Chars', {
      get() {
        const str = String(this);
        return new Proxy([], {
          get(_t, prop) {
            const idx = Number(prop);
            if (Number.isFinite(idx)) return str.charCodeAt(idx) || 0;
            return undefined;
          }
        });
      },
      configurable: true
    });
  }

  String.prototype.Append = function (s) { return String(this) + String(s ?? ''); };
  String.prototype.IndexOf = function (sub) { return String(this).indexOf(String(sub ?? '')); };
  String.prototype.Contains = function (sub) { return String(this).indexOf(String(sub ?? '')); };
  String.prototype.Truncate = function (len) { return String(this).slice(0, Math.max(0, Number(len) || 0)); };
  String.prototype.Substring = function (start, len) { return String(this).substr(Number(start) || 0, Number(len) || 0); };
  String.prototype.UpperCase = function () { return String(this).toUpperCase(); };
  String.prototype.LowerCase = function () { return String(this).toLowerCase(); };
  String.prototype.ReplaceCharAt = function (index, chOrCode) {
    const s = String(this);
    const idx = Number(index) || 0;
    if (idx < 0 || idx >= s.length) return s;
    const ch = typeof chOrCode === 'number' ? String.fromCharCode(chOrCode) : String(chOrCode).charAt(0);
    return s.slice(0, idx) + ch + s.slice(idx + 1);
  };
}

// -----------------------------------------------------------------------------
// 3. DrawingSurface, DynamicSprite & Overlay
// -----------------------------------------------------------------------------

export class AGSDrawingSurface {
  constructor(canvas, engine, onRelease = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.engine = engine;
    this.onRelease = onRelease;
    this.DrawingColor = 65535;
  }

  Clear(color = 0) {
    this.ctx.fillStyle = agsColorToCss(color);
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  DrawRectangle(x1, y1, x2, y2) {
    this.ctx.fillStyle = agsColorToCss(this.DrawingColor);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) + 1;
    const h = Math.abs(y2 - y1) + 1;
    this.ctx.fillRect(left, top, w, h);
  }

  DrawLine(x1, y1, x2, y2, thickness = 1) {
    this.ctx.save();
    this.ctx.strokeStyle = agsColorToCss(this.DrawingColor);
    this.ctx.lineWidth = thickness;
    this.ctx.beginPath();
    this.ctx.moveTo(x1 + 0.5, y1 + 0.5);
    this.ctx.lineTo(x2 + 0.5, y2 + 0.5);
    this.ctx.stroke();
    this.ctx.restore();
  }

  DrawTriangle(x1, y1, x2, y2, x3, y3) {
    this.ctx.save();
    this.ctx.fillStyle = agsColorToCss(this.DrawingColor);
    this.ctx.beginPath();
    this.ctx.moveTo(x1 + 0.5, y1 + 0.5);
    this.ctx.lineTo(x2 + 0.5, y2 + 0.5);
    this.ctx.lineTo(x3 + 0.5, y3 + 0.5);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  DrawCircle(x, y, radius) {
    this.ctx.save();
    this.ctx.fillStyle = agsColorToCss(this.DrawingColor);
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  DrawImage(x, y, slot, transparency = 0, width = 0, height = 0) {
    const img = this.engine.assets.getSpriteSync(slot);
    if (!img) return;
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, (100 - Number(transparency || 0)) / 100));
    if (width > 0 && height > 0) {
      this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    } else {
      this.ctx.drawImage(img, Math.round(x), Math.round(y));
    }
    this.ctx.restore();
  }

  DrawString(x, y, fontId, text) {
    const f = fontSpec(fontId);
    this.ctx.save();
    this.ctx.font = `${f.size}px VT323, monospace`;
    drawOutlinedText(this.ctx, String(text ?? ''), x, y - 2, agsColorToCss(this.DrawingColor), f.outline, 'left');
    this.ctx.restore();
  }

  DrawStringWrapped(x, y, width, fontId, alignment, text) {
    const f = fontSpec(fontId);
    this.ctx.save();
    this.ctx.font = `${f.size}px VT323, monospace`;
    const lines = wrapLines(this.ctx, text, width);
    const col = agsColorToCss(this.DrawingColor);
    let curY = y - 2;
    for (const line of lines) {
      let tx = x;
      let align = 'left';
      if (alignment === AGS_CONSTANTS.eAlignCenter) {
        tx = x + width / 2;
        align = 'center';
      } else if (alignment === AGS_CONSTANTS.eAlignRight) {
        tx = x + width;
        align = 'right';
      }
      drawOutlinedText(this.ctx, line, tx, curY, col, f.outline, align);
      curY += f.lineHeight;
    }
    this.ctx.restore();
  }

  Release() {
    if (this.onRelease) this.onRelease();
  }
}

export class AGSDynamicSprite {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.Graphic = engine.assets.registerDynamicCanvas(canvas);
  }

  get Width() { return this.canvas.width; }
  get Height() { return this.canvas.height; }

  GetDrawingSurface() {
    return new AGSDrawingSurface(this.canvas, this.engine);
  }

  Crop(x, y, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.getContext('2d').drawImage(c, 0, 0);
  }

  Resize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, w, h);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.getContext('2d').drawImage(c, 0, 0);
  }

  Delete() {
    this.engine.assets.deleteDynamicSlot(this.Graphic);
  }
}

export class AGSOverlay {
  constructor(opts) {
    this.X = opts.x || 0;
    this.Y = opts.y || 0;
    this.Width = opts.width || 0;
    this.Font = opts.font || 0;
    this.Color = opts.color ?? 65535;
    this.Text = opts.text ?? null;
    this.Graphic = opts.graphic || 0;
    this.InRoom = !!opts.inRoom;
    this.Transparency = 0;
    this.ZOrder = opts.zOrder || 0;
    this.Valid = true;
    this.engine = opts.engine;
  }

  Remove() {
    this.Valid = false;
    const idx = this.engine.overlays.indexOf(this);
    if (idx >= 0) this.engine.overlays.splice(idx, 1);
  }
}

// -----------------------------------------------------------------------------
// 4. Character, Hotspot, Object & InventoryItem
// -----------------------------------------------------------------------------

export class AGSCharacter {
  constructor(data, engine) {
    this.engine = engine;
    this.ID = data.id;
    this.ScriptName = data.scriptName;
    this.Name = data.realName;
    this.SpeakerKey = data.speakerKey;
    this.Room = data.startingRoom;
    this.x = data.startX;
    this.y = data.startY;
    this.NormalView = data.normalView;
    this.SpeechView = data.speechView;
    this.View = data.normalView;
    this.Loop = 0;
    this.Frame = 0;
    this.Clickable = data.clickable;
    this.Solid = data.solid;
    this.MovementSpeed = data.movementSpeed || 18;
    this.WalkSpeedX = data.movementSpeed || 18;
    this.WalkSpeedY = data.movementSpeed || 18;
    this.AnimationSpeed = data.animationDelay || 3;
    this.AnimationDelay = data.animationDelay || 3;
    this.SpeechAnimationDelay = data.speechAnimationDelay || 5;
    this.SpeechColor = data.speechColor;
    this.speechColorHex = data.speechColorHex || '#ffffff';
    this.ManualScaling = !data.useRoomAreaScaling;
    this.Scaling = 100;
    this.Transparency = 0;
    this.Moving = false;
    this.Speaking = false;
    this.LockedView = 0;
    this.AnimPlaying = false;
    this.AnimRepeat = false;
    this.AnimDelay = 4;
    this.AnimTick = 0;
    this.AnimResolve = null;
    this.path = [];
    this.walkTick = 0;
    this.walkResolve = null;
    this.runMultiplier = 1;
    this.anyClick = data.anyClick;
    this.inventory = [];
    this._activeInv = null;
  }

  // AGS: player.ActiveInventory setzen schaltet den Mauszeiger auf eModeUseinv (Satzzeile «Gib X an …», «Benutze X mit …»)
  get ActiveInventory() { return this._activeInv; }
  set ActiveInventory(item) {
    this._activeInv = item || null;
    const m = globalThis.mouse;
    if (globalThis.player === this && m) {
      if (item) m.Mode = AGS_CONSTANTS.eModeUseinv;
      else if (m.Mode === AGS_CONSTANTS.eModeUseinv) m.Mode = AGS_CONSTANTS.eModeWalkto;
    }
  }

  get z() { return 0; }
  set z(_v) {}

  SetWalkSpeed(sx, sy) {
    this.WalkSpeedX = Number(sx) || 3;
    this.WalkSpeedY = Number(sy) || this.WalkSpeedX;
    this.runMultiplier = this.WalkSpeedX > 24 ? 1.8 : 1;
  }

  SetAsPlayer() {
    this.engine.player = this;
    globalThis.player = this;
  }

  HasInventory(item) {
    if (!item || !item.ID) return false;
    const id = typeof item === 'object' ? item.ID : Number(item);
    return this.inventory.some((it) => it.ID === id);
  }

  AddInventory(item) {
    if (!item || !item.ID) return;
    if (!this.HasInventory(item)) {
      this.inventory.push(item);
      if (globalThis.invMain) globalThis.invMain._sync();
    }
  }

  LoseInventory(item) {
    if (!item || !item.ID) return;
    const id = typeof item === 'object' ? item.ID : Number(item);
    this.inventory = this.inventory.filter((it) => it.ID !== id);
    if (this.ActiveInventory && this.ActiveInventory.ID === id) {
      this.ActiveInventory = null;
    }
    if (globalThis.invMain) globalThis.invMain._sync();
  }

  StopMoving() {
    this.Moving = false;
    this.path = [];
    this.Frame = 0;
    if (this.walkResolve) {
      const r = this.walkResolve;
      this.walkResolve = null;
      r();
    }
  }

  async Walk(tx, ty, blocking = AGS_CONSTANTS.eNoBlock, where = AGS_CONSTANTS.eWalkableAreas) {
    this.StopMoving();
    if (this.Room !== this.engine.currentRoomNumber) {
      this.x = Math.round(tx);
      this.y = Math.round(ty);
      return;
    }
    const masks = this.engine.currentMasks;
    const anywhere = where === AGS_CONSTANTS.eAnywhere || !masks;
    const waypoints = masks ? masks.findPath(this.x, this.y, tx, ty, anywhere) : [[Math.round(tx), Math.round(ty)]];
    if (!waypoints || waypoints.length === 0) return;

    this.path = waypoints;
    this.Moving = true;
    this.walkTick = 0;

    if (blocking === AGS_CONSTANTS.eBlock) {
      await new Promise((resolve) => {
        this.walkResolve = resolve;
      });
    }
  }

  async FaceDirection(dir, blocking = AGS_CONSTANTS.eNoBlock) {
    this.Loop = Number(dir) || 0;
    this.Frame = 0;
    if (blocking === AGS_CONSTANTS.eBlock) {
      await this.engine.Wait(1);
    }
  }

  async FaceLocation(lx, ly, blocking = AGS_CONSTANTS.eNoBlock) {
    this.facePoint(lx, ly);
    if (blocking === AGS_CONSTANTS.eBlock) {
      await this.engine.Wait(1);
    }
  }

  async FaceCharacter(otherChar, blocking = AGS_CONSTANTS.eNoBlock) {
    if (!otherChar) return;
    this.facePoint(otherChar.x, otherChar.y);
    if (blocking === AGS_CONSTANTS.eBlock) {
      await this.engine.Wait(1);
    }
  }

  facePoint(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.Loop = dx < 0 ? 1 : 2;
    } else {
      this.Loop = dy < 0 ? 3 : 0;
    }
    this.Frame = 0;
  }

  // Character.ChangeView - setzt die Normal-Ansicht
  ChangeView(viewId) {
    this.NormalView = Number(viewId);
    if (!this.LockedView) this.View = this.NormalView;
  }

  LockView(viewId) {
    this.LockedView = Number(viewId);
    this.View = this.LockedView;
    this.Frame = 0;
  }

  LockViewFrame(viewId, loop, frame) {
    this.LockView(viewId);
    this.Loop = Number(loop) || 0;
    this.Frame = Number(frame) || 0;
  }

  ChangeView(viewId) {
    this.NormalView = Number(viewId);
    if (!this.LockedView) this.View = this.NormalView;
  }

  UnlockView() {
    this.LockedView = 0;
    this.AnimPlaying = false;
    this.View = this.NormalView;
    this.Frame = 0;
    if (this.AnimResolve) {
      const r = this.AnimResolve;
      this.AnimResolve = null;
      r();
    }
  }

  async Animate(loop, delay, repeat = AGS_CONSTANTS.eOnce, blocking = AGS_CONSTANTS.eBlock) {
    this.Loop = Number(loop) || 0;
    this.Frame = 0;
    this.AnimDelay = Math.max(1, Number(delay) || 4);
    this.AnimRepeat = repeat === AGS_CONSTANTS.eRepeat;
    this.AnimPlaying = true;
    this.AnimTick = 0;

    if (blocking === AGS_CONSTANTS.eBlock && !this.AnimRepeat) {
      await new Promise((resolve) => {
        this.AnimResolve = resolve;
      });
    }
  }

  async Say(text) {
    await this.engine.sayCharacter(this, String(text ?? ''));
  }

  async ChangeRoom(roomNum, x, y, dir) {
    const r = Number(roomNum);
    if (x !== undefined) this.x = Math.round(x);
    if (y !== undefined) this.y = Math.round(y);
    if (dir !== undefined) this.Loop = Number(dir) || 0;
    this.StopMoving();
    if (this === this.engine.player) {
      await this.engine.loadRoom(r, this.x, this.y);
    } else {
      this.Room = r;
    }
  }

  async EnterRoom(roomNum, x, y, dir) {
    await this.ChangeRoom(roomNum, x, y, dir);
    if (dir !== undefined) await this.FaceDirection(dir);
  }

  IsInteractionAvailable(_mode) {
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    return typeof fn === 'function' ? 1 : 0;
  }

  async RunInteraction(mode) {
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    if (typeof fn === 'function') {
      await fn(this, mode);
    } else if (globalThis.Verbs && typeof globalThis.Verbs.Unhandled === 'function') {
      await globalThis.Verbs.Unhandled();
    }
  }

  updateTick() {
    if (this.AnimPlaying) {
      this.AnimTick++;
      if (this.AnimTick >= this.AnimDelay) {
        this.AnimTick = 0;
        const frames = this.engine.getViewFrames(this.View, this.Loop);
        if (frames.length === 0 || this.Frame + 1 >= frames.length) {
          if (this.AnimRepeat) {
            this.Frame = 0;
          } else {
            this.AnimPlaying = false;
            if (this.AnimResolve) {
              const r = this.AnimResolve;
              this.AnimResolve = null;
              r();
            }
          }
        } else {
          this.Frame++;
        }
      }
      return;
    }

    if (this.Speaking && this.SpeechView > 0 && !this.LockedView) {
      this.walkTick++;
      if (this.walkTick >= (this.SpeechAnimationDelay || 5)) {
        this.walkTick = 0;
        const frames = this.engine.getViewFrames(this.SpeechView, this.Loop);
        if (frames.length > 0) {
          this.Frame = (this.Frame + 1) % frames.length;
        }
      }
      return;
    }

    if (this.Moving && this.path.length > 0) {
      const [wx, wy] = this.path[0];
      const dx = wx - this.x;
      const dy = wy - this.y;
      const dist = Math.hypot(dx, dy);

      if (Math.abs(dx) >= Math.abs(dy) * 0.75) {
        this.Loop = dx < 0 ? 1 : 2;
      } else {
        this.Loop = dy < 0 ? 3 : 0;
      }

      const scaleFactor = (this.Scaling || 100) / 100;
      const baseStep = (this.MovementSpeed / Math.max(1, this.AnimationDelay || 3)) * scaleFactor * this.runMultiplier;
      const step = Math.max(1.2, baseStep);

      if (dist <= step) {
        this.x = wx;
        this.y = wy;
        this.path.shift();
        if (this.path.length === 0) {
          this.Moving = false;
          this.Frame = 0;
          this.runMultiplier = 1;
          if (this.walkResolve) {
            const r = this.walkResolve;
            this.walkResolve = null;
            r();
          }
          return;
        }
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }

      this.walkTick++;
      const delay = Math.max(1, Math.round((this.AnimationDelay || 3) / this.runMultiplier));
      if (this.walkTick >= delay) {
        this.walkTick = 0;
        const frames = this.engine.getViewFrames(this.NormalView, this.Loop);
        if (frames.length > 1) {
          const cycleLen = frames.length - 1;
          this.Frame = (this.Frame % cycleLen) + 1;
        } else {
          this.Frame = 0;
        }
      }
    }
  }
}

export class AGSHotspot {
  constructor(data, engine) {
    this.engine = engine;
    this.ID = data.index || 0;
    this.index = data.index || 0;
    this.Name = data.name || '';
    this.ScriptName = data.script || '';
    this.WalkToX = data.walkTo ? data.walkTo[0] : 0;
    this.WalkToY = data.walkTo ? data.walkTo[1] : 0;
    this.Enabled = data.enabled !== false;
    this.anyClick = data.anyClick || (data.script ? `${data.script}_AnyClick` : '');
  }

  IsInteractionAvailable(_mode) {
    if (!this.Enabled || !this.anyClick) return 0;
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    return typeof fn === 'function' ? 1 : 0;
  }

  async RunInteraction(mode) {
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    if (typeof fn === 'function') {
      await fn(this, mode);
    } else if (globalThis.Verbs && typeof globalThis.Verbs.Unhandled === 'function') {
      await globalThis.Verbs.Unhandled();
    }
  }
}

export class AGSObject {
  constructor(data, engine) {
    this.engine = engine;
    this.ID = data.id || 0;
    this.Name = data.name || '';
    this.ScriptName = data.scriptName || '';
    this.X = data.x || 0;
    this.Y = data.y || 0;
    this.Graphic = data.graphic || 0;
    this.Visible = data.visible !== false;
    this.Clickable = data.clickable !== false;
    this.Baseline = data.baseline || 0;
    this.Transparency = 0;
    this.anyClick = data.anyClick || (data.scriptName ? `${data.scriptName}_AnyClick` : '');
  }

  IsInteractionAvailable(_mode) {
    if (!this.Visible || !this.Clickable || !this.anyClick) return 0;
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    return typeof fn === 'function' ? 1 : 0;
  }

  async RunInteraction(mode) {
    const roomScript = this.engine.roomScripts[this.engine.currentRoomNumber];
    const fn = roomScript?.[this.anyClick] || globalThis[this.anyClick];
    if (typeof fn === 'function') {
      await fn(this, mode);
    } else if (globalThis.Verbs && typeof globalThis.Verbs.Unhandled === 'function') {
      await globalThis.Verbs.Unhandled();
    }
  }
}

export class AGSInventoryItem {
  constructor(data, engine) {
    this.engine = engine;
    this.ID = data.id;
    this.ScriptName = data.scriptName;
    this.Name = data.name;
    this.Graphic = data.graphic;
    this.CursorGraphic = data.cursorGraphic;
    this.PlayerStartsWithItem = !!data.playerStartsWithItem;
    this.otherClick = data.otherClick || `${data.scriptName}_OtherClick`;
    this.events = data.events || {};
  }

  IsInteractionAvailable(mode) {
    if (mode === AGS_CONSTANTS.eModeInteract) {
      return this.events[1] ? 1 : 0;
    }
    const fn = globalThis[this.otherClick];
    return typeof fn === 'function' ? 1 : 0;
  }

  async RunInteraction(mode) {
    const fn = globalThis[this.otherClick];
    if (typeof fn === 'function') {
      await fn(this, mode);
    } else if (globalThis.Verbs && typeof globalThis.Verbs.Unhandled === 'function') {
      await globalThis.Verbs.Unhandled();
    }
  }
}

// -----------------------------------------------------------------------------
// 5. GUI-System (GUI, Button, Label, Slider, InvWindow)
// -----------------------------------------------------------------------------

export class AGSGUIControl {
  constructor(ctrlData, owningGui, engine) {
    this.engine = engine;
    this.OwningGUI = owningGui;
    this.type = ctrlData.type;
    this.ID = ctrlData.id;
    this.Name = ctrlData.name;
    this.X = ctrlData.left || 0;
    this.Y = ctrlData.top || 0;
    this.Width = ctrlData.width || 0;
    this.Height = ctrlData.height || 0;
    this.Visible = ctrlData.visible !== false;
    this.Enabled = ctrlData.enabled !== false;
    this.Clickable = ctrlData.clickable !== false;
    this.ZOrder = ctrlData.zOrder || 0;

    this.Text = ctrlData.text || '';
    this.Font = ctrlData.font || 0;
    this.TextColor = ctrlData.textColor ?? 65535;
    this.TextAlignment = ctrlData.textAlignment || 'Left';
    this.NormalGraphic = ctrlData.normalGraphic || 0;
    this.MouseOverGraphic = ctrlData.mouseOverGraphic || 0;
    this.PushedGraphic = ctrlData.pushedGraphic || 0;
    this.OnClick = ctrlData.onClick || '';

    this.Min = ctrlData.minValue ?? 0;
    this.Max = ctrlData.maxValue ?? 100;
    this.Value = ctrlData.value ?? 50;
    this.OnChange = ctrlData.onChange || '';

    this.ItemWidth = ctrlData.itemWidth || 58;
    this.ItemHeight = ctrlData.itemHeight || 36;
    this.TopItem = 0;
  }

  get Graphic() { return this.NormalGraphic; }
  set Graphic(v) { this.NormalGraphic = v; }

  get AsButton() { return this.type === 'GUIButton' ? this : null; }
  get AsLabel() { return this.type === 'GUILabel' ? this : null; }
  get AsSlider() { return this.type === 'GUISlider' ? this : null; }
  get AsInvWindow() { return this.type === 'GUIInventory' ? this : null; }

  get ItemCount() { return this.engine.player ? this.engine.player.inventory.length : 0; }
  get ItemsPerRow() { return Math.max(1, Math.floor(this.Width / this.ItemWidth)); }
  get RowCount() { return Math.max(1, Math.floor(this.Height / this.ItemHeight)); }

  _sync() {
    if (this.TopItem >= this.ItemCount) {
      this.TopItem = Math.max(0, Math.floor((this.ItemCount - 1) / this.ItemsPerRow) * this.ItemsPerRow);
    }
  }

  ScrollUp() {
    this.TopItem = Math.max(0, this.TopItem - this.ItemsPerRow);
  }

  ScrollDown() {
    if (this.TopItem + this.ItemsPerRow * this.RowCount < this.ItemCount) {
      this.TopItem += this.ItemsPerRow;
    }
  }

  SetPosition(x, y) {
    this.X = Math.round(x);
    this.Y = Math.round(y);
  }

  SetSize(w, h) {
    this.Width = Math.round(w);
    this.Height = Math.round(h);
  }
}

export class AGSGUI {
  constructor(guiData, engine) {
    this.engine = engine;
    this.ID = guiData.id;
    this.Name = guiData.name;
    this.X = guiData.left || 0;
    this.Y = guiData.top || 0;
    this.Width = guiData.width || W;
    this.Height = guiData.height || H;
    this.BackgroundGraphic = guiData.backgroundGraphic || 0;
    this.BackgroundColor = guiData.backgroundColor || 0;
    this.Visible = guiData.visible !== false;
    this.Clickable = guiData.clickable !== false;
    this.PopupStyle = guiData.popupStyle || 'Normal';
    this.Transparency = guiData.transparency || 0;
    this.ZOrder = guiData.zOrder || 0;
    this.Controls = (guiData.controls || []).map((c) => new AGSGUIControl(c, this, engine));
  }

  get ControlCount() { return this.Controls.length; }

  SetPosition(x, y) {
    this.X = Math.round(x);
    this.Y = Math.round(y);
  }

  SetSize(w, h) {
    this.Width = Math.round(w);
    this.Height = Math.round(h);
  }
}

// -----------------------------------------------------------------------------
// 6. Virtuelles Dateisystem (File.Open fuer touch.cfg)
// -----------------------------------------------------------------------------

export class AGSFile {
  static Open(filename, mode) {
    const key = `${CFG.storagePrefix}_file_${filename}`;
    if (mode === AGS_CONSTANTS.eFileRead) {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      let pos = 0;
      const bytes = raw.split(',').map(Number);
      return {
        ReadRawChar: () => (pos < bytes.length ? bytes[pos++] : 0),
        Close: () => {}
      };
    }
    const bytes = [];
    return {
      WriteRawChar: (c) => bytes.push(Number(c) & 255),
      Close: () => {
        try { localStorage.setItem(key, bytes.join(',')); } catch {}
      }
    };
  }
}

// -----------------------------------------------------------------------------
// 7. Installation der gesamten globalen AGS-API & Tumbleweed-Defaults
// -----------------------------------------------------------------------------

export function installAgsGlobalApi(engine) {
  const G = globalThis;
  Object.assign(G, AGS_CONSTANTS);
  installAgsStringExtensions();

  G.GetGameSpeed = () => GAME_SPEED;
  G.Random = (max) => Math.floor(Math.random() * (Number(max) + 1));
  G.FloatToInt = (v) => Math.trunc(Number(v) || 0);
  G.IntToFloat = (v) => Number(v) || 0;
  G.Maths = { Sin: Math.sin, Cos: Math.cos, Sqrt: Math.sqrt };

  G.DateTime = {
    get Now() {
      const d = new Date();
      return {
        RawTime: Math.floor(d.getTime() / 1000),
        Year: d.getFullYear(),
        Month: d.getMonth() + 1,
        DayOfMonth: d.getDate(),
        Hour: d.getHours(),
        Minute: d.getMinutes(),
        Second: d.getSeconds()
      };
    }
  };

  // Browser-Klasse File nicht ersetzen - nur File.Open (AGS) ergaenzen
  File.Open = (filename, mode) => AGSFile.Open(filename, mode);
  G.DoubleClick = { Event: { 1: false, 2: false } };

  G.Wait = (ticks) => engine.Wait(ticks);
  G.IsKeyPressed = (keyCode) => engine.keysDown.has(Number(keyCode));
  G.PauseGame = () => { engine.paused = true; };
  G.UnPauseGame = () => { engine.paused = false; };
  G.IsGamePaused = () => engine.isPaused();

  G.GetTranslation = (s) => String(s ?? '');
  G.GetFontHeight = (fontId) => fontSpec(fontId).lineHeight;
  G.GetTextWidth = (text, fontId) => {
    const f = fontSpec(fontId);
    engine.ctx.save();
    engine.ctx.font = `${f.size}px VT323, monospace`;
    const w = Math.ceil(engine.ctx.measureText(String(text ?? '')).width);
    engine.ctx.restore();
    return w;
  };
  G.GetTextHeight = (text, fontId, width) => {
    const f = fontSpec(fontId);
    engine.ctx.save();
    engine.ctx.font = `${f.size}px VT323, monospace`;
    const lines = wrapLines(engine.ctx, String(text ?? ''), width);
    engine.ctx.restore();
    return Math.max(f.lineHeight, lines.length * f.lineHeight);
  };

  G.ShakeScreen = () => {};
  G.RemoveWalkableArea = (area) => {
    if (engine.currentMasks) engine.currentMasks.activeWalkAreas &= ~(1 << Number(area));
  };
  G.RestoreWalkableArea = (area) => {
    if (engine.currentMasks) engine.currentMasks.activeWalkAreas |= (1 << Number(area));
  };

  G.Display = async (text) => {
    await engine.displayMessageBox(String(text ?? ''));
  };

  G.SaveGameSlot = async (slot, desc) => {
    await engine.saveGameSlot(slot, desc);
  };
  G.RestoreGameSlot = async (slot) => {
    await engine.restoreGameSlot(slot);
  };
  G.SetRestartPoint = () => {};
  G.RestartGame = async () => {
    location.reload();
  };
  G.QuitGame = () => {
    if (CFG.quitUrl) location.href = CFG.quitUrl; else location.reload();
  };
  G.AbortGame = (msg) => {
    console.error('[AbortGame]', msg);
  };
  G.SaveScreenShot = () => {};
  G.Debug = (cmd) => {
    if (cmd === 2) engine.debugShowWalkable = !engine.debugShowWalkable;
  };

  G.GetLocationType = (sx, sy) => engine.getLocationTypeAtScreen(sx, sy);
  G.IsInteractionAvailable = (sx, sy, mode) => engine.isInteractionAvailableAtScreen(sx, sy, mode);

  G.Character = {
    GetAtScreenXY: (sx, sy) => engine.getCharacterAtScreen(sx, sy),
    GetAtRoomXY: (rx, ry) => engine.getCharacterAtRoom(rx, ry)
  };
  G.Hotspot = {
    GetAtScreenXY: (sx, sy) => engine.getHotspotAtScreen(sx, sy),
    GetAtRoomXY: (rx, ry) => engine.getHotspotAtRoom(rx, ry)
  };
  // Nicht globalThis.Object ersetzen (bricht Object.assign usw.) - AGS-Methoden an das native Object haengen
  Object.GetAtScreenXY = (sx, sy) => engine.getObjectAtScreen(sx, sy);
  Object.GetAtRoomXY = (rx, ry) => engine.getObjectAtRoom(rx, ry);
  G.InventoryItem = {
    GetAtScreenXY: (sx, sy) => engine.getInventoryItemAtScreen(sx, sy)
  };
  G.GUI = {
    GetAtScreenXY: (sx, sy) => engine.getGuiAtScreen(sx, sy)
  };
  G.GUIControl = {
    GetAtScreenXY: (sx, sy) => engine.getGuiControlAtScreen(sx, sy)
  };

  // Globale Arrays fuer direkten Indexzugriff in AGS-Skripten
  // tools/js-idiv.mjs: AGS-Ganzzahldivision (int / int schneidet ab) fuer game.js
  G.__idiv = (a, b) => Math.trunc(a / b);
  G.character = engine.characters;
  G.hotspot = engine.roomHotspots;
  G.object = engine.roomObjects;
  G.inventory = engine.inventory;
  G.gui = engine.guis;

  G.mouse = engine.mouse;
  G.Mouse = engine.mouse;

  G.Screen = {
    Width: W,
    Height: H,
    Viewport: {
      SetPosition: (x, y, w, h) => {
        engine.viewport = { x, y, width: w, height: h };
      }
    },
    ScreenToRoomPoint: (sx, sy) => engine.screenToRoomPoint(sx, sy)
  };

  G.Room = {
    get Width() { return engine.currentRoom ? engine.currentRoom.width : W; },
    get Height() { return engine.currentRoom ? engine.currentRoom.height : H; },
    get ObjectCount() { return engine.roomObjects.length; },
    GetDrawingSurfaceForBackground: () => engine.getRoomDrawingSurface(),
    ProcessClick: async (sx, sy, mode) => {
      await engine.processRoomClick(sx, sy, mode);
    }
  };

  const spriteWidthProxy = new Proxy({}, {
    get(_t, slot) { return engine.assets.getSpriteWidth(Number(slot)); }
  });
  const spriteHeightProxy = new Proxy({}, {
    get(_t, slot) { return engine.assets.getSpriteHeight(Number(slot)); }
  });

  G.Game = {
    Camera: engine.camera,
    SpriteWidth: spriteWidthProxy,
    SpriteHeight: spriteHeightProxy,
    get CharacterCount() { return engine.characters.length; },
    get InventoryItemCount() { return engine.inventory.length - 1; },
    SpeechFont: 1,
    NormalFont: 0,
    get TranslationFilename() { return engine.translationFilename; },
    get SpeechVoxFilename() { return engine.speechVox; },
    ChangeSpeechVox: (name) => { engine.speechVox = String(name || ''); },
    GetColorFromRGB: (r, g, b) => rgbToAgsColor(r, g, b),
    GetLocationName: (sx, sy) => engine.getLocationNameAtScreen(sx, sy),
    PlayVoiceClip: (ch, n) => engine.playVoiceClip(ch, n),
    GetSaveSlotDescription: (slot) => engine.getSaveSlotDescription(slot),
    SetAudioTypeVolume: (type, vol) => { engine.setAudioVolume(type, vol); }
  };

  G.game = {
    get inv_activated() { return engine.lastActivatedInvId || 1; }
  };

  G.Speech = { VoiceMode: 0 };

  G.DynamicSprite = {
    Create: (w, h) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w || 1));
      c.height = Math.max(1, Math.round(h || 1));
      return new AGSDynamicSprite(c, engine);
    },
    CreateFromExistingSprite: (slot) => {
      const img = engine.assets.getSpriteSync(slot);
      const c = document.createElement('canvas');
      c.width = img ? img.width : 70;
      c.height = img ? img.height : 49;
      if (img) c.getContext('2d').drawImage(img, 0, 0);
      const ds = new AGSDynamicSprite(c, engine);
      if (!img) {
        // Sprite ist noch nicht geladen (AGS hat alle Sprites im Speicher): nachladen und auf die (inzwischen evtl. skalierte) Leinwand zeichnen
        Promise.resolve(engine.assets.ensureSprite(slot)).then(() => {
          const im = engine.assets.getSpriteSync(slot);
          if (!im) return;
          const cx = ds.canvas.getContext('2d');
          cx.clearRect(0, 0, ds.canvas.width, ds.canvas.height);
          cx.imageSmoothingEnabled = false;
          cx.drawImage(im, 0, 0, ds.canvas.width, ds.canvas.height);
        });
      }
      return ds;
    },
    CreateFromBackground: (_frame, x, y, w, h) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      if (engine.currentBgCanvas) {
        c.getContext('2d').drawImage(engine.currentBgCanvas, x, y, w, h, 0, 0, w, h);
      }
      return new AGSDynamicSprite(c, engine);
    },
    CreateFromScreenShot: () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      c.getContext('2d').drawImage(engine.canvas, 0, 0);
      return new AGSDynamicSprite(c, engine);
    },
    CreateFromSaveGame: (slot, w, h) => engine.createSpriteFromSaveGame(slot, w, h)
  };

  G.Overlay = {
    CreateGraphical: (x, y, slot) => {
      const ov = new AGSOverlay({ x, y, graphic: slot, inRoom: false, engine });
      engine.overlays.push(ov);
      return ov;
    },
    CreateRoomGraphical: (x, y, slot) => {
      const ov = new AGSOverlay({ x, y, graphic: slot, inRoom: true, engine });
      engine.overlays.push(ov);
      return ov;
    },
    CreateTextual: (x, y, width, font, color, text) => {
      const ov = new AGSOverlay({ x, y, width, font, color, text, inRoom: false, engine });
      engine.overlays.push(ov);
      return ov;
    }
  };

  G.dDialog1 = {
    Start: async () => {}
  };
}

// Konfiguriert das Tumbleweed-Verben- und Options-Modul (wie die Einstellungsfunktion der Vorlage im AGS-Projekt).
// «Tumbleweed Verbs»: MIT-Lizenz, Copyright (c) 2017-present Dirk Kreyenberg u. a. – Hinweistext in THIRD_PARTY.md.
export function setupTumbleweedDefaults(tw = {}) {
  const G = globalThis;
  if (!G.Verbs || typeof G.Verbs.BindGuis !== 'function') return;

  G.Verbs.BindGuis(G.gAction, G.gMain, G.gPause, G.gQuit);
  G.Verbs.SetFonts(
    AGS_CONSTANTS.eFontTumbleText,
    AGS_CONSTANTS.eFontTumbleTextOut,
    AGS_CONSTANTS.eFontTumbleSpeech,
    AGS_CONSTANTS.eFontTumbleOutlineSpeech
  );

  const lc = tw.actionLabelColor || [39, 50, 78];
  if (tw.language && G[tw.language] !== undefined) G.Verbs.VerbGuiOptions[G.eVerbGuiTemplateLanguage] = G[tw.language];
  G.Verbs.VerbGuiOptions[G.eVerbGuiActionLabelColorNormal] = rgbToAgsColor(lc[0], lc[1], lc[2]);
  G.Verbs.VerbGuiOptions[G.eVerbGuiActionLabelColorHighlighted] = rgbToAgsColor(lc[0], lc[1], lc[2]);
  G.Verbs.VerbGuiOptions[G.eVerbGuiWalkOffScreenOffset] = 30;
  G.Verbs.VerbGuiOptions[G.eVerbGuiApproachCharInteract] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiNPCfacingPlayer] = 0;
  G.Verbs.VerbGuiOptions[G.eVerbGuiObjHotTalk] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiClassicInvHandling] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiClassicGui] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiExitDoorDoubleclick] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiExitExtensionDoubleclick] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiRunOnDoubleClick] = 1;
  G.Verbs.VerbGuiOptions[G.eVerbGuiRunCursorDistance] = 80;
  G.Verbs.VerbGuiOptions[G.eVerbGuiRunSpeedupRate] = 2;

  G.Verbs.MapButtons();
  G.Verbs.Localize();
  G.Verbs.AdjustGUIText();
  G.Verbs.SetDefaultAction(AGS_CONSTANTS.eGA_WalkTo);

  if (G.CustomSave && typeof G.CustomSave.SetGui === 'function') {
    G.CustomSave.SetGui(G.gSave, G.gSaveConfirm);
    if (tw.slotSprite) G.CustomSave.slotSprite = tw.slotSprite;
    if (tw.slotSpriteHi) G.CustomSave.slotSpriteHi = tw.slotSpriteHi;
    G.CustomSave.font = AGS_CONSTANTS.eFontTumbleMenu;
  }
  if (G.CustomLoad && typeof G.CustomLoad.SetGui === 'function') {
    G.CustomLoad.SetGui(G.gLoad, G.gSaveConfirm);
    if (tw.slotSprite) G.CustomLoad.slotSprite = tw.slotSprite;
    if (tw.slotSpriteHi) G.CustomLoad.slotSpriteHi = tw.slotSpriteHi;
    G.CustomLoad.font = AGS_CONSTANTS.eFontTumbleMenu;
  }
}
