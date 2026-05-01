/**
 * Pure helpers for the M3.3 header funding readouts in `TradeApp.tsx`:
 *   - `annualizeHourlyFunding`: HL pays funding hourly, the UI displays
 *     it annualized — `hourlyRate * 24 * 365`.
 *   - `formatFundingPct`: signed percentage formatter for display.
 *   - `nextFundingMs`: timestamp of the next top-of-hour boundary
 *     (HL's funding tick cadence). Independent of any clock skew the
 *     server might have — the displayed countdown is approximate by
 *     contract.
 *   - `formatCountdown`: `HH:MM:SS` against a millisecond delta. Pads
 *     to fixed width so the header doesn't reflow every second.
 *
 * No SDK / React / store deps. Tests in `__tests__/funding.test.mjs`.
 */

const HOURS_PER_YEAR = 24 * 365;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Annualize an hourly funding rate. HL's `assetCtx.funding` is the rate
 * paid each hour as a signed decimal (e.g. `0.0000125` ≈ 1.25 bps/hr →
 * ~10.95% annualized). Linear extrapolation, which is how HL's UI
 * displays the headline figure.
 *
 * @param {number} hourlyRate signed decimal (not percent)
 * @returns {number} annualized rate as a signed decimal
 */
export function annualizeHourlyFunding(hourlyRate) {
  if (!Number.isFinite(hourlyRate)) return 0;
  return hourlyRate * HOURS_PER_YEAR;
}

/**
 * Format a signed decimal rate as `+12.34%` / `-12.34%` / `0.00%`.
 * Always renders the explicit `+` for positive non-zero values so the
 * direction is unambiguous next to the existing red/green tint.
 *
 * @param {number} rate signed decimal (e.g. 0.1234 → "+12.34%")
 * @param {number} [decimals=4] digits after the decimal point
 * @returns {string}
 */
export function formatFundingPct(rate, decimals = 4) {
  if (!Number.isFinite(rate)) return '—';
  const pct = rate * 100;
  const fixed = pct.toFixed(decimals);
  // toFixed can produce '-0.0000' for tiny negative drift; normalize.
  if (parseFloat(fixed) === 0) return `0.${'0'.repeat(decimals)}%`;
  return pct > 0 ? `+${fixed}%` : `${fixed}%`;
}

/**
 * Return the timestamp (ms since epoch) of the next top-of-hour boundary
 * strictly after `now`. HL pays funding on the hour (UTC), so this
 * doubles as "next funding tick".
 *
 * `now` already at the top of the hour returns `now + 1h` — the tick
 * just-elapsed isn't the *next* one. This matches HL's UI which reads
 * "59:59" → "00:00" → "59:59" rather than collapsing to "00:00:00".
 *
 * @param {number} now ms since epoch
 * @returns {number}
 */
export function nextFundingMs(now) {
  if (!Number.isFinite(now)) return 0;
  return Math.floor(now / MS_PER_HOUR) * MS_PER_HOUR + MS_PER_HOUR;
}

/**
 * Format a positive millisecond delta as `HH:MM:SS`. Negative or
 * non-finite inputs render as `00:00:00`. Hours wrap at 99 (the
 * countdown is bounded to <1h by `nextFundingMs`, so this only ever
 * matters if a caller passes a multi-hour delta — render rather than
 * crash).
 *
 * @param {number} msRemaining
 * @returns {string}
 */
export function formatCountdown(msRemaining) {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = hours >= 99 ? '99' : String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
