/**
 * Tests for the Coin ⇄ USD size-unit + % input helpers used by
 * TradeApp's M1.2 / M1.3 UX. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/sizeUnit.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coinToUsdString,
  usdToCoinString,
  pctToInputString,
  clampPct,
} from '../sizeUnit.mjs';

test('coinToUsdString — multiplies and formats to 2 decimals', () => {
  assert.equal(coinToUsdString(0.5, 30000), '15000.00');
  assert.equal(coinToUsdString(1, 0.123456), '0.12');
  assert.equal(coinToUsdString(0.003333, 30000), '99.99');
});

test('coinToUsdString — invalid input returns empty string', () => {
  assert.equal(coinToUsdString(0, 30000), '');
  assert.equal(coinToUsdString(-1, 30000), '');
  assert.equal(coinToUsdString(1, 0), '');
  assert.equal(coinToUsdString(NaN, 30000), '');
  assert.equal(coinToUsdString(1, Infinity), '');
});

test('usdToCoinString — divides and rounds to szDecimals', () => {
  // BTC, szDecimals=5: $100 / $30k = 0.00333... → "0.00333"
  assert.equal(usdToCoinString(100, 30000, 5), '0.00333');
  // ETH, szDecimals=4: $250 / $2500 = 0.1 → "0.1000"
  assert.equal(usdToCoinString(250, 2500, 4), '0.1000');
  // Whole-number coin, szDecimals=0: $1000 / $0.5 = 2000 → "2000"
  assert.equal(usdToCoinString(1000, 0.5, 0), '2000');
});

test('usdToCoinString — invalid input returns empty string', () => {
  assert.equal(usdToCoinString(0, 30000, 5), '');
  assert.equal(usdToCoinString(100, 0, 5), '');
  assert.equal(usdToCoinString(NaN, 30000, 5), '');
  assert.equal(usdToCoinString(100, NaN, 5), '');
});

test('round-trip $100 USD on $30k BTC stays within one-tick tolerance', () => {
  // Tick size at szDecimals=5 with px=$30k: $30000 * 10^-5 = $0.30. The
  // round-trip should preserve the user's intent within that tolerance,
  // not silently drop to ~$99.97 due to off-by-direction rounding.
  const px = 30000;
  const sz = 5;
  const coinStr = usdToCoinString(100, px, sz);
  const usdRoundTrip = parseFloat(coinToUsdString(parseFloat(coinStr), px));
  const tickUsd = px * Math.pow(10, -sz); // $0.30
  assert.ok(
    Math.abs(usdRoundTrip - 100) <= tickUsd + 1e-6,
    `round-trip $100 → ${coinStr} BTC → $${usdRoundTrip} drifted more than one tick ($${tickUsd})`,
  );
});

test('round-trip on a coarse asset (szDecimals=0) is bounded by px', () => {
  // szDecimals=0 means whole-coin only. $1000 / $123 = 8.13 → "8" → $984.
  // Round-trip drift can be up to one px = $123. That's intrinsic; we
  // just check the helper doesn't add extra error.
  const usdStr = coinToUsdString(parseFloat(usdToCoinString(1000, 123, 0)), 123);
  assert.equal(usdStr, '984.00');
});

test('pctToInputString — coin mode rounds to szDecimals', () => {
  // 50% of $1000 withdrawable = $500. At BTC $30k, szDecimals=5:
  // $500 / $30000 = 0.01666... → "0.01667" (toFixed rounds).
  assert.equal(
    pctToInputString({ pct: 50, withdrawable: 1000, px: 30000, szDecimals: 5, unit: 'coin' }),
    '0.01667',
  );
});

test('pctToInputString — usd mode formats to 2 decimals', () => {
  // 25% of $1000 = $250.00. Doesn't depend on px or szDecimals beyond validity.
  assert.equal(
    pctToInputString({ pct: 25, withdrawable: 1000, px: 30000, szDecimals: 5, unit: 'usd' }),
    '250.00',
  );
});

test('pctToInputString — boundary cases return empty', () => {
  // 0% should yield empty (matches the slider/input clearing on 0).
  assert.equal(
    pctToInputString({ pct: 0, withdrawable: 1000, px: 30000, szDecimals: 5, unit: 'coin' }),
    '',
  );
  // No withdrawable → no size.
  assert.equal(
    pctToInputString({ pct: 50, withdrawable: 0, px: 30000, szDecimals: 5, unit: 'coin' }),
    '',
  );
  // No price → no size.
  assert.equal(
    pctToInputString({ pct: 50, withdrawable: 1000, px: 0, szDecimals: 5, unit: 'coin' }),
    '',
  );
});

test('pctToInputString — coin and usd modes give equivalent value at 100%', () => {
  // Sanity: 100% of $1000 → $1000.00 in usd mode and $1000/px coin in
  // coin mode. The two should agree modulo szDecimals tick.
  const coin = pctToInputString({
    pct: 100, withdrawable: 1000, px: 50, szDecimals: 4, unit: 'coin',
  });
  const usd = pctToInputString({
    pct: 100, withdrawable: 1000, px: 50, szDecimals: 4, unit: 'usd',
  });
  assert.equal(coin, '20.0000');
  assert.equal(usd, '1000.00');
  // Cross-check: parseFloat(coin) * px = parseFloat(usd).
  assert.equal(parseFloat(coin) * 50, parseFloat(usd));
});

test('clampPct — clamps to [0,100], non-finite to 0', () => {
  assert.equal(clampPct(50), 50);
  assert.equal(clampPct(0), 0);
  assert.equal(clampPct(100), 100);
  assert.equal(clampPct(-5), 0);
  assert.equal(clampPct(150), 100);
  assert.equal(clampPct(NaN), 0);
  assert.equal(clampPct(Infinity), 0);
  assert.equal(clampPct(37.5), 37.5);
});
