/**
 * Typed re-export of the funding helpers. The implementation lives in
 * `funding.mjs` so the zero-dep `node --test` runner can import it
 * without a TS toolchain. Same shim pattern as `sizeUnit.ts` /
 * `tpsl.ts` / `preview.ts`; types come from JSDoc in the `.mjs` via
 * `allowJs`.
 */

export {
  annualizeHourlyFunding,
  formatFundingPct,
  nextFundingMs,
  formatCountdown,
} from './funding.mjs';
