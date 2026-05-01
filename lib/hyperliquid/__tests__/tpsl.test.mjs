/**
 * TP/SL conversion math — used by the M1.6 "Add TP/SL on entry" UX in
 * `TradeApp.tsx`. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/tpsl.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  triggerPxFromRoePct,
  roePctFromTriggerPx,
  isTriggerOnCorrectSide,
} from '../tpsl.mjs';

function close(actual, expected, tol = 1e-6, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label || 'value'}: expected ≈${expected}, got ${actual} (diff ${diff} > tol ${tol})`,
  );
}

test('triggerPxFromRoePct — long TP scales with leverage', () => {
  // 10x long, 10% ROE = 1% price move up.
  close(
    triggerPxFromRoePct({ side: 'long', kind: 'tp', entryPx: 100, leverage: 10, roePct: 10 }),
    101,
    1e-9,
    'long 10x +10% ROE',
  );
  // 1x long, 10% ROE = 10% price move up.
  close(
    triggerPxFromRoePct({ side: 'long', kind: 'tp', entryPx: 100, leverage: 1, roePct: 10 }),
    110,
    1e-9,
    'long 1x +10% ROE',
  );
});

test('triggerPxFromRoePct — long SL is below entry', () => {
  const px = triggerPxFromRoePct({
    side: 'long', kind: 'sl', entryPx: 100, leverage: 10, roePct: 20,
  });
  close(px, 98, 1e-9, 'long 10x 20% loss');
  assert.ok(px < 100, 'SL must sit below entry for a long');
});

test('triggerPxFromRoePct — short TP is below entry, short SL above', () => {
  const tp = triggerPxFromRoePct({
    side: 'short', kind: 'tp', entryPx: 100, leverage: 5, roePct: 25,
  });
  close(tp, 95, 1e-9, 'short 5x +25% ROE TP');
  assert.ok(tp < 100, 'short TP below entry');

  const sl = triggerPxFromRoePct({
    side: 'short', kind: 'sl', entryPx: 100, leverage: 5, roePct: 25,
  });
  close(sl, 105, 1e-9, 'short 5x 25% loss SL');
  assert.ok(sl > 100, 'short SL above entry');
});

test('roePctFromTriggerPx — round-trip with triggerPxFromRoePct', () => {
  for (const side of /** @type {const} */ (['long', 'short'])) {
    for (const kind of /** @type {const} */ (['tp', 'sl'])) {
      for (const lev of [1, 5, 20]) {
        for (const pct of [1, 10, 50]) {
          const px = triggerPxFromRoePct({
            side, kind, entryPx: 100, leverage: lev, roePct: pct,
          });
          const back = roePctFromTriggerPx({
            side, kind, entryPx: 100, leverage: lev, triggerPx: px,
          });
          close(back, pct, 1e-6, `roundtrip ${side}/${kind} L=${lev} pct=${pct}`);
        }
      }
    }
  }
});

test('roePctFromTriggerPx — sign flips when trigger is on wrong side', () => {
  // Long TP below entry → negative ROE (invalid configuration).
  const wrong = roePctFromTriggerPx({
    side: 'long', kind: 'tp', entryPx: 100, leverage: 10, triggerPx: 99,
  });
  assert.ok(wrong < 0, `expected negative ROE on wrong side, got ${wrong}`);
  // Short SL below entry → also negative.
  const wrongShort = roePctFromTriggerPx({
    side: 'short', kind: 'sl', entryPx: 100, leverage: 10, triggerPx: 99,
  });
  assert.ok(wrongShort < 0, `expected negative ROE on wrong side, got ${wrongShort}`);
});

test('isTriggerOnCorrectSide — long', () => {
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, 101), true);
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, 99), false);
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, 100), false, 'equal must be invalid');
  assert.equal(isTriggerOnCorrectSide('long', 'sl', 100, 99), true);
  assert.equal(isTriggerOnCorrectSide('long', 'sl', 100, 101), false);
});

test('isTriggerOnCorrectSide — short', () => {
  assert.equal(isTriggerOnCorrectSide('short', 'tp', 100, 99), true);
  assert.equal(isTriggerOnCorrectSide('short', 'tp', 100, 101), false);
  assert.equal(isTriggerOnCorrectSide('short', 'sl', 100, 101), true);
  assert.equal(isTriggerOnCorrectSide('short', 'sl', 100, 99), false);
});

test('isTriggerOnCorrectSide — zero / NaN / negatives are invalid', () => {
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, 0), false);
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 0, 100), false);
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, NaN), false);
  assert.equal(isTriggerOnCorrectSide('long', 'tp', 100, -50), false);
});

test('triggerPxFromRoePct — bad input → 0', () => {
  assert.equal(triggerPxFromRoePct({ side: 'long', kind: 'tp', entryPx: 0, leverage: 10, roePct: 10 }), 0);
  assert.equal(triggerPxFromRoePct({ side: 'long', kind: 'tp', entryPx: 100, leverage: 0, roePct: 10 }), 0);
  assert.equal(triggerPxFromRoePct({ side: 'long', kind: 'tp', entryPx: NaN, leverage: 10, roePct: 10 }), 0);
});

test('roePctFromTriggerPx — bad input → 0', () => {
  assert.equal(roePctFromTriggerPx({ side: 'long', kind: 'tp', entryPx: 0, leverage: 10, triggerPx: 100 }), 0);
  assert.equal(roePctFromTriggerPx({ side: 'long', kind: 'tp', entryPx: 100, leverage: 0, triggerPx: 100 }), 0);
  assert.equal(roePctFromTriggerPx({ side: 'long', kind: 'tp', entryPx: 100, leverage: 10, triggerPx: NaN }), 0);
});
