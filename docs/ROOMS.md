# Räume, Sprites und Masken (Eingabeformat)

`ags-html` liest **keine** AGS-Raumdateien (`.crm`) und keine Sprite-Archive (`acsprset.spr`). Räume und Sprites werden als einzelne
Dateien erwartet; die Skripte (`roomN.asc`, `GlobalScript.asc`, …) und `Game.agf` stammen dagegen direkt aus dem AGS-Projekt.

## Sprites

`Game.agf` nennt je Sprite-Slot einen Dateinamen (`<FileName>`), den der Exporter relativ zur Projektwurzel (oder zu `<gameDir>/`) auflöst.
Weitere Slots (z. B. aus eigenen Import-Werkzeugen) meldet der Hook `sprites(ctx)` mit `ctx.registerSprite(slot, 'pfad.png')`.
Fehlt ein Pfad, versucht die Laufzeit `<spriteFallbackDir>/<slot>.png` (`runtime.spriteFallbackDir`), sonst erscheint ein Platzhalter.

## Raum-Dateien (`<roomsDir>/<slug>.*`)

Der Raum wird in `rooms` (Konfiguration) bzw. im Hook `rooms` mit `number` (AGS-Raumnummer) und `slug` angemeldet. Je Raum, alle optional:

| Datei | Inhalt |
|---|---|
| `<slug>.bg.png` | Hintergrundbild (Breite = Raumbreite; Höhe ≥ Szenenhöhe) |
| `<slug>.walk.png` | Laufbereiche-Maske |
| `<slug>.hot.png` | Hotspot-Maske |
| `<slug>.wb.png` | Walk-behind-Maske |
| `<slug>.room.json` | Metadaten (siehe unten); seine Felder `background`, `walkable`, `hotspots.png`, `walkbehind` überschreiben die Standard-Dateinamen |

`room.json`:

```json
{
  "background": "pfad/zum/bg.png",
  "walkable": "pfad/zum/walk.png",
  "walkbehind": "pfad/zum/wb.png",
  "walkbehindBaselines": [ { "index": 1, "baseline": 180 } ],
  "edges": { "left": 0, "right": 637 },
  "roomEvents": ["Load", "AfterFadeIn", "RepExec"],
  "hotspots": {
    "png": "pfad/zum/hot.png",
    "list": [ { "index": 1, "name": "Tür", "script": "hDoor", "walkTo": [320, 230], "events": ["AnyClick"] } ]
  }
}
```

- `hotspots.list[].script` ist der AGS-Skriptname des Hotspots; die Laufzeit ruft `<script>_AnyClick` (`events` nennt weitere).
- `walkbehindBaselines[]`: für Walk-behind-Nr. `index` die Grundlinie (y), ab der Figuren davor/dahinter gezeichnet werden.
- `edges`: linke/rechte x-Grenze des Raums (Standard `0` und `Breite − 3`); `roomEvents`: welche Raum-Ereignisse das Raumskript hat (Standard `Load`, `AfterFadeIn`, `RepExec`).

## Masken (PNG)

Jedes Pixel einer Maske ist eine **Indexfarbe**; Index 0 = schwarz oder durchsichtig (kein Bereich). Der Index ist die Nummer des Laufbereichs
(`walk.png`), des Hotspots (`hot.png`, entspricht `hotspots.list[].index`) bzw. des Walk-behind (`wb.png`).

Die Standard-Palette (`rooms.json.maskPalette`) für Index `i` = 1…31 lautet (jeweils ganzzahlig):

```
r = (i * 97) % 200 + 55
g = (i * 57) % 200 + 55
b = (i * 137) % 200 + 55
```

Die Laufzeit sucht die genaue Farbe; findet sie keine, nimmt sie die nächstliegende Palettenfarbe (Manhattan-Abstand). Index 32…55 folgen
derselben Formel. PNGs deshalb ohne Kantenglättung und ohne Farbprofil speichern.

## Weitere eingebaute Annahmen

- Layout 640×360 (Szene 640×260, Leiste/GUI darunter 640×100); die Laufzeit rechnet fest damit.
- Sprache und Dialoge nutzen die Schriftnummern der Vorlage «Tumbleweed» (`eFontTumbleSpeech`, `eFontTumbleDlg`, …), auch mit `tumbleweed: null`.
- Die Bedienoberfläche der Laufzeit selbst (Knöpfe «Stand», «Weiterspielen», «Autosave», Fehlermeldungen) ist deutsch beschriftet.
- Sprachausgabe: eine mp3 je Zeile (`speechPacks`); eine Skript-Zeile wird über Figur + laufende Nummer gefunden.
