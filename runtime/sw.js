// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
// Service Worker der HTML-Engine. Liegt im Engine-Unterordner der Seite, damit sein Geltungsbereich nur diesen Ordner umfasst.
// Shell und Spieldaten werden beim ersten Besuch vorgeladen; Bilder, Musik-Dateien und Sprache beim ersten Abruf.
// VERSION setzt tools/bundle.mjs auf die Git-Revision: neue Version -> activate loescht alte Caches.
const VERSION = '__REV__';
const CACHE = 'ags-html-' + VERSION;
const SHELL = ['./', './index.html', './engine.js', './ags-runtime.js', './game.js', './musik.js', './spielstand.js', './config.js', './data/config.json', './data/musik.json',
  './data/rooms.json', './data/characters.json', './data/views.json', './data/inventory.json',
  './data/gui.json', './data/speech.json', './data/hints.json'];
// Shell-Dateien aendern sich ohne neue Revision (lokale Entwicklung): zuerst aus dem Netz, Cache nur als Rueckfall
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SHELL_RE = /^(index\.html|engine\.js|ags-runtime\.js|game\.js|musik\.js|spielstand\.js|config\.js)?$/;
const NETWORK_FIRST = (pathname) => pathname.startsWith(SCOPE_PATH) && SHELL_RE.test(pathname.slice(SCOPE_PATH.length));
// Cache-Schluessel ohne Abfrage (?autostart=1, ?room=N), sonst findet der Offline-Start die Seite nicht
const keyOf = (u) => { const x = new URL(u); return x.origin + x.pathname; };

self.addEventListener('install', (event) => {
  // Einzeln vorladen: ein fehlendes Teil darf die Installation nicht scheitern lassen
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('ags-html-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Alle Anfragen der Engine-Seite (auch Bilder/Ton ausserhalb des Engine-Ordners)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.headers.has('range')) { event.respondWith(rangeFetch(req)); return; }
  event.respondWith(NETWORK_FIRST(url.pathname) ? networkFirst(req) : cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(keyOf(req.url));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(keyOf(req.url), res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(keyOf(req.url), res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(keyOf(req.url));
    if (hit) return hit;
    throw new Error('offline ohne Kopie: ' + req.url);
  }
}

// Audio/Video fragen Teilbereiche an (Range). Vollstaendige Datei aus dem Cache (oder einmal ganz laden) und den
// Bereich daraus schneiden - so bleibt die Datei offline abspielbar und Spulen funktioniert.
async function rangeFetch(req) {
  const cache = await caches.open(CACHE);
  let full = await cache.match(keyOf(req.url));
  if (!full) {
    const res = await fetch(req.url);
    if (!res.ok) return res;
    cache.put(keyOf(req.url), res.clone()).catch(() => {});
    full = res;
  }
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!m) return new Response(buf, { status: 200, headers: full.headers });
  const size = buf.byteLength;
  let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[2] === '' || m[1] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const headers = new Headers(full.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}
