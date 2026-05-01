/**
 * Tests for the funding-rate annualization and countdown helpers used
 * by TradeApp's M3.3 header readouts. Run with:
 *
 *   node --test lib/hyperliquid/__tests__/funding.test.mjs
 *
 * The two cardinal invariants under test:
 *   - Annualization is `hourly × 24 × 365` (linear extrapolation, what
 *     HL's UI displays).
 *   - The countdown string is a fixed 8 chars (HH:MM:SS) so the header
 *     doesn't reflow each second.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualizeHourlyFunding,
  formatFundingPct,
  nextFundingMs,
  formatCountdown,
} from '../funding.mjs';

test('annualizeHourlyFunding — multiplies by 24 * 365', () => {
  // 0.0001 / hr (1 bps) → ~0.876 / yr (~87.6%). Float drift between
  // associativity orderings makes a strict equal flaky here, so compare
  // within an epsilon — only the formatted UI output is user-visible.
  const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≉ ${b}`);
  approx(annualizeHourlyFunding(0.0001), 0.876);
  assert.equal(annualizeHourlyFunding(0), 0);
  // Negative funding (shorts pay longs) round-trips with the sign.
  approx(annualizeHourlyFunding(-0.00005), -0.438);
});

test('annualizeHourlyFunding — non-finite input is treated as 0', () => {
  assert.equal(annualizeHourlyFunding(NaN), 0);
  assert.equal(annualizeHourlyFunding(Infinity), 0);
  assert.equal(annualizeHourlyFunding(-Infinity), 0);
});

test('formatFundingPct — signed, percent-suffixed, 4-decimal default', () => {
  // 0.1095 = 10.9500%
  assert.equal(formatFundingPct(0.1095), '+10.9500%');
  assert.equal(formatFundingPct(-0.1095), '-10.9500%');
  // 0 always renders as 0.0000% (no sign)
  assert.equal(formatFundingPct(0), '0.0000%');
});

test('formatFundingPct — tiny near-zero negatives normalize to plain 0', () => {
  // (-1e-12).toFixed(4) === '-0.0000', which would mislead the user
  // about direction. The helper normalizes to '0.0000%'.
  assert.equal(formatFundingPct(-1e-12), '0.0000%');
  assert.equal(formatFundingPct(1e-12), '0.0000%');
});

test('formatFundingPct — custom decimals', () => {
  assert.equal(formatFundingPct(0.123456, 2), '+12.35%');
  assert.equal(formatFundingPct(0.123456, 6), '+12.345600%');
});

test('formatFundingPct — non-finite renders as em-dash', () => {
  assert.equal(formatFundingPct(NaN), '—');
  assert.equal(formatFundingPct(Infinity), '—');
});

test('nextFundingMs — returns next top-of-hour boundary', () => {
  const HOUR = 60 * 60 * 1000;
  // 12:34:56 UTC → 13:00:00 UTC
  const t = Date.UTC(2026, 3, 28, 12, 34, 56, 789);
  assert.equal(nextFundingMs(t), Date.UTC(2026, 3, 28, 13, 0, 0, 0));

  // Mid-hour
  const t2 = Date.UTC(2026, 3, 28, 0, 30, 0, 0);
  assert.equal(nextFundingMs(t2), Date.UTC(2026, 3, 28, 1, 0, 0, 0));

  // Exactly on the hour: returns +1h, not the same instant. Matches HL's
  // UI which reads "00:59:59" → "00:00:00" → "00:59:59" rather than
  // collapsing to a zero-duration interval.
  const t3 = Date.UTC(2026, 3, 28, 5, 0, 0, 0);
  assert.equal(nextFundingMs(t3), t3 + HOUR);
});

test('nextFundingMs — non-finite input returns 0', () => {
  assert.equal(nextFundingMs(NaN), 0);
  assert.equal(nextFundingMs(Infinity), 0);
});

test('formatCountdown — fixed-width HH:MM:SS', () => {
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(1000), '00:00:01');
  assert.equal(formatCountdown(59 * 1000), '00:00:59');
  assert.equal(formatCountdown(60 * 1000), '00:01:00');
  assert.equal(formatCountdown(59 * 60 * 1000 + 59 * 1000), '00:59:59');
  assert.equal(formatCountdown(60 * 60 * 1000), '01:00:00');
  // Sub-second floors down (the displayed second only ticks at the
  // boundary — important so the same value renders identically across
  // a few hundred ms of effect-scheduling jitter).
  assert.equal(formatCountdown(1500), '00:00:01');
  assert.equal(formatCountdown(999), '00:00:00');
});

test('formatCountdown — every output is exactly 8 chars (no header reflow)', () => {
  // The header is monospaced and sized to the timer; if any cadence
  // produces a shorter string the TradeApp header will twitch each
  // second. Sweep the first hour at second resolution.
  for (let s = 0; s <= 3600; s++) {
    const out = formatCountdown(s * 1000);
    assert.equal(out.length, 8, `length mismatch at ${s}s: '${out}'`);
  }
});

test('formatCountdown — negative / non-finite renders as 00:00:00', () => {
  assert.equal(formatCountdown(-1), '00:00:00');
  assert.equal(formatCountdown(-1000), '00:00:00');
  assert.equal(formatCountdown(NaN), '00:00:00');
  assert.equal(formatCountdown(Infinity), '00:00:00');
});

test('formatCountdown — multi-hour delta clamps hours to 99 rather than overflowing layout', () => {
  // The countdown is bounded to <1h by nextFundingMs, but defensive:
  // a hypothetical 100h delta must still render in 8 chars.
  const huge = 100 * 60 * 60 * 1000;
  const out = formatCountdown(huge);
  assert.equal(out.length, 8);
  assert.equal(out, '99:00:00');
});
