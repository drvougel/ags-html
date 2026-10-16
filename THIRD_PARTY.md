# Drittanbieter-Hinweise

- **Laufzeit-Abhängigkeiten:** keine. Das Paket nutzt nur Node.js (≥ 18) bzw. im Browser Canvas, Web Audio, Service Worker und `fetch`.
- **Schriften, Bilder, Töne:** werden nicht mitgeliefert. Eine optionale Seitenschrift (`page.fontFile`) liefert das jeweilige Spielprojekt
  mit ihrer eigenen Lizenz mit.
- **Adventure Game Studio / ScummVM:** `ags-html` ist eine unabhängige Neuimplementierung. Es enthält weder Quelltext noch Binärdateien
  dieser Projekte. Die Namen der AGS-Skript-API (Funktionen, Strukturen, Konstanten) sind eine Schnittstelle, die hier aus der öffentlich
  dokumentierten Skriptsprache nachgebaut wird. «Adventure Game Studio», «AGS» und «ScummVM» gehören den jeweiligen Inhabern.
- **GPLv3-Text (`LICENSE`):** © Free Software Foundation, unverändert.

## Tumbleweed Verbs (MIT)

Die optionale Unterstützung der AGS-Vorlage «Tumbleweed Verbs» in `runtime/` (`setupTumbleweedDefaults` in `ags-runtime.js`,
`installVerbsGoToFix` in `engine.js`) bildet Verhalten und Einstellungs-Aufrufe des gleichnamigen AGS-Moduls nach
(Hauptautor *abstauber*, Beiträge von Monsieur Ouxx, Crimson Wizard, eri0o; frühere Autoren Proskrito, Rulaman, Lucasfan, Khris;
Version 1.4). Das Modul steht unter der MIT-Lizenz; deren Hinweis wird hier beigefügt:

```
The MIT License (MIT)

Copyright (c) 2017- present Dirk Kreyenberg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Stand der Prüfung: Die Skripte des Moduls selbst (`verbgui.asc` usw.) gehören dem Spielprojekt und werden von `ags-html` nicht
mitgeliefert, nur zu JavaScript übersetzt. «Tumbleweed» und «Thimbleweed Park» gehören den jeweiligen Inhabern.
