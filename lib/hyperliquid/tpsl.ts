/**
 * Typed re-export of the TP/SL bracket math. The implementation lives
 * in `tpsl.mjs` so the zero-dep `node --test` runner can import it
 * without a TS toolchain. Consumers should import from
 * `@/lib/hyperliquid/tpsl`. Types come from the JSDoc in `tpsl.mjs`
 * via `allowJs` — same pattern as `preview.ts`.
 */

export {
  triggerPxFromRoePct,
  roePctFromTriggerPx,
  isTriggerOnCorrectSide,
} from './tpsl.mjs';

export type TradeSide = 'long' | 'short';
export type TpSlKind = 'tp' | 'sl';
