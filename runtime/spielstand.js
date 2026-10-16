// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// Autosave + Spielstand herunterladen/hochladen der HTML-Engine.
// Autosave: eigener Platz «auto» (localStorage «<prefix>_autosave»), ueberschreibt nie manuelle Plaetze («<prefix>_save_slot_<n>»).
// Bedienung: Knopf «Stand» (oben rechts) oder Taste F9 oeffnet die Liste (Autosave zuoberst, dann manuelle Plaetze).
import { CFG } from './config.js';
const AUTO_KEY = `${CFG.storagePrefix}_autosave`;
const FORMAT = CFG.saveFormat;
const SLOT_RE = new RegExp(`^${CFG.storagePrefix.replace(/[^\\w-]/g, '')}_save_slot_(\\d+)$`);
const VERSION = 1;
const MIN_ABSTAND = 20000;   // ms zwischen Zusatz-Speicherungen (Tab verlassen / Seite schliessen)

const zweistellig = (n) => String(n).padStart(2, '0');
const datumText = (t) => {
  const d = new Date(t);
  return `${zweistellig(d.getDate())}.${zweistellig(d.getMonth() + 1)}.${d.getFullYear()} ${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;
};

export class Spielstand {
  constructor(engine) {
    this.engine = engine;
    this.letzter = 0;
    this.warteRaum = null;
    this.offen = false;
    this.fehler = '';
    this._baueOberflaeche();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.autosave(true); });
    window.addEventListener('pagehide', () => this.autosave(true));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F9') { e.preventDefault(); e.stopPropagation(); this.umschalten(); }
      else if (this.offen && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter' || e.key === 'Tab')) {
        e.stopPropagation();   // solange die Liste offen ist, bekommt das Spiel keine Tasten (Esc ueberspringt sonst Szenen)
        if (e.key === 'Escape') { e.preventDefault(); this.schliessen(); }
      }
    }, true);
  }

  // ---- Lesen ----------------------------------------------------------------
  static autoLesen() { return Spielstand.lesen(AUTO_KEY); }
  static lesen(key) {
    try { const p = JSON.parse(localStorage.getItem(key) || 'null'); return p && typeof p === 'object' ? p : null; } catch { return null; }
  }
  raumText(raum) {
    const r = this.engine.data && this.engine.data.rooms && this.engine.data.rooms.rooms[raum];
    return r ? (r.title || r.slug || `Raum ${raum}`) : `Raum ${raum}`;
  }

  // ---- Autosave -------------------------------------------------------------
  // Aufruf aus loadRoom: erst speichern, wenn keine Aktion mehr laeuft (Raum ist dann fertig geladen)
  raumGewechselt(raum) {
    if (!this._speicherbar(raum)) return;
    clearTimeout(this.warteRaum);
    let versuche = 0;
    const pruefe = () => {
      versuche++;
      if (this.engine.currentRoomNumber !== raum) return;   // schon weitergezogen: der naechste Wechsel kuemmert sich
      if (!this._speicherbar(raum)) return;
      // Zwischensequenz/Dialog laeuft (Aktion belegt): weiter warten, gespeichert wird erst danach (hoechstens 10 Min.)
      if (this.engine.actionOccupied || this.engine.afterFadeInQueue) { if (versuche < 1200) this.warteRaum = setTimeout(pruefe, 500); return; }
      this.autosave(false);
    };
    this.warteRaum = setTimeout(pruefe, 600);
  }
  _speicherbar(raum) {
    const e = this.engine;
    if (!e || !e.player || CFG.noAutosaveRooms.includes(raum)) return false;   // z. B. Intro/Abspann
    if (CFG.introDoneVar && !globalThis[CFG.introDoneVar] && !(raum >= CFG.autosaveMinRoom && !CFG.noAutosaveRooms.includes(raum))) return false;
    return true;
  }
  async autosave(zusatz) {
    const e = this.engine;
    try {
      if (!this._speicherbar(e.currentRoomNumber)) return;
      if (zusatz && (e.actionOccupied || Date.now() - this.letzter < MIN_ABSTAND)) return;
      this.letzter = Date.now();
      const desc = `Autosave (${datumText(Date.now())}, ${this.raumText(e.currentRoomNumber)})`;
      await e.saveGameSlot('auto', desc);
    } catch (err) { console.warn('[Autosave Fehler]', err); }
  }

  // ---- Datei ----------------------------------------------------------------
  dateiName() {
    const d = new Date();
    return `${FORMAT}-${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}-${zweistellig(d.getHours())}${zweistellig(d.getMinutes())}.json`;
  }
  herunterladen(payload) {
    const raum = this.engine.data.rooms.rooms[payload.room];
    const datei = {
      format: FORMAT, version: VERSION, erstellt: new Date().toISOString(),
      episode: raum ? raum.episode : null, raum: payload.room, raumName: this.raumText(payload.room),
      spielzeit: payload.timestamp, beschreibung: payload.desc, stand: payload
    };
    const blob = new Blob([JSON.stringify(datei)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = this.dateiName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async aktuellerStand() {
    return this.engine.saveGameSlot('tmp', `Stand (${datumText(Date.now())}, ${this.raumText(this.engine.currentRoomNumber)})`, true);
  }
  // Prueft eine hochgeladene Datei; liefert { payload } oder { fehler }
  pruefe(text) {
    let d;
    try { d = JSON.parse(text); } catch { return { fehler: 'Die Datei ist kein gültiger Spielstand (kein lesbares JSON).' }; }
    if (!d || typeof d !== 'object' || d.format !== FORMAT) return { fehler: CFG.texts.notSaveFile };
    if (!Number.isInteger(d.version) || d.version > VERSION) return { fehler: 'Diese Datei stammt von einer neueren Spielversion und kann nicht geladen werden.' };
    const p = d.stand;
    if (!p || typeof p !== 'object' || !p.globals || typeof p.globals !== 'object' || !Number.isFinite(p.room)
        || !Array.isArray(p.inventoryIds) || (p.characters && !Array.isArray(p.characters)))
      return { fehler: 'Der Spielstand in der Datei ist unvollständig oder beschädigt.' };
    if (!this.engine.data.rooms.rooms[p.room]) return { fehler: `Der Spielstand verweist auf einen unbekannten Raum (${p.room}).` };
    if (p.screenshot && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.screenshot)) delete p.screenshot;
    return { payload: p };
  }
  async ausDatei(file) {
    this.fehler = '';
    if (!file) return;
    if (file.size > 8e6) { this._zeigeFehler('Die Datei ist zu gross für einen Spielstand.'); return; }
    let text;
    try { text = await file.text(); } catch { this._zeigeFehler('Die Datei konnte nicht gelesen werden.'); return; }
    const r = this.pruefe(text);
    if (r.fehler) { this._zeigeFehler(r.fehler); return; }
    this.schliessen();
    await this.engine.restoreGameSlot('datei', r.payload);
  }

  // ---- Oberflaeche ----------------------------------------------------------
  _baueOberflaeche() {
    const st = document.createElement('style');
    st.textContent = `
#spKnopf{position:fixed;top:6px;right:6px;z-index:40;font:inherit;font-size:22px;line-height:1;padding:4px 10px;color:#f6e08a;background:rgba(0,0,0,.6);border:2px solid #f6e08a;cursor:pointer;opacity:.55}
#spKnopf:hover,#spKnopf:focus-visible{opacity:1}
#spBox{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;font-family:"VT323",monospace;color:#f6e08a;touch-action:auto}
#spBox[hidden]{display:none}
#spBox .tafel{width:min(560px,94vw);max-height:92vh;overflow:auto;background:#0a0c14;border:4px solid #f6e08a;padding:12px 14px;font-size:24px}
#spBox h2{margin:0 0 8px;font-weight:normal;font-size:32px}
#spBox .zeile{display:flex;gap:8px;align-items:center;border-top:2px solid #3a3320;padding:6px 0}
#spBox .zeile img{width:80px;height:45px;background:#000;border:1px solid #6a5d2e;flex:none;image-rendering:pixelated}
#spBox .zeile .txt{flex:1;min-width:0;line-height:1.05;overflow-wrap:anywhere}
#spBox button,#spBox label.knopf{font:inherit;font-size:22px;color:#f6e08a;background:#000;border:2px solid #f6e08a;padding:3px 10px;cursor:pointer;touch-action:manipulation}
#spBox button:hover,#spBox button:focus-visible,#spBox label.knopf:hover,#spBox label.knopf:focus-within{background:#2a2310;outline:2px solid #fff}
#spBox .fuss{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#spBox .fehler{color:#ff9a8a;margin:8px 0 0;min-height:1.1em}
#spBox input[type=file]{position:absolute;opacity:0;width:1px;height:1px}`;
    document.head.appendChild(st);
    const knopf = document.createElement('button');
    knopf.id = 'spKnopf'; knopf.type = 'button'; knopf.textContent = 'Stand'; knopf.title = 'Spielstand: Weiterspielen, herunterladen, aus Datei laden (F9)';
    knopf.addEventListener('click', () => this.umschalten());
    // Maus/Touch holen keinen Fokus: sonst oeffnet ein spaeteres Enter (Sprechzeile ueberspringen) die Liste erneut
    knopf.addEventListener('mousedown', (e) => e.preventDefault());
    knopf.addEventListener('pointerdown', (e) => e.stopPropagation());    document.body.appendChild(knopf);
    const box = document.createElement('div');
    box.id = 'spBox'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Spielstände'); box.lang = 'de';
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(box);
    this.knopf = knopf; this.box = box;
  }
  umschalten() { if (this.offen) this.schliessen(); else this.oeffnen(); }
  // Fokus nach dem Schliessen ans Spiel zurueck (nicht auf den Knopf), damit Enter/Leertaste wieder das Spiel steuern
  schliessen() { this.offen = false; this.box.hidden = true; if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }
  oeffnen() { this.offen = true; this.fehler = ''; this._zeichne(); this.box.hidden = false; const b = this.box.querySelector('button'); if (b) b.focus(); }
  _zeigeFehler(t) { this.fehler = t; const f = this.box.querySelector('.fehler'); if (f) f.textContent = t; else this.oeffnen(); }
  _el(tag, text, attrs) { const e = document.createElement(tag); if (text) e.textContent = text; Object.assign(e, attrs || {}); return e; }
  _eintraege() {
    const liste = [];
    const a = Spielstand.autoLesen();
    if (a) liste.push({ key: 'auto', titel: a.desc || 'Autosave', p: a });
    const nummern = [];
    for (let i = 0; i < localStorage.length; i++) {
      const m = SLOT_RE.exec(localStorage.key(i) || '');
      if (m) nummern.push(Number(m[1]));
    }
    nummern.sort((x, y) => x - y);
    for (const n of nummern) {
      const p = Spielstand.lesen(`${CFG.storagePrefix}_save_slot_${n}`);
      if (!p) continue;
      const roh = String(p.desc || 'Spielstand').replace(';', ' – ');
      liste.push({ key: n, titel: `${n === 990 ? 'Automatisch' : 'Platz ' + n}: ${roh}`, p });
    }
    return liste;
  }
  _zeichne() {
    const box = this.box; box.textContent = '';
    const tafel = this._el('div', '', { className: 'tafel' });
    tafel.appendChild(this._el('h2', 'Spielstände'));
    const eintraege = this._eintraege();
    if (!eintraege.length) tafel.appendChild(this._el('div', 'Noch nichts gespeichert. Der Autosave entsteht nach dem ersten Raumwechsel.', { className: 'zeile' }));
    for (const en of eintraege) {
      const z = this._el('div', '', { className: 'zeile' });
      if (en.p.screenshot && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(en.p.screenshot)) z.appendChild(this._el('img', '', { src: en.p.screenshot, alt: '' }));
      const t = this._el('div', '', { className: 'txt' });
      t.appendChild(this._el('div', en.titel));
      if (en.p.timestamp) t.appendChild(this._el('div', `${datumText(en.p.timestamp)} · ${this.raumText(en.p.room)}`));
      z.appendChild(t);
      const laden = this._el('button', 'Laden', { type: 'button' });
      laden.addEventListener('click', async () => { this.schliessen(); await this.engine.restoreGameSlot(en.key); });
      const dl = this._el('button', 'Herunterladen', { type: 'button' });
      dl.addEventListener('click', () => this.herunterladen(en.p));
      z.appendChild(laden); z.appendChild(dl);
      tafel.appendChild(z);
    }
    const fuss = this._el('div', '', { className: 'fuss' });
    const aktuell = this._el('button', 'Aktuellen Stand herunterladen', { type: 'button' });
    aktuell.addEventListener('click', async () => { const p = await this.aktuellerStand(); if (p) this.herunterladen(p); else this._zeigeFehler('Der aktuelle Stand konnte nicht erstellt werden.'); });
    const datei = this._el('label', 'Aus Datei laden', { className: 'knopf' });
    const inp = this._el('input', '', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; inp.value = ''; await this.ausDatei(f); });
    datei.tabIndex = 0;
    datei.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    datei.appendChild(inp);
    const zu = this._el('button', 'Schliessen', { type: 'button' });
    zu.addEventListener('click', () => this.schliessen());
    fuss.appendChild(aktuell); fuss.appendChild(datei); fuss.appendChild(zu);
    tafel.appendChild(fuss);
    tafel.appendChild(this._el('div', this.fehler, { className: 'fehler', role: 'alert' }));
    box.appendChild(tafel);
  }

  // ---- Startbildschirm: «Weiterspielen» ---------------------------------------
  // startDiv = #start, boot = Funktion, die die Engine startet und die Engine zurueckgibt
  static startKnopf(buehne, boot) {
    const a = Spielstand.autoLesen();
    if (!a || !a.globals || !buehne) return;
    const b = document.createElement('button');
    b.id = 'weiter'; b.type = 'button';
    const raum = a.room;
    b.textContent = `Weiterspielen (${datumText(a.timestamp || Date.now())})`;
    b.setAttribute('style', 'position:absolute;left:50%;bottom:36px;transform:translateX(-50%);min-width:520px;padding:6px 30px;font:inherit;font-size:40px;color:#f6e08a;background:rgba(0,0,0,.82);border:4px solid #f6e08a;cursor:pointer');
    b.addEventListener('click', async () => {
      b.disabled = true;
      const eng = await boot();
      if (eng) await eng.restoreGameSlot('auto');
    });
    buehne.appendChild(b);
    return raum;
  }
}
