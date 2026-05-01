/**
 * Pure order-preview math. No SDK imports, no React, no stores — so it's
 * trivially unit-testable and safe to call from anywhere (render path,
 * zustand derivation, tests).
 *
 * Authored as `.mjs` + JSDoc rather than `.ts` so the Node test runner can
 * import it directly (Node 20 has no native TS). TypeScript consumers get
 * full typing via `allowJs: true` in tsconfig.
 *
 * Liquidation-price derivation (Hyperliquid margin docs):
 *
 *   Liquidation fires when account equity falls to the maintenance-margin
 *   requirement. With entry E, size S, leverage L, initial margin N/L
 *   where N = E * S, and maintenance-margin fraction m, equity at mark
 *   price p is:
 *
 *     long:   equity = N/L - (E - p) * S
 *     short:  equity = N/L - (p - E) * S
 *     posVal = p * S
 *
 *   Solving equity / posVal = m yields
 *
 *     long:   p_liq = E * (1 - 1/L) / (1 - m)
 *     short:  p_liq = E * (1 + 1/L) / (1 + m)
 *
 *   Under cross margin, free account collateral
 *   (accountValue - marginUsed) cushions losses. Model it as bumping the
 *   effective margin fraction: replace 1/L with 1/L + free / notional.
 *
 * Per-asset `maintenanceMarginFrac` is threaded by callers from
 * `priceStore.MarketRow.maintenanceMarginFraction`, which is computed as
 * `1 / (2 * maxLeverage)` (Hyperliquid's default tier — the SDK's
 * `meta.universe` exposes no explicit field). The 0.005 fallback below is
 * only hit if a caller forgets to pass it; production paths should not.
 */

/**
 * @typedef {object} LiqPriceInput
 * @property {'long'|'short'} side
 * @property {number} entryPx   Entry price, USD. Must be > 0.
 * @property {number} size      Base-coin size. Always positive.
 * @property {number} leverage  Position leverage. Must be > 0.
 * @property {boolean} isCross  true = cross, false = isolated.
 * @property {number} [accountValue]          Cross only: total account value (USD).
 * @property {number} [marginUsed]            Cross only: margin locked by other positions (USD).
 * @property {number} [maintenanceMarginFrac] Defaults to 0.005 — TODO M1.1.
 */

/**
 * USD notional of a position at the given price.
 * @param {number} priceUsd
 * @param {number} size
 * @returns {number}
 */
export function orderValue(priceUsd, size) {
  if (!Number.isFinite(priceUsd) || !Number.isFinite(size)) return 0;
  return Math.abs(priceUsd * size);
}

/**
 * Initial margin required for a position (USD).
 * @param {number} priceUsd
 * @param {number} size
 * @param {number} leverage
 * @returns {number}
 */
export function marginRequired(priceUsd, size, leverage) {
  if (leverage <= 0) return 0;
  return orderValue(priceUsd, size) / leverage;
}

/**
 * Estimated liquidation price. Returns 0 for malformed inputs.
 * Cross-margin callers should pass `accountValue` and `marginUsed` so the
 * free-margin cushion is included — omitting them collapses cross to the
 * isolated case (conservative: a tighter liq than the user will see).
 * @param {LiqPriceInput} input
 * @returns {number}
 */
export function liquidationPrice(input) {
  const { side, entryPx, size, leverage } = input;
  const mmf = input.maintenanceMarginFrac ?? 0.005;
  if (
    !Number.isFinite(entryPx) ||
    !Number.isFinite(size) ||
    !Number.isFinite(leverage) ||
    entryPx <= 0 ||
    size <= 0 ||
    leverage <= 0
  ) {
    return 0;
  }

  const notional = entryPx * size;

  // Effective margin fraction = initialMargin / notional, optionally
  // widened by free cross collateral.
  let marginFrac = 1 / leverage;
  if (input.isCross && input.accountValue !== undefined && input.marginUsed !== undefined) {
    const free = Math.max(0, input.accountValue - input.marginUsed);
    if (notional > 0) marginFrac += free / notional;
  }

  if (side === 'long') {
    // Over-margined to the point that liq would sit above entry — return 0.
    if (marginFrac >= 1) return 0;
    const liq = (entryPx * (1 - marginFrac)) / (1 - mmf);
    return Math.max(0, liq);
  }

  return (entryPx * (1 + marginFrac)) / (1 + mmf);
}
