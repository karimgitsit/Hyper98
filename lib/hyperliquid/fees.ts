/**
 * Typed re-export of the fee helpers. The implementation lives in
 * `fees.mjs` so the zero-dep `node --test` runner can import it without
 * a TS toolchain. Same shim pattern as `funding.ts` / `sizeUnit.ts` /
 * `tpsl.ts` / `preview.ts`.
 */

export {
  HEADLINE_MAKER_RATE,
  HEADLINE_TAKER_RATE,
  feeUsd,
  formatBpsLabel,
  isDiscounted,
  pickDiscountSource,
} from './fees.mjs';

/**
 * Discount-source attribution returned by `pickDiscountSource`. `null`
 * when the user is paying schedule rates.
 */
export type DiscountSource = 'staking' | 'referral' | 'vip' | 'discount' | null;
