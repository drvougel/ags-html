// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 drvougel
import test from 'node:test';
import assert from 'node:assert/strict';
import { idivSource } from '../tools/js-idiv.mjs';

test('Ganzzahl-Division wird umgeschrieben', () => {
  const r = idivSource('let a = x / 2;\nb /= 3;\n');
  assert.equal(r.src, 'let a = __idiv(x, 2);\nb = __idiv(b, 3);\n');
  assert.equal(r.ersetzt, 2);
});

test('verschachtelte Divisionen', () => {
  const r = idivSource('y = (a / b) / c;');
  assert.match(r.src, /__idiv\(__idiv\(a, b\)|__idiv\(\(__idiv\(a, b\)\), c\)/);
  assert.ok(!/[^_]\/ /.test(r.src.replace(/\/\/.*/g, '')));
});

test('Kommazahl-Rechnung bleibt unberuehrt', () => {
  const src = 'a = IntToFloat(7) / 2.0;\nb = Maths.Sqrt(x) / y;\nc = z / 1.5;\n';
  const r = idivSource(src);
  assert.equal(r.src, src);
  assert.equal(r.float, 3);
});

test('floatNames aus der Konfiguration', () => {
  const src = 'a = speed / 3;\n';
  assert.equal(idivSource(src).src, 'a = __idiv(speed, 3);\n');
  assert.equal(idivSource(src, ['speed']).src, src);
});

test('Strings und Kommentare werden nicht angefasst, Lauf ist idempotent', () => {
  const src = 'let s = "a / b"; // c / d\nlet t = `${p}/q`;\nlet u = k / 2;\n';
  const once = idivSource(src).src;
  assert.ok(once.includes('"a / b"') && once.includes('// c / d') && once.includes('`${p}/q`'));
  assert.ok(once.includes('__idiv(k, 2)'));
  assert.equal(idivSource(once).src, once);
});
