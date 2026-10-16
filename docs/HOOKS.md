# Hooks

Spielspezifische Daten, die sich nicht sinnvoll als reine Konfiguration ausdrücken lassen, liefert ein ES-Modul im Spielprojekt
(`"hooks": "./ags-html.hooks.mjs"`). Alle Exporte sind optional; der Exporter ruft sie während `export` auf.

`ctx` (Kontext, den Funktions-Hooks erhalten): `{ root, cfg, fs, path, pathToFileURL, exists(rel), readText(rel), readJson(rel, fallback),
readImageDimensions(rel), registerSprite(slot, relPath, source), spriteMap, castData, agfXml, defines }`.

| Export | Typ | Wirkung |
|---|---|---|
| `sprites(ctx)` | async Funktion | zusätzliche Sprite-Slots registrieren (`ctx.registerSprite(slot, 'pfad/zu.png')`) – für Slots, die nicht in `Game.agf` stehen |
| `speakerKeys` | Objekt | `{ cSkriptname: 'sprecher-schluessel' }` (Standard: Skriptname ohne `c`, kleingeschrieben); verbindet Figuren mit `castFile`/Sprachzeilen |
| `extraCharacters` | Array | Figuren, die noch nicht in `Game.agf` stehen: `{ scriptName, realName, speakerKey, color, clickable }` |
| `verbBar` | Objekt | beliebige Beschreibung der Verbleiste, unverändert nach `gui.json` |
| `rooms(ctx)` | Funktion | Raumliste `[{ number, slug, title, episode?, spawn:[x,y] }]` (statt `cfg.rooms`) |
| `roomMeta(ctx)` | Funktion | `{ [raum]: { title?, spawn? } }` überschreibt Titel/Startpunkt |
| `roomScaling(roomNum)` | Funktion | `{ y0, h0, y1, h1, baseHeight, xBlend? }` (Figurenhöhe in Pixeln bei `y0`/`y1`); Standard: keine Skalierung |
| `speechPacks(ctx)` | Funktion | Sprachpakete wie `cfg.speechPacks` (inkl. `extra`-Zeilen je Paket) |
| `hints(ctx, { byId })` | Funktion | `{ hinweise: [], zusatz: {} }` für `hints.json` |
| `afterExport(ctx, { rooms, characters, views, spriteMap, byId })` | async Funktion | beliebige Nachbearbeitung |

Die Übersetzung der Skripte (`translate`) kennt keine Hooks – sie wird nur über `scripts.*` und `floatNames` gesteuert.
Hook-Module dürfen beliebigen Node-Code ausführen: nur eigene oder geprüfte Module verwenden.
