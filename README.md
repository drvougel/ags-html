# ags-html

**Deutsch** · [English below](#english)

Spielt Adventure-Game-Studio-Spiele (AGS 3.6) direkt im Browser – als HTML5/Canvas-Seite, ohne ScummVM und ohne WebAssembly.
`ags-html` liest ein AGS-Projekt (`Game.agf`, Skripte, Raum-Daten), übersetzt die AGS-Skripte nach JavaScript und liefert eine
kleine Laufzeit (Engine), die Räume, Figuren, Inventar, GUIs, Dialoge, Sprache, Musik, Spielstände und Touch-Bedienung darstellt.

> Unabhängige Neuimplementierung. Nicht mit dem AGS-Projekt, ScummVM oder deren Inhabern verbunden oder von ihnen unterstützt.
> «Adventure Game Studio», «AGS» und «ScummVM» sind Marken bzw. Namen der jeweiligen Inhaber. Das Repository enthält keinen
> Code aus diesen Projekten und keine Spielinhalte (Bilder, Stimmen, Texte, Musik).

## Funktionsumfang

- **`export`**: `Game.agf` → `data/*.json` (Figuren, Views, Inventar, GUIs, Schriften, Cursor, Räume, Sprache, Hinweise, Musik, Laufzeit-Konfiguration)
- **`translate`**: AGS-Skriptsprache (`.asc`/`.ash`, Raumskripte `roomN.asc`) → `game.js` (async/await für blockierende Aufrufe,
  AGS-Ganzzahldivision, Struct-/Enum-/Attribut-Übersetzung, Spielstand-Serialisierung der globalen Variablen)
- **`bundle`**: fertige Seite (`index.html`, Engine, `game.js`, `data/`, referenzierte Dateien, Service Worker für Offline-Betrieb)
- Laufzeit: Raum-Rendering mit Laufbereichen, Walk-behind, Skalierung, Hotspots; Figuren-Animation, Sprechblasen und Sprachausgabe (mp3 je Sprachpaket);
  Inventar, GUI-Controls, Raummusik mit Überblendung; Autosave, Speichern/Laden, Stand herunterladen/hochladen; Handy-Modus (Touch, Vollbild).
- Optional: Unterstützung der AGS-Vorlage «Tumbleweed» (Verben-Leiste, Options-/Speichern-Menü).

## Grenzen

- **Eingabeformat:** Räume und Sprites müssen als einzelne PNG-Dateien (+ optionale `room.json`) vorliegen, keine `.crm`-Raumdateien und keine
  `acsprset.spr`-Archive – siehe [`docs/ROOMS.md`](docs/ROOMS.md). Die Skripte und `Game.agf` kommen direkt aus dem AGS-Projekt.
- Ziel sind AGS-3.6-Spiele im Stil klassischer Point-and-Click-Adventures; kein Anspruch auf vollständige AGS-Kompatibilität
  (nicht alle Skript-Funktionen der AGS-API sind umgesetzt; das Seitenverhältnis/Layout 640×360 mit Szene 640×260 und Leiste 640×100 ist derzeit fest).
- Kein Plugin-Support, kein MIDI/MOD/XM, keine eingebetteten Videos.
- Sprites und Räume werden als einzelne PNG-Dateien erwartet (Pfade aus `Game.agf` bzw. aus Hooks), nicht aus `acsprset.spr`/`.ags`-Archiven.
- Spielspezifisches (Sprite-Slots, Raumliste, Sprachpakete) kommt aus der Konfiguration und optionalen Hooks, siehe `docs/`.

## Schnellstart

```sh
npm install -g .            # oder: node bin/ags-html.mjs …  (keine Abhängigkeiten, Node ≥ 18)
cd mein-spiel               # Ordner mit game/Game.agf
cat > ags-html.config.json <<'EOF'
{
  "page": { "title": "Mein Spiel", "lang": "de" },
  "rooms": [ { "number": 1, "slug": "start", "title": "Start", "spawn": [100, 200] } ]
}
EOF
ags-html build site         # export + translate + bundle -> ./site/html/index.html
npx http-server site        # irgendein statischer Webserver; Seite: /html/index.html
```

Unterbefehle: `ags-html export | translate | bundle <site> | build <site> [--config <datei>]`.
Testseite ohne Startbildschirm: `index.html?autostart=1&room=<N>`.

## Konfiguration

`ags-html.config.json` im Projektordner (Pfade relativ dazu; `//`-Kommentarzeilen erlaubt). Alle Optionen mit Standardwerten:
[`docs/CONFIG.md`](docs/CONFIG.md). Spielspezifische Logik als Hook-Modul: [`docs/HOOKS.md`](docs/HOOKS.md).
Ein vollständiges Beispiel eines grossen Mehrteilers: [`examples/rehab.config.json`](examples/rehab.config.json).

## Entwicklung

```sh
npm test                    # node --test, keine Abhängigkeiten
```

Struktur: `bin/ags-html.mjs` (CLI), `tools/` (`export.mjs`, `ags2js.mjs`, `js-idiv.mjs`, `bundle.mjs`, `config.mjs`),
`runtime/` (`engine.js`, `ags-runtime.js`, `config.js`, `musik.js`, `spielstand.js`, `sw.js`, `index.html`-Vorlage), `examples/`, `docs/`, `test/`.

## Lizenz

GNU General Public License v3.0 oder später (`GPL-3.0-or-later`), siehe [`LICENSE`](LICENSE). Copyright (C) 2026 drvougel.
Das gilt für die Werkzeuge und die Laufzeit; die damit veröffentlichten Spiele behalten ihre eigene Lizenz.
Hinweis: Das gebündelte `engine.js`/`ags-runtime.js` wird mit jeder veröffentlichten Seite ausgeliefert – wer eine Seite damit veröffentlicht,
gibt diese Teile weiter und muss den Quelltext (dieses Repository, ggf. mit eigenen Änderungen) nach den Bedingungen der GPLv3 zugänglich machen
(keine Rechtsberatung).

---

## English

`ags-html` runs **Adventure Game Studio 3.6** games directly in the browser as an HTML5/canvas page – no ScummVM, no WebAssembly.
It reads an AGS project (`Game.agf`, scripts, room data), translates the AGS script language to JavaScript and ships a small
runtime (rooms, characters, inventory, GUIs, dialogs, voice-over, music, savegames, touch controls).

It is an independent re-implementation, not affiliated with or endorsed by the AGS project or ScummVM; those names are trademarks of their
respective owners. No code from those projects and no game content is included.

**Features:** `export` (Game.agf → JSON), `translate` (AGS script → JS incl. integer division and async blocking calls), `bundle`
(self-contained site with offline service worker), runtime with walkable areas, walk-behinds, scaling, hotspots, animations, speech packs,
room music, autosave/save/load/download, mobile mode, optional Tumbleweed template support.

**Limits:** rooms and sprites must be supplied as individual PNG files (+ optional `room.json`), not as `.crm` room files or `acsprset.spr` archives
(see `docs/ROOMS.md`); not a full AGS clone (partial script API, fixed 640×360 layout, no plugins, no MIDI/MOD, no video); sprites/rooms are expected as
individual PNG files; game-specific details come from `ags-html.config.json` and optional hook modules (`docs/`).

**Quick start:** `node bin/ags-html.mjs build site --config ags-html.config.json`, then serve `site/` with any static web server and open `/html/index.html`.

**License:** GPL-3.0-or-later. Anyone publishing a site that ships the bundled runtime must make its source available under the GPLv3.
