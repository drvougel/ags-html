# Changelog

## 0.1.0 – unveröffentlicht

Erste Version als eigenständiges Paket (herausgelöst aus einem Spielprojekt):

- CLI `ags-html` mit `export`, `translate`, `bundle`, `build`.
- Konfiguration `ags-html.config.json` (mit `extends`) und Hook-Modul für spielspezifische Daten.
- Laufzeit-Konfiguration `data/config.json` statt fest eingebauter Werte (Speicherschlüssel-Präfix, Spielstand-Kennung, Fallback-Raum,
  Vorlade-Sprites, Tumbleweed-Optionen, Autosave-Regeln).
- Seitenvorlage mit Platzhaltern (Titel, Texte, Schrift, Titelbild, Symbol).
- Tests mit `node --test` (Ganzzahl-Division, Übersetzung eines Mini-Skripts, Export, Build, Hooks).
