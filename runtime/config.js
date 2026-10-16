// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
//
// Laufzeit-Konfiguration: data/config.json (vom Exporter aus dem Abschnitt "runtime" der ags-html.config.json
// geschrieben). Wird per Top-Level-await geladen, bevor irgendein anderes Modul sie braucht
// (Speicherschluessel, Musik-Regler, Autosave-Knopf lesen localStorage schon vor engine.init()).

export const DEFAULTS = {
  storagePrefix: 'ags',                         // localStorage-Schluessel: <prefix>_autosave, <prefix>_save_slot_<n>, <prefix>_musik_vol, <prefix>_file_<name>
  saveFormat: 'ags-html-save',                  // Kennung in heruntergeladenen Spielstand-Dateien
  texts: {
    notSaveFile: 'Das ist keine Spielstand-Datei dieses Spiels.'
  },
  assetBase: '../',                             // Spiel-Dateipfade der JSON-Daten werden relativ zu <Seite>/<assetBase> geladen
  spriteFallbackDir: '',                        // Rueckfall «<dir>/<slot>.png», wenn views.json keinen Pfad kennt ('' = aus)
  playerScriptName: '',                         // Rueckfall-Spielfigur, falls Game.agf keine Hauptfigur kennt
  noAutosaveRooms: [],                          // Raeume (Intro/Abspann), in denen nie automatisch gespeichert wird
  autosaveMinRoom: 0,                           // Autosave erst ab dieser Raumnummer ODER wenn <introDoneVar> gesetzt ist
  introDoneVar: '',                             // globale Skriptvariable (z. B. "gIntroDone"), die nach dem Intro != 0 ist
  fallbackRoom: null,                           // { background, walkable, hotspotMask } fuer Raeume ohne Eintrag in rooms.json
  quitUrl: '',                                  // Ziel von QuitGame() ('' = Seite neu laden)
  verbsGoToFix: false,                          // Tumbleweed: Verbs.GoTo nimmt Hotspot-Laufziele
  tumbleweed: null,                             // null = aus; sonst Objekt, siehe docs/CONFIG.md
  preload: { core: [], restRanges: [] },        // Sprite-Slots, die vor dem Start (core) bzw. im Hintergrund geladen werden
  speechFallbackVox: [],                        // weitere Sprachpakete (vox), in denen fehlende Zeilen gesucht werden
  startKnopf: true                             // «Weiterspielen»-Knopf auf der Startseite
};

const tief = (a, b) => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? tief(a[k], v) : v;
  }
  return o;
};

async function lade() {
  try {
    const r = await fetch('./data/config.json');
    if (!r.ok) return {};
    return await r.json();
  } catch {
    return {};
  }
}

export const CFG = tief(DEFAULTS, await lade());
