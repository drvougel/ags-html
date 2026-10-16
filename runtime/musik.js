// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// Musik der HTML-Engine: Raum -> Stueck laut data/musik.json, gleiches Stueck laeuft weiter,
// anderes wird ueberblendet; Loop nahtlos ueber Web Audio (AudioBufferSourceNode.loop); Start erst nach der ersten Nutzer-Interaktion.
// Musik-Regler: AGS Game.SetAudioTypeVolume(eAudioTypeMusic, v) -> Engine.setAudioVolume(1, v) -> Musik.setzeLautstaerke(v/100); Wert in localStorage.
// musik.json: { ueberblendung, stuecke: { name: { datei, vol, start?, ende? } }, raeume: { "52": "name", … }, titel: "name" }

import { CFG } from './config.js';
const LS_KEY = `${CFG.storagePrefix}_musik_vol`;

export class Musik {
  constructor(assets) {
    this.assets = assets;
    this.daten = { ueberblendung: 1.5, stuecke: {}, raeume: {} };
    this.puffer = new Map();      // Stueckname -> Promise<AudioBuffer|null>
    this.aktuell = null;          // { name, quelle, gain }
    this.gewuenscht = null;       // Stueckname, den der letzte Raumwechsel wollte (auch wenn noch gesperrt/ladend)
    this.vol = 0.9;               // Musik-Regler 0..1
    this.freigeschaltet = false;
    this.ctx = null;
    this.master = null;
    this.zaehler = 0;             // verwirft veraltete asynchrone Starts
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.master.connect(this.ctx.destination);
      }
    } catch { this.ctx = null; }
    this._gestenHoerer();
  }

  async laden(url = './data/musik.json') {
    try {
      const r = await fetch(url);
      if (r.ok) this.daten = { ...this.daten, ...(await r.json()) };
    } catch { /* ohne Musikdaten bleibt es stumm */ }
  }

  // Beim Start nach game_start(): gespeicherten Reglerwert uebernehmen (Regler im Optionsmenue mitziehen)
  wiederherstellen(slider) {
    let gespeichert = null;
    try { const s = localStorage.getItem(LS_KEY); if (s !== null) gespeichert = Math.max(0, Math.min(100, Number(s))); } catch {}
    if (gespeichert !== null && Number.isFinite(gespeichert)) {
      this.setzeLautstaerke(gespeichert / 100, false);
      if (slider) { try { slider.Value = gespeichert; } catch {} }
    } else if (slider && Number.isFinite(Number(slider.Value))) {
      this.setzeLautstaerke(Number(slider.Value) / 100, false);
    }
  }

  setzeLautstaerke(v, speichern = true) {
    this.vol = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master) { try { this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.05); } catch { this.master.gain.value = this.vol; } }
    if (speichern) { try { localStorage.setItem(LS_KEY, String(Math.round(this.vol * 100))); } catch {} }
  }

  _gestenHoerer() {
    const frei = () => {
      if (this.freigeschaltet) return;
      this.freigeschaltet = true;
      for (const e of ['pointerdown', 'touchend', 'keydown', 'click']) window.removeEventListener(e, frei, true);
      const fertig = () => { if (this.gewuenscht) this._starte(this.gewuenscht); };
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().then(fertig, fertig); else fertig();
    };
    for (const e of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(e, frei, true);
    // Ohne Gestenpflicht (Autoplay erlaubt, Tests): laeuft der Kontext von selbst
    if (this.ctx) this.ctx.onstatechange = () => { if (this.ctx.state === 'running' && !this.freigeschaltet) frei(); };
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else if (this.freigeschaltet) this.ctx.resume().catch(() => {});
    });
  }

  // Aufruf bei jedem Raumwechsel
  raum(nr) {
    const name = this.daten.raeume?.[String(nr)] || null;
    this.spiele(name);
  }

  spiele(name) {
    if (name && !this.daten.stuecke?.[name]) name = null;
    this.gewuenscht = name;
    if (this.aktuell && this.aktuell.name === name) return;           // gleiches Stueck: weiterlaufen
    if (!this.ctx || !this.freigeschaltet || this.ctx.state !== 'running') { if (!name) this._beende(); return; }
    this._starte(name);
  }

  _lade(name) {
    if (this.puffer.has(name)) return this.puffer.get(name);
    const s = this.daten.stuecke[name];
    const p = fetch(this.assets.resolveUrl(s.datei)).then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, nein) => this.ctx.decodeAudioData(b, ok, nein)))
      .catch((e) => { console.warn('[Musik] Laden fehlgeschlagen:', name, e); this.puffer.delete(name); return null; });
    this.puffer.set(name, p);
    return p;
  }

  _beende() {
    const alt = this.aktuell; this.aktuell = null; this.zaehler++;
    if (alt) this._ausblenden(alt);
  }

  _ausblenden(t) {
    const d = Number(this.daten.ueberblendung) || 1.5;
    const jetzt = this.ctx.currentTime;
    try {
      t.gain.gain.cancelScheduledValues(jetzt);
      t.gain.gain.setValueAtTime(t.gain.gain.value, jetzt);
      t.gain.gain.linearRampToValueAtTime(0, jetzt + d);
      t.quelle.stop(jetzt + d + 0.05);
    } catch {}
    setTimeout(() => { try { t.gain.disconnect(); } catch {} }, (d + 0.2) * 1000);
  }

  async _starte(name) {
    if (!this.ctx || !this.freigeschaltet) return;
    if (this.aktuell && this.aktuell.name === name) return;
    const nr = ++this.zaehler;
    if (!name) { const alt = this.aktuell; this.aktuell = null; if (alt) this._ausblenden(alt); return; }
    const buf = await this._lade(name);
    if (!buf || nr !== this.zaehler || this.gewuenscht !== name) return;   // inzwischen anderer Raum
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch {} }
    const s = this.daten.stuecke[name];
    const d = Number(this.daten.ueberblendung) || 1.5;
    const gain = this.ctx.createGain();
    const ziel = Math.max(0, Math.min(1, s.vol ?? 1));
    const jetzt = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, jetzt);
    gain.gain.linearRampToValueAtTime(ziel, jetzt + d);
    gain.connect(this.master);
    const q = this.ctx.createBufferSource();
    q.buffer = buf; q.loop = true;
    const start = Math.max(0, Number(s.start) || 0);
    const ende = Number(s.ende) || 0;
    if (start) q.loopStart = start;
    if (ende > start) q.loopEnd = Math.min(ende, buf.duration);
    q.connect(gain);
    q.start(0, start);
    const alt = this.aktuell;
    this.aktuell = { name, quelle: q, gain };
    if (alt) this._ausblenden(alt);
  }

  // Fuer Tests/Debug
  zustand() {
    return {
      stueck: this.aktuell?.name || null,
      gewuenscht: this.gewuenscht,
      regler: Math.round(this.vol * 100),
      master: this.master ? this.master.gain.value : null,
      ctx: this.ctx?.state || 'keiner',
      freigeschaltet: this.freigeschaltet
    };
  }
}
