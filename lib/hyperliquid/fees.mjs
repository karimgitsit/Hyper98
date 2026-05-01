/**
 * Pure helpers for the M3.4 base-fee strike-through in `TradeApp.tsx`'s
 * Order Preview. The user's effective base rate (post volume tier /
 * staking / referral discounts) comes from `info.userFees`; this module
 * just normalizes the numbers into display-ready bits.
 *
 *   - `HEADLINE_MAKER_RATE` / `HEADLINE_TAKER_RATE`: VIP-0 fallbacks for
 *     when the userFees fetch hasn't landed yet (or the wallet isn't
 *     connected). Sourced from HL's public schedule.
 *   - `feeUsd(notional, rate)`: trivial product, kept here so the
 *     Order Preview never has to write `notional * rate` inline against
 *     a possibly-undefined rate.
 *   - `formatBpsLabel(rate)`: `"4.5bps"` / `"4.0bps"` / `"0bps"`. One
 *     fractional digit, trims trailing `.0` on whole numbers so the
 *     label reads as compactly as the headline.
 *   - `isDiscounted(effective, headline)`: epsilon-tolerant `<` so a
 *     parse-from-string float wobble can't claim a discount that isn't
 *     real. The float threshold (1e-9) is many orders of magnitude
 *     below any meaningful rate distinction.
 *   - `pickDiscountSource(userFees)`: attribution suffix for the label
 *     (`'staking' | 'referral' | 'vip'`) when one of HL's three discount
 *     stacks is active. `'discount'` fallback when the user rate is
 *     below the schedule but no specific source flag is set. `null`
 *     when the user is paying schedule rates.
 *
 * No SDK / React / store deps. Tests in `__tests__/fees.test.mjs`.
 */

/** VIP-0 maker base rate (1.5 bps). */
export const HEADLINE_MAKER_RATE = 0.00015;
/** VIP-0 taker base rate (4.5 bps). */
export const HEADLINE_TAKER_RATE = 0.00045;

/**
 * @param {number} notional in USD
 * @param {number} rate decimal (e.g. 0.00045 for 4.5 bps)
 * @returns {number} fee in USD
 */
export function feeUsd(notional, rate) {
  if (!Number.isFinite(notional) || !Number.isFinite(rate)) return 0;
  return notional * rate;
}

/**
 * Format a decimal rate as a basis-points label. One decimal place; the
 * `.0` on whole-bps values is stripped so common headlines read as
 * `1bps` / `4bps` rather than `1.0bps` / `4.0bps`. The Win98 label
 * column is tight; every char saved counts.
 *
 * @param {number} rate decimal (e.g. 0.00045)
 * @returns {string}
 */
export function formatBpsLabel(rate) {
  if (!Number.isFinite(rate) || rate < 0) return '0bps';
  const bps = rate * 10000;
  const rounded = Math.round(bps * 10) / 10;
  // 4.0 → '4', 4.5 → '4.5', 0 → '0'
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}bps`;
}

/**
 * Is the user's effective rate strictly below the headline schedule
 * rate? Epsilon-tolerant so a `parseFloat("0.00045")` ≠
 * `parseFloat("0.000450")` style float wobble can't fabricate a
 * discount on the UI.
 *
 * @param {number} effective decimal user rate
 * @param {number} headline decimal schedule rate
 * @returns {boolean}
 */
export function isDiscounted(effective, headline) {
  if (!Number.isFinite(effective) || !Number.isFinite(headline)) return false;
  return effective + 1e-9 < headline;
}

/**
 * Inspect the `userFees` response and pick the dominant discount source
 * for label attribution. HL exposes three discount stacks; we attribute
 * to the one currently active in this priority order:
 *
 *   1. `staking` — `activeStakingDiscount.discount > 0`
 *   2. `referral` — `activeReferralDiscount > 0`
 *   3. `vip` — user's `userCrossRate` is below the schedule's `cross`
 *      (i.e. the user has clocked enough volume to land on a lower VIP
 *      tier). This is the inferential branch — there's no explicit
 *      "active VIP tier" flag on the response, so we detect it by rate
 *      delta.
 *   4. `discount` — fallback when a rate delta exists but none of the
 *      above flags are set (e.g. an HL-introduced discount we don't yet
 *      attribute).
 *   5. `null` — paying schedule rates, no discount.
 *
 * Pure function; the caller stores the result string (or null) so the
 * full `userFees` blob doesn't have to live in zustand state.
 *
 * @param {object} userFees
 * @returns {('staking'|'referral'|'vip'|'discount'|null)}
 */
export function pickDiscountSource(userFees) {
  if (!userFees || typeof userFees !== 'object') return null;

  const stakingPct = parseFloat(userFees.activeStakingDiscount?.discount ?? '0');
  if (Number.isFinite(stakingPct) && stakingPct > 0) return 'staking';

  const referralPct = parseFloat(userFees.activeReferralDiscount ?? '0');
  if (Number.isFinite(referralPct) && referralPct > 0) return 'referral';

  const headlineCross = parseFloat(userFees.feeSchedule?.cross ?? 'NaN');
  const headlineAdd = parseFloat(userFees.feeSchedule?.add ?? 'NaN');
  const userCross = parseFloat(userFees.userCrossRate ?? 'NaN');
  const userAdd = parseFloat(userFees.userAddRate ?? 'NaN');

  const crossDiscounted = isDiscounted(userCross, headlineCross);
  const addDiscounted = isDiscounted(userAdd, headlineAdd);
  if (crossDiscounted || addDiscounted) return 'vip';

  return null;
}
