/**
 * Typed re-export of the size-unit helpers. The implementation lives in
 * `sizeUnit.mjs` so the zero-dep `node --test` runner can import it
 * without a TS toolchain. Consumers should import from
 * `@/lib/hyperliquid/sizeUnit`. Same shim pattern as `tpsl.ts` /
 * `preview.ts`; types come from JSDoc in the `.mjs` via `allowJs`.
 */

export {
  coinToUsdString,
  usdToCoinString,
  pctToInputString,
  clampPct,
} from './sizeUnit.mjs';

export type SizeUnit = 'coin' | 'usd';
