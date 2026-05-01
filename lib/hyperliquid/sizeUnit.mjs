/**
 * Pure helpers for the Coin ⇄ USD size-unit toggle and the numeric % input
 * in `TradeApp.tsx` (M1.2 + M1.3). No SDK / React / store deps. Tests in
 * `__tests__/sizeUnit.test.mjs`.
 *
 * The `roundSize` semantics from `lib/hyperliquid/orders.ts` (a plain
 * `sz.toFixed(szDecimals)`) are duplicated here so this module stays
 * zero-dep — same pattern as `preview.mjs` / `tpsl.mjs`. If the rounding
 * rule in `orders.ts` ever changes, update both.
 *
 * Round-trip note: `usdToCoinString($100, 30000, 5)` → `'0.00333'`, which
 * round-trips back to ~$99.90 (lossy by up to one tick, which for BTC is
 * `30000 × 10⁻⁵ ≈ $0.30`). This is intrinsic to the asset's szDecimals
 * and what HL accepts on the wire — the helpers do not lie about it.
 */

/**
 * @typedef {'coin' | 'usd'} SizeUnit
 */

/**
 * Convert a coin amount to a USD notional formatted to 2 decimals.
 * Returns '' for non-finite or non-positive inputs.
 *
 * @param {number} coin
 * @param {number} px
 * @returns {string}
 */
export function coinToUsdString(coin, px) {
  if (!Number.isFinite(coin) || !Number.isFinite(px)) return '';
  if (coin <= 0 || px <= 0) return '';
  return (coin * px).toFixed(2);
}

/**
 * Convert a USD notional to a coin size string rounded to szDecimals
 * (matches `roundSize` in `lib/hyperliquid/orders.ts`).
 * Returns '' for non-finite or non-positive inputs.
 *
 * @param {number} usd
 * @param {number} px
 * @param {number} szDecimals
 * @returns {string}
 */
export function usdToCoinString(usd, px, szDecimals) {
  if (!Number.isFinite(usd) || !Number.isFinite(px)) return '';
  if (usd <= 0 || px <= 0) return '';
  const decimals = Math.max(0, szDecimals | 0);
  return (usd / px).toFixed(decimals);
}

/**
 * Compute the input-string representation for a slider/pct selection in
 * the desired display unit.
 *   - coin: rounded coin amount (`roundSize` semantics).
 *   - usd: USD notional formatted to 2 decimals.
 *
 * Returns '' when the result would be zero or any input is invalid.
 *
 * @param {object} input
 * @param {number} input.pct          0–100 (will not be clamped here)
 * @param {number} input.withdrawable USDC available for trading
 * @param {number} input.px           effective entry price
 * @param {number} input.szDecimals
 * @param {SizeUnit} input.unit
 * @returns {string}
 */
export function pctToInputString({ pct, withdrawable, px, szDecimals, unit }) {
  if (!Number.isFinite(pct) || pct <= 0) return '';
  if (!Number.isFinite(withdrawable) || withdrawable <= 0) return '';
  if (!Number.isFinite(px) || px <= 0) return '';
  const usdAvail = withdrawable * (pct / 100);
  if (usdAvail <= 0) return '';
  if (unit === 'usd') return usdAvail.toFixed(2);
  const decimals = Math.max(0, szDecimals | 0);
  return (usdAvail / px).toFixed(decimals);
}

/**
 * Clamp a percentage to [0, 100]. Non-finite → 0.
 *
 * @param {number} pct
 * @returns {number}
 */
export function clampPct(pct) {
  if (!Number.isFinite(pct)) return 0;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}
