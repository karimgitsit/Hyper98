/**
 * Tests for the fee helpers backing M3.4's base-fee strike-through in
 * TradeApp's Order Preview. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/fees.test.mjs
 *
 * The cardinal invariants under test:
 *   - `isDiscounted` is epsilon-tolerant: a parse-from-string float
 *     wobble at the headline rate must not fabricate a strike-through.
 *   - `pickDiscountSource` picks staking > referral > vip > null in
 *     that priority order, matching the visual attribution we want.
 *   - `formatBpsLabel` strips trailing `.0` on whole-bps values so
 *     the label column doesn't grow when a user lands on a tier with
 *     a whole-bps effective rate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADLINE_MAKER_RATE,
  HEADLINE_TAKER_RATE,
  feeUsd,
  formatBpsLabel,
  isDiscounted,
  pickDiscountSource,
} from '../fees.mjs';

test('headline rates match HL VIP-0 schedule', () => {
  // 1.5 bps maker, 4.5 bps taker — these are the fallbacks used when
  // userFees hasn't loaded yet (disconnected wallet).
  assert.equal(HEADLINE_MAKER_RATE, 0.00015);
  assert.equal(HEADLINE_TAKER_RATE, 0.00045);
});

test('feeUsd — multiplies notional by rate', () => {
  // Float-tolerant: 10000 * 0.00015 → 1.4999999999999998 in IEEE-754,
  // and the user-visible string is `toFixed(4)` so a microscopic delta
  // here is invisible.
  const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
  approx(feeUsd(10000, 0.00045), 4.5);
  approx(feeUsd(10000, 0.00015), 1.5);
  assert.equal(feeUsd(0, 0.00045), 0);
});

test('feeUsd — non-finite input is treated as 0', () => {
  assert.equal(feeUsd(NaN, 0.00045), 0);
  assert.equal(feeUsd(10000, NaN), 0);
  assert.equal(feeUsd(Infinity, 0.00045), 0);
});

test('formatBpsLabel — strips .0 on whole-bps values', () => {
  // Common headlines and clean tier rates.
  assert.equal(formatBpsLabel(0.00045), '4.5bps');
  assert.equal(formatBpsLabel(0.00015), '1.5bps');
  assert.equal(formatBpsLabel(0.0004), '4bps');
  assert.equal(formatBpsLabel(0.0001), '1bps');
  assert.equal(formatBpsLabel(0), '0bps');
});

test('formatBpsLabel — rounds to 1 decimal', () => {
  // 4.0125 bps → '4bps' (rounds to 4.0). 4.07 → '4.1bps'.
  assert.equal(formatBpsLabel(0.00040125), '4bps');
  assert.equal(formatBpsLabel(0.000407), '4.1bps');
  assert.equal(formatBpsLabel(0.000455), '4.6bps');
});

test('formatBpsLabel — defensive negative / non-finite returns 0bps', () => {
  assert.equal(formatBpsLabel(-0.00045), '0bps');
  assert.equal(formatBpsLabel(NaN), '0bps');
  assert.equal(formatBpsLabel(Infinity), '0bps');
});

test('isDiscounted — strict-less with epsilon tolerance', () => {
  // Plain comparisons.
  assert.equal(isDiscounted(0.0004, 0.00045), true);
  assert.equal(isDiscounted(0.00045, 0.00045), false);
  assert.equal(isDiscounted(0.0005, 0.00045), false);
});

test('isDiscounted — float wobble at the headline rate does NOT fabricate a discount', () => {
  // parseFloat round-trips can introduce sub-1e-15 noise. A 1e-9
  // tolerance is well below any meaningful rate distinction (at $1B
  // notional × 1e-9 = $1) but easily wide enough to absorb parse drift.
  const headline = 0.00045;
  const wobble = headline - 1e-15;
  assert.equal(isDiscounted(wobble, headline), false);

  // A real discount of 1 bps × 10% (0.1 bps = 1e-5) is detected.
  assert.equal(isDiscounted(headline - 1e-5, headline), true);
});

test('isDiscounted — non-finite returns false', () => {
  assert.equal(isDiscounted(NaN, 0.00045), false);
  assert.equal(isDiscounted(0.0004, NaN), false);
});

test('pickDiscountSource — staking takes priority over referral and vip', () => {
  const userFees = {
    activeStakingDiscount: { bpsOfMaxSupply: '20', discount: '0.05' },
    activeReferralDiscount: '0.04',
    feeSchedule: { cross: '0.00045', add: '0.00015' },
    userCrossRate: '0.0004',
    userAddRate: '0.0001',
  };
  assert.equal(pickDiscountSource(userFees), 'staking');
});

test('pickDiscountSource — referral when no staking', () => {
  const userFees = {
    activeStakingDiscount: { bpsOfMaxSupply: '0', discount: '0' },
    activeReferralDiscount: '0.04',
    feeSchedule: { cross: '0.00045', add: '0.00015' },
    userCrossRate: '0.0004',
    userAddRate: '0.0001',
  };
  assert.equal(pickDiscountSource(userFees), 'referral');
});

test('pickDiscountSource — vip inferred from rate delta when no flag', () => {
  const userFees = {
    activeStakingDiscount: { bpsOfMaxSupply: '0', discount: '0' },
    activeReferralDiscount: '0',
    feeSchedule: { cross: '0.00045', add: '0.00015' },
    userCrossRate: '0.0004',
    userAddRate: '0.00015',
  };
  assert.equal(pickDiscountSource(userFees), 'vip');
});

test('pickDiscountSource — null when user pays schedule', () => {
  const userFees = {
    activeStakingDiscount: { bpsOfMaxSupply: '0', discount: '0' },
    activeReferralDiscount: '0',
    feeSchedule: { cross: '0.00045', add: '0.00015' },
    userCrossRate: '0.00045',
    userAddRate: '0.00015',
  };
  assert.equal(pickDiscountSource(userFees), null);
});

test('pickDiscountSource — null on null/undefined input (loading or disconnected)', () => {
  assert.equal(pickDiscountSource(null), null);
  assert.equal(pickDiscountSource(undefined), null);
});

test('pickDiscountSource — missing fields fall through gracefully', () => {
  // A defensive case: HL adds a new field, the response shape drifts.
  // Helper must not throw, must return null when nothing parses to a
  // detectable discount.
  assert.equal(pickDiscountSource({}), null);
  assert.equal(
    pickDiscountSource({ activeStakingDiscount: { discount: '0' } }),
    null,
  );
});
