import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';

export interface PerpMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

export interface AssetCtx {
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  funding: string;
  openInterest: string;
  oraclePx: string;
}

export interface MarketRow {
  coin: string;
  assetIndex: number;
  szDecimals: number;
  markPx: number;
  /**
   * Oracle price — distinct from `markPx`. HL surfaces both in the perps
   * UI (M3.3 header parity); used as the reference price for funding-
   * rate computation and liquidations on the protocol side.
   */
  oraclePx: number;
  prevDayPx: number;
  change24h: number;
  dayNtlVlm: number;
  funding: number;
  openInterest: number;
  maxLeverage: number;
  /**
   * Maintenance-margin fraction. Hyperliquid does not expose this directly
   * in `meta.universe`; the protocol uses `1 / (2 * maxLeverage)` as the
   * default tier. Threaded into `lib/hyperliquid/preview.ts` so liq-price
   * readouts reflect each asset's real margin tier instead of the 0.005
   * placeholder the math module falls back to.
   */
  maintenanceMarginFraction: number;
  /**
   * `true` iff the asset's universe entry has the `onlyIsolated` flag set
   * (e.g. high-leverage assets HL forbids from cross). Forces the margin-
   * mode pill to Isolated and disables the toggle. Defaults to `false`.
   */
  onlyIsolated: boolean;
}

export interface SpotMarketRow {
  /**
   * Pair name as HL reports it — e.g. "PURR/USDC" for canonical pairs, or
   * "@1" for ad-hoc pairs. This is the value the Info API expects in
   * `candleSnapshot({ coin })` and `l2Book({ coin })` — never substitute
   * a fabricated "BASE/QUOTE" string here, those don't resolve.
   */
  coin: string;
  /** Friendly label for UI rendering — e.g. "FEUSD/USDC" even when `coin` is "@107". */
  displayName: string;
  /** Asset index used for orders: 10000 + spot universe index (HL convention). */
  assetIndex: number;
  /** Base token symbol (e.g. "HYPE"). Derived from the universe's tokens[0]. */
  base: string;
  /** Quote token symbol (e.g. "USDC"). Derived from the universe's tokens[1]. */
  quote: string;
  szDecimals: number;
  markPx: number;
  prevDayPx: number;
  change24h: number;
  dayNtlVlm: number;
  circulatingSupply: number;
}

interface PriceStore {
  markets: MarketRow[];
  loading: boolean;
  error: string | null;
  lastFetch: number;

  spotMarkets: SpotMarketRow[];
  spotLoading: boolean;
  spotError: string | null;
  spotLastFetch: number;

  fetchMarkets: () => Promise<void>;
  fetchSpotMarkets: () => Promise<void>;
  getMarket: (coin: string) => MarketRow | undefined;
  getSpotMarket: (coin: string) => SpotMarketRow | undefined;
}

export const usePriceStore = create<PriceStore>((set, get) => ({
  markets: [],
  loading: false,
  error: null,
  lastFetch: 0,

  spotMarkets: [],
  spotLoading: false,
  spotError: null,
  spotLastFetch: 0,

  fetchMarkets: async () => {
    // Debounce: don't refetch within 5s
    if (get().loading || Date.now() - get().lastFetch < 5000) return;

    set({ loading: true, error: null });
    try {
      const [meta, assetCtxs] = await info.metaAndAssetCtxs({});

      const rows: MarketRow[] = meta.universe
        .map((u, i) => {
          const ctx = assetCtxs[i];
          if (!ctx) return null;
          const markPx = parseFloat(ctx.markPx);
          const prevDayPx = parseFloat(ctx.prevDayPx);
          const change24h = prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0;

          return {
            coin: u.name,
            assetIndex: i,
            szDecimals: u.szDecimals,
            markPx,
            oraclePx: parseFloat(ctx.oraclePx),
            prevDayPx,
            change24h,
            dayNtlVlm: parseFloat(ctx.dayNtlVlm),
            funding: parseFloat(ctx.funding),
            openInterest: parseFloat(ctx.openInterest),
            maxLeverage: u.maxLeverage,
            maintenanceMarginFraction: u.maxLeverage > 0 ? 1 / (2 * u.maxLeverage) : 0.005,
            onlyIsolated: u.onlyIsolated === true,
          };
        })
        .filter((r): r is MarketRow => r !== null);

      set({ markets: rows, loading: false, lastFetch: Date.now() });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch markets',
      });
    }
  },

  getMarket: (coin: string) => {
    return get().markets.find((m) => m.coin === coin);
  },

  fetchSpotMarkets: async () => {
    if (get().spotLoading || Date.now() - get().spotLastFetch < 5000) return;
    set({ spotLoading: true, spotError: null });
    try {
      const [meta, assetCtxs] = await info.spotMetaAndAssetCtxs();
      const tokens = meta.tokens;
      const rows: SpotMarketRow[] = meta.universe
        .map((u, i) => {
          const ctx = assetCtxs[i];
          if (!ctx) return null;
          const baseTok = tokens[u.tokens[0]];
          const quoteTok = tokens[u.tokens[1]];
          const markPx = parseFloat(ctx.markPx);
          const prevDayPx = parseFloat(ctx.prevDayPx);
          const change24h = prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0;
          // Friendly label for the UI: canonical pairs come through as "BASE/QUOTE";
          // ad-hoc universes use names like "@1" — synthesise "BASE/QUOTE" from tokens.
          // The HL API only resolves the original `u.name`, so keep that as `coin`.
          const displayName = u.name.includes('/')
            ? u.name
            : baseTok && quoteTok
              ? `${baseTok.name}/${quoteTok.name}`
              : u.name;
          return {
            coin: u.name,
            displayName,
            assetIndex: 10000 + u.index,
            base: baseTok?.name ?? 'UNK',
            quote: quoteTok?.name ?? 'USDC',
            szDecimals: baseTok?.szDecimals ?? 4,
            markPx,
            prevDayPx,
            change24h,
            dayNtlVlm: parseFloat(ctx.dayNtlVlm),
            circulatingSupply: parseFloat(ctx.circulatingSupply),
          };
        })
        .filter((r): r is SpotMarketRow => r !== null);
      set({ spotMarkets: rows, spotLoading: false, spotLastFetch: Date.now() });
    } catch (e) {
      set({
        spotLoading: false,
        spotError: e instanceof Error ? e.message : 'Failed to fetch spot markets',
      });
    }
  },

  getSpotMarket: (coin: string) => {
    return get().spotMarkets.find((m) => m.coin === coin);
  },
}));
