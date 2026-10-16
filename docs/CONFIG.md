# Konfiguration (`ags-html.config.json`)

Die Datei liegt in der Projektwurzel (oder wird mit `--config <datei>` angegeben; die Wurzel ist dann der Ordner der Datei, überschreibbar mit `--root`).
Zeilen, die mit `//` beginnen, sind Kommentare. `"extends": "<pfad>"` legt eine Basiskonfiguration darunter (Objekte werden tief gemischt, Listen ersetzt).
Alle Pfade sind relativ zur Wurzel (Ausnahme: `page.*`-Pfade und `runtime.assetBase`, die relativ zur ausgelieferten Seite gelten).

## Quelle und Ausgabe

| Option | Standard | Bedeutung |
|---|---|---|
| `gameDir` | `"game"` | Ordner mit `Game.agf`, `GlobalScript.asc/.ash`, `roomN.asc`, weiteren Modulen |
| `agf` | `<gameDir>/Game.agf` | Projektdatei |
| `outDir` | `"html"` | Ausgabe: `<outDir>/data/*.json`, `<outDir>/game.js` |
| `resolution` | `{width:640,height:360,sceneHeight:260,guiTop:260,guiHeight:100}` | wird in `rooms.json`/`gui.json` geschrieben (die Laufzeit rechnet derzeit fest mit diesem Layout) |

## Skript-Übersetzung (`scripts`, `floatNames`)

| Option | Standard | Bedeutung |
|---|---|---|
| `scripts.headerOrder` | `[]` | `.ash`-Dateien, die zuerst gelesen werden (der Rest folgt) |
| `scripts.globalOrder` | `null` | `.asc`-Module in dieser Reihenfolge. `null` = alle ausser `roomN.asc`, alphabetisch, `GlobalScript.asc` zuletzt |
| `scripts.extraTypes` | `[]` | Typnamen aus eigenen Modulen (Structs/Enums), die der Übersetzer als Typen erkennen soll |
| `scripts.extraBlockingFuncs` | `[]` | globale Funktionen, die blockieren (werden `async`, Aufrufe `await`) |
| `scripts.extraBlockingMethods` | `[]` | Methodennamen, die blockieren |
| `floatNames` | `[]` | Namen, bei denen `/` echte Kommazahl-Division bleibt (Standard: ganzzahlig wie AGS) |

## Räume, Sprache, Musik

| Option | Standard | Bedeutung |
|---|---|---|
| `rooms` | `[]` | `[{ number, slug, title?, episode?, spawn? }]` – oder Hook `rooms` |
| `roomsDir` | `"art/rooms"` | je Raum optional `<slug>.room.json` (Hotspots, Kanten, Walk-behind-Grundlinien), `.bg.png`, `.walk.png`, `.hot.png`, `.wb.png` |
| `speechPacks` | `[]` | `[{ vox, mapFile, audioDirs, extra? }]` – oder Hook `speechPacks`; `mapFile`: `{ lineId: { char, n, speaker } }` |
| `speechFallbackDirs` | `[]` | weitere Ordner, in denen `<lineId>.mp3` gesucht wird |
| `musicFile` | `null` | `{ ueberblendung, stuecke: { name: { datei, vol, start?, ende? } }, raeume: { "<raum>": "name" }, titel }` |
| `castFile` | `null` | optional `{ sprecher: { color } }` (Sprechfarbe, wenn Game.agf/Skript keine setzt) |
| `spriteSheetsDir` | `null` | Ordner mit Unterordnern, die `sprites.json` (+ `contact.png`) enthalten → `views.json.spriteSheets` |
| `hintsFile` | `null` | (reserviert; Hinweise liefert der Hook `hints`) |
| `hooks` | `null` | Pfad zu einem ES-Modul, siehe `HOOKS.md` |

## Laufzeit (`runtime`, wird als `data/config.json` ausgeliefert)

| Option | Standard | Bedeutung |
|---|---|---|
| `storagePrefix` | `"ags"` | localStorage-Schlüssel `<p>_autosave`, `<p>_save_slot_<n>`, `<p>_musik_vol`, `<p>_file_<name>` – **bei bestehenden Spielen unverändert lassen, sonst gehen Spielstände verloren** |
| `saveFormat` | `"ags-html-save"` | Kennung der heruntergeladenen Spielstand-Dateien |
| `texts.notSaveFile` | deutsch («Das ist keine Spielstand-Datei dieses Spiels.») | Fehlermeldung beim Laden einer fremden Datei; die übrigen Texte der Laufzeit-Oberfläche («Stand», «Weiterspielen», «Autosave») sind derzeit fest deutsch |
| `assetBase` | `"../"` | Präfix für alle Spieldatei-Pfade der JSON-Daten, relativ zur Engine-Seite |
| `spriteFallbackDir` | `""` (aus) | Rückfall `<dir>/<slot>.png`, wenn für einen Slot kein Pfad bekannt ist (`""` = aus) |
| `playerScriptName` | `""` | Rückfall-Spielfigur, falls `Game.agf` keine Hauptfigur nennt |
| `noAutosaveRooms` | `[]` | Räume (Intro/Abspann), in denen nie automatisch gespeichert wird |
| `autosaveMinRoom`, `introDoneVar` | `0`, `""` | Autosave erst ab dieser Raumnummer oder wenn die globale Skriptvariable `introDoneVar` gesetzt ist (leer = immer) |
| `fallbackRoom` | `null` | `{ background, walkable, hotspotMask }` für Raumnummern ohne Eintrag |
| `quitUrl` | `""` | Ziel von `QuitGame()` (leer = Seite neu laden) |
| `speechFallbackVox` | `[]` | weitere Sprachpakete (`vox`), in denen fehlende Zeilen gesucht werden |
| `startKnopf` | `true` | «Weiterspielen»-Knopf auf der Startseite |
| `tumbleweed` | `null` | AGS-Vorlage Tumbleweed: `{ language, actionLabelColor:[r,g,b], slotSprite, slotSpriteHi }`; `null` = aus |
| `verbsGoToFix` | `false` | Tumbleweed: `Verbs.GoTo` nutzt Hotspot-Laufziele |
| `preload.core` / `preload.restRanges` | `[]` / `[]` | Sprite-Slots, die vor dem Start abgewartet bzw. im Hintergrund geladen werden |

## Seite (`page`) und Bündeln (`bundle`)

| Option | Standard | Bedeutung |
|---|---|---|
| `page.lang`, `page.title`, `page.heading` (HTML erlaubt), `page.startText`, `page.loadingText`, `page.rotateText` | englisch | Texte der Startseite |
| `page.titleImage`, `page.icon`, `page.fontFile` | leer | Pfade relativ zur Seite (`index.html` liegt in `<site>/<bundle.engineDir>/`) |
| `page.fontFamily`, `page.accent`, `page.noindex` | `monospace`, `#f6e08a`, `false` | Schrift, Akzentfarbe, `robots noindex` |
| `bundle.engineDir` | `"html"` | Unterordner der Seite für Engine + `game.js` + `data/` |
| `bundle.roots` | `null` | nur Dateien mit diesen Pfadanfängen aus den JSON-Daten kopieren (`null` = alle vorhandenen) |
| `bundle.copy` | `[]` | `[{ from, to }]` weitere Dateien/Ordner (Projektwurzel → Seitenwurzel) |
| `bundle.maxFileMB` | `25` | grössere Dateien werden übersprungen |

Service-Worker-Version: Umgebungsvariable `REV`, sonst `git rev-parse --short HEAD` des Projekts, sonst `dev`.
