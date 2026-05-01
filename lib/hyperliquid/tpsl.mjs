/**
 * TP/SL bracket math used by the inline "Add TP/SL on entry" UX in
 * `TradeApp.tsx` (M1.6). Pure functions, no SDK / React / store deps.
 *
 * Convention: `Gain %` and `Loss %` are PnL on initial margin (ROE) —
 * matches Hyperliquid's UI semantics where typing 10% Gain on a 10×
 * position moves the trigger by 1% of price. ROE is what traders
 * actually care about; price-percent is a leaky abstraction across
 * leverage changes.
 *
 *   ROE %      = priceChange% × leverage
 *   priceChange% = ROE% / leverage
 *
 * For a long entry at E with leverage L:
 *   tpPx = E * (1 + (gainPct/100) / L)    valid iff tpPx > E
 *   slPx = E * (1 - (lossPct/100) / L)    valid iff slPx < E
 * For a short entry:
 *   tpPx = E * (1 - (gainPct/100) / L)    valid iff tpPx < E
 *   slPx = E * (1 + (lossPct/100) / L)    valid iff slPx > E
 *
 * `roePctFromTriggerPx` returns the *signed* ROE — negative when the
 * trigger is on the wrong side of entry for the given side/tpsl. The
 * UI uses the sign for validation: TP must be > 0, SL must be > 0.
 */

/**
 * @typedef {'long' | 'short'} TradeSide
 * @typedef {'tp' | 'sl'} TpSlKind
 */

/**
 * Convert a Gain%/Loss% (ROE on margin) into a trigger price.
 * Returns 0 for malformed input.
 *
 * @param {object} input
 * @param {TradeSide} input.side
 * @param {TpSlKind} input.kind
 * @param {number} input.entryPx
 * @param {number} input.leverage
 * @param {number} input.roePct  ROE % (positive). 10 = 10% gain on margin.
 * @returns {number}
 */
export function triggerPxFromRoePct({ side, kind, entryPx, leverage, roePct }) {
  if (
    !Number.isFinite(entryPx) ||
    !Number.isFinite(leverage) ||
    !Number.isFinite(roePct) ||
    entryPx <= 0 ||
    leverage <= 0
  ) {
    return 0;
  }
  const priceChange = (roePct / 100) / leverage;
  // For TP, price moves in the trade's favour; for SL, against it.
  const dir = (kind === 'tp' ? 1 : -1) * (side === 'long' ? 1 : -1);
  const px = entryPx * (1 + dir * priceChange);
  return Math.max(0, px);
}

/**
 * Convert a trigger price into an ROE %. Result is signed: positive when
 * the trigger sits on the correct side of entry for the given (side,
 * kind), negative otherwise. The UI uses this to validate before submit.
 *
 * @param {object} input
 * @param {TradeSide} input.side
 * @param {TpSlKind} input.kind
 * @param {number} input.entryPx
 * @param {number} input.leverage
 * @param {number} input.triggerPx
 * @returns {number}
 */
export function roePctFromTriggerPx({ side, kind, entryPx, leverage, triggerPx }) {
  if (
    !Number.isFinite(entryPx) ||
    !Number.isFinite(leverage) ||
    !Number.isFinite(triggerPx) ||
    entryPx <= 0 ||
    leverage <= 0
  ) {
    return 0;
  }
  const priceChange = (triggerPx - entryPx) / entryPx;
  const dir = (kind === 'tp' ? 1 : -1) * (side === 'long' ? 1 : -1);
  return dir * priceChange * leverage * 100;
}

/**
 * Strict validation: is `triggerPx` on the correct side of `entryPx`
 * for a TP/SL leg? Used to gate submit and surface a Win98 error
 * dialog when violated. Equal-to-entry is rejected (a trigger at
 * entry is degenerate — fires immediately).
 *
 * @param {TradeSide} side
 * @param {TpSlKind} kind
 * @param {number} entryPx
 * @param {number} triggerPx
 * @returns {boolean}
 */
export function isTriggerOnCorrectSide(side, kind, entryPx, triggerPx) {
  if (!Number.isFinite(entryPx) || !Number.isFinite(triggerPx)) return false;
  if (entryPx <= 0 || triggerPx <= 0) return false;
  if (side === 'long') {
    return kind === 'tp' ? triggerPx > entryPx : triggerPx < entryPx;
  }
  return kind === 'tp' ? triggerPx < entryPx : triggerPx > entryPx;
}
