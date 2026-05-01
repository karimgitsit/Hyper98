/**
 * Pure helpers for the partial-close size math used by the M2.1 / M2.2
 * close dialogs in `components/windows/PositionsApp.tsx`. No SDK / React /
 * store deps. Tests in `__tests__/closeSize.test.mjs`.
 *
 * Critical contract: the returned coin-size string MUST never exceed
 * `positionAbsSize` (Hyperliquid rejects reduce-only orders that would
 * over-close). Two distinct paths handle this:
 *
 *   - 100% (and `custom >= position`) emits `positionAbsSize.toFixed(decimals)`
 *     directly. `roundSize` semantics in `lib/hyperliquid/orders.ts` rely on
 *     the API returning sizes already at szDecimals precision, so toFixed
 *     round-trips byte-exactly. Going through the multiply-then-floor path
 *     would risk float drift (e.g. `0.29 * 100000 = 28999.999…` floors to
 *     `28999`, leaving a stale tick on the position).
 *
 *   - Partial (<100% pct, custom < position) is `floor(raw * 10^d) / 10^d`.
 *     Floor (not toFixed) so a 50% click on 0.300003 BTC (szDecimals=5)
 *     never rounds *up* to a value the position can't satisfy. By
 *     definition floor(<position) < position, so the reduce-only check
 *     passes.
 */

/**
 * @typedef {{ kind: 'pct', pct: number } | { kind: 'custom', size: number }} CloseSizeSelection
 */

/**
 * Compute the close-size string sent to the SDK.
 *
 * Returns `''` when the inputs are invalid or the result would round
 * below one tick — callers should treat empty as "disable confirm".
 *
 * @param {number} positionAbsSize  Absolute |szi| of the position.
 * @param {CloseSizeSelection} selection
 * @param {number} szDecimals
 * @returns {string}
 */
export function computeCloseSize(positionAbsSize, selection, szDecimals) {
  if (!Number.isFinite(positionAbsSize) || positionAbsSize <= 0) return '';
  const decimals = Math.max(0, szDecimals | 0);

  if (selection.kind === 'pct') {
    if (!Number.isFinite(selection.pct) || selection.pct <= 0) return '';
    if (selection.pct >= 100) {
      return positionAbsSize.toFixed(decimals);
    }
    const raw = positionAbsSize * (selection.pct / 100);
    return floorToString(raw, decimals);
  }

  // custom
  if (!Number.isFinite(selection.size) || selection.size <= 0) return '';
  if (selection.size >= positionAbsSize) {
    // User over-typed — clamp to position. Same exact-match logic as 100%.
    return positionAbsSize.toFixed(decimals);
  }
  return floorToString(selection.size, decimals);
}

/**
 * @param {number} raw
 * @param {number} decimals
 * @returns {string}
 */
function floorToString(raw, decimals) {
  const factor = Math.pow(10, decimals);
  const floored = Math.floor(raw * factor) / factor;
  if (floored <= 0) return '';
  return floored.toFixed(decimals);
}
