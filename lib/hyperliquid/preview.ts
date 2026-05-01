/**
 * Typed re-export of the preview math. The implementation lives in
 * `preview.mjs` so the zero-dep `node --test` runner can import it
 * without a TS toolchain (Node 20 has no native type-stripping).
 * Consumers should import from `@/lib/hyperliquid/preview` — this file
 * provides the explicit TS types the JS doesn't.
 */

export {
  orderValue,
  marginRequired,
  liquidationPrice,
} from './preview.mjs';

export interface LiqPriceInput {
  side: 'long' | 'short';
  /** Entry price in USD. Must be > 0. */
  entryPx: number;
  /** Base-coin size. Always positive — `side` carries direction. */
  size: number;
  /** Position leverage. Must be > 0. */
  leverage: number;
  /** true = cross margin, false = isolated. */
  isCross: boolean;
  /** Cross only: total account value (USD). Widens liq distance. */
  accountValue?: number;
  /** Cross only: margin already locked by other positions (USD). */
  marginUsed?: number;
  /**
   * Maintenance-margin fraction. Production callers thread this from
   * `priceStore.MarketRow.maintenanceMarginFraction` (Hyperliquid uses
   * `1 / (2 * maxLeverage)` as the default tier). Falls back to 0.005 if
   * omitted — a placeholder that should not reach production paths.
   */
  maintenanceMarginFrac?: number;
}
