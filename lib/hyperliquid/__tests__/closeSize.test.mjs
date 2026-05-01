/**
 * Tests for the partial-close size math used by PositionsApp's M2.1 / M2.2
 * close dialogs. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/closeSize.test.mjs
 *
 * The cardinal invariant under test is "never over-close". If a returned
 * size exceeds the position by even one tick, Hyperliquid rejects the
 * reduce-only order; the UI then surfaces a confusing error to the user.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCloseSize } from '../closeSize.mjs';

test('100% closes the entire position byte-exactly', () => {
  // BTC szDecimals=5 — the canonical "must be exact" case the brief calls
  // out. (0.5).toFixed(5) === '0.50000'; using the multiply-then-floor
  // path on 0.5 * 100000 = 50000 also lands on 0.50000, but the dedicated
  // 100% branch documents the contract regardless.
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 100 }, 5), '0.50000');
  // ETH-shaped: szDecimals=4
  assert.equal(computeCloseSize(1.5, { kind: 'pct', pct: 100 }, 4), '1.5000');
  // Whole-coin asset: szDecimals=0
  assert.equal(computeCloseSize(7, { kind: 'pct', pct: 100 }, 0), '7');
});

test('100% on float-drift-prone position — 0.29 BTC stays at 0.29000', () => {
  // The motivating regression: `0.29 * 100000` evaluates to
  // 28999.999999999996, which Math.floor would truncate to 28999, leaving
  // a 0.00001 BTC orphan tick on the position. The dedicated 100% branch
  // bypasses the floor path and uses toFixed, which round-trips correctly
  // for any value the API can have returned at szDecimals precision.
  assert.equal(computeCloseSize(0.29, { kind: 'pct', pct: 100 }, 5), '0.29000');
  assert.equal(computeCloseSize(0.1, { kind: 'pct', pct: 100 }, 5), '0.10000');
  assert.equal(computeCloseSize(0.3, { kind: 'pct', pct: 100 }, 5), '0.30000');
});

test('partial pct (25/50/75) — multiplies and rounds down', () => {
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 25 }, 5), '0.12500');
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 50 }, 5), '0.25000');
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 75 }, 5), '0.37500');
  assert.equal(computeCloseSize(1.5, { kind: 'pct', pct: 75 }, 4), '1.1250');
});

test('partial pct never over-closes on float-drift-prone positions', () => {
  // 50% on a 0.300003 position: raw = 0.1500015. Floor at szDecimals=5
  // gives 0.15000. Critically, the result × 2 = 0.30000 ≤ 0.300003 — so
  // a paired 50% + 50% close still satisfies reduce-only.
  const sz = computeCloseSize(0.300003, { kind: 'pct', pct: 50 }, 5);
  assert.equal(sz, '0.15000');
  assert.ok(parseFloat(sz) * 2 <= 0.300003 + 1e-12, 'partial close pair must not exceed position');
});

test('custom size — clamped to position size and floored', () => {
  // User typed exactly the position: treat as 100%, return position
  // toFixed (same exact-match logic as pct=100 above).
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0.5 }, 5), '0.50000');
  // User over-typed (e.g. 0.50001 on a 0.5 BTC position) — the brief's
  // explicit failure mode. Must clamp to position, not pass through.
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0.50001 }, 5), '0.50000');
  // Below position — floor to szDecimals.
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0.1 }, 5), '0.10000');
  // Custom that floors strictly below position
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0.123456 }, 5), '0.12345');
});

test('custom size — sub-tick value returns empty (UI disables confirm)', () => {
  // szDecimals=5, custom 1e-6 → floor(0.1)/100000 = 0 → empty.
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0.000001 }, 5), '');
});

test('invalid inputs return empty string', () => {
  assert.equal(computeCloseSize(0, { kind: 'pct', pct: 100 }, 5), '');
  assert.equal(computeCloseSize(-1, { kind: 'pct', pct: 100 }, 5), '');
  assert.equal(computeCloseSize(NaN, { kind: 'pct', pct: 100 }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 0 }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: -10 }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: NaN }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: 0 }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: NaN }, 5), '');
  assert.equal(computeCloseSize(0.5, { kind: 'custom', size: -1 }, 5), '');
});

test('pct > 100 (defensive) — treated as 100%, no over-close', () => {
  // The UI buttons are 25/50/75/100, but a defensive check matters: a
  // future caller passing 110 must not return 1.1× position.
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 110 }, 5), '0.50000');
});

test('SHORT-position semantics — caller passes |szi|, not signed szi', () => {
  // The helper is sign-agnostic by contract — `positionAbsSize` is always
  // the absolute size. Verifying the contract holds: 0.5 in == 0.5 out
  // regardless of which side the caller is closing.
  assert.equal(computeCloseSize(0.5, { kind: 'pct', pct: 50 }, 5), '0.25000');
});

test('whole-coin asset (szDecimals=0) — partial below 1 returns empty', () => {
  // Position of 3 whole coins, 25% = 0.75 → floor → 0 → empty.
  // The UI then disables confirm on this combination, which is correct:
  // you can't partially close half a meme-coin token.
  assert.equal(computeCloseSize(3, { kind: 'pct', pct: 25 }, 0), '');
  // 50% = 1.5 → floor → 1.
  assert.equal(computeCloseSize(3, { kind: 'pct', pct: 50 }, 0), '1');
  // 75% = 2.25 → floor → 2.
  assert.equal(computeCloseSize(3, { kind: 'pct', pct: 75 }, 0), '2');
});

test('high-precision asset (szDecimals=8) — sub-cent partial works', () => {
  // PEPE-shaped: small per-coin price, tiny szDecimals. 25% on 1.0 →
  // 0.25 → "0.25000000".
  assert.equal(computeCloseSize(1.0, { kind: 'pct', pct: 25 }, 8), '0.25000000');
});
