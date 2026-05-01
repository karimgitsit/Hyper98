/**
 * Zero-dep tests for the preview math. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/preview.test.mjs
 *
 * Number tolerance is loose (1 cent on price, 1 USD on notional) because
 * these are UX readouts, not settlement math — Hyperliquid's on-chain
 * liquidation price is authoritative, this module only previews it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidationPrice, marginRequired, orderValue } from '../preview.mjs';

function close(actual, expected, tol = 0.01, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label || 'value'}: expected ≈${expected}, got ${actual} (diff ${diff} > tol ${tol})`,
  );
}

test('orderValue — sign-insensitive, zero-safe', () => {
  assert.equal(orderValue(100, 2), 200);
  assert.equal(orderValue(100, -2), 200);
  assert.equal(orderValue(0, 5), 0);
  assert.equal(orderValue(NaN, 1), 0);
  assert.equal(orderValue(100, Infinity), 0);
});

test('marginRequired — notional / leverage', () => {
  assert.equal(marginRequired(100, 2, 10), 20);
  assert.equal(marginRequired(100, 2, 1), 200);
  assert.equal(marginRequired(100, 2, 0), 0);
  assert.equal(marginRequired(100, 2, -5), 0);
});

test('liquidationPrice — isolated long 10x (mmf=0.005)', () => {
  const liq = liquidationPrice({
    side: 'long', entryPx: 100_000, size: 0.1,
    leverage: 10, isCross: false,
  });
  // expected: 100000 * (1 - 0.1) / (1 - 0.005) = 90_452.26
  close(liq, 90_452.26, 0.5, 'btc long 10x iso');
  assert.ok(liq < 100_000, 'liq must be below entry for a long');
});

test('liquidationPrice — isolated short 10x (mmf=0.005)', () => {
  const liq = liquidationPrice({
    side: 'short', entryPx: 100_000, size: 0.1,
    leverage: 10, isCross: false,
  });
  // expected: 100000 * 1.1 / 1.005 = 109_452.74
  close(liq, 109_452.74, 0.5, 'btc short 10x iso');
  assert.ok(liq > 100_000, 'liq must be above entry for a short');
});

test('liquidationPrice — isolated 1x long is floored at ~0 after mmf', () => {
  // 1x means initial margin = 100% of notional. marginFrac = 1 → numerator
  // (1 - 1) = 0. We cap that at 0 to avoid negative prices from mmf.
  const liq = liquidationPrice({
    side: 'long', entryPx: 2_500, size: 1,
    leverage: 1, isCross: false,
  });
  assert.equal(liq, 0);
});

test('liquidationPrice — isolated 1x short is 1/(1+mmf) above entry', () => {
  const liq = liquidationPrice({
    side: 'short', entryPx: 2_500, size: 1,
    leverage: 1, isCross: false,
  });
  // 2500 * 2 / 1.005 = 4975.12
  close(liq, 4975.12, 0.5, 'eth short 1x iso');
});

test('liquidationPrice — higher leverage ⇒ closer liq for a long', () => {
  const liq5 = liquidationPrice({
    side: 'long', entryPx: 3_000, size: 1, leverage: 5, isCross: false,
  });
  const liq20 = liquidationPrice({
    side: 'long', entryPx: 3_000, size: 1, leverage: 20, isCross: false,
  });
  assert.ok(liq20 > liq5, `liq20(${liq20}) must be above liq5(${liq5}) for a long`);
});

test('liquidationPrice — cross cushion widens distance vs isolated', () => {
  const input = {
    side: /** @type {'long'} */ ('long'),
    entryPx: 100_000, size: 0.1, leverage: 10,
  };
  const iso = liquidationPrice({ ...input, isCross: false });
  const cross = liquidationPrice({
    ...input, isCross: true,
    accountValue: 2_000, marginUsed: 1_000,
  });
  assert.ok(cross < iso, `cross liq (${cross}) must sit below isolated liq (${iso}) for a long`);
});

test('liquidationPrice — cross with zero free margin == isolated', () => {
  const base = {
    side: /** @type {'short'} */ ('short'),
    entryPx: 50_000, size: 0.2, leverage: 5,
  };
  const iso = liquidationPrice({ ...base, isCross: false });
  const cross = liquidationPrice({
    ...base, isCross: true,
    accountValue: 500, marginUsed: 500, // free = 0
  });
  close(cross, iso, 0.01, 'cross with no free margin');
});

test('liquidationPrice — rejects bad inputs', () => {
  assert.equal(liquidationPrice({
    side: 'long', entryPx: 0, size: 1, leverage: 10, isCross: false,
  }), 0);
  assert.equal(liquidationPrice({
    side: 'long', entryPx: 100, size: 0, leverage: 10, isCross: false,
  }), 0);
  assert.equal(liquidationPrice({
    side: 'long', entryPx: 100, size: 1, leverage: 0, isCross: false,
  }), 0);
  assert.equal(liquidationPrice({
    side: 'long', entryPx: NaN, size: 1, leverage: 10, isCross: false,
  }), 0);
});

test('liquidationPrice — custom maintenanceMarginFrac', () => {
  const liq = liquidationPrice({
    side: 'long', entryPx: 100_000, size: 0.1,
    leverage: 10, isCross: false,
    maintenanceMarginFrac: 0.02,
  });
  // 100000 * 0.9 / 0.98 = 91836.73
  close(liq, 91_836.73, 0.5, 'custom mmf long');
});
