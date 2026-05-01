import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';

export interface PerpDex {
  name: string;
  fullName: string;
  deployer: string;
  feeRecipient: string | null;
  assetCount: number;
  deployerFeeScale: number;
  /**
   * Position in `info.perpDexs()` (0 = main dex / null, 1+ = HIP-3 dexes).
   * Used to compute the global asset id for orders:
   *   `100000 + perpDexIndex * 10000 + assetIndexWithinDex`.
   * See lib's SymbolConverter — this is the encoding HL expects on
   * `exchange.order({ orders: [{ a: <id>, ... }] })`.
   */
  perpDexIndex: number;
}

export interface DexAsset {
  /** Full coin name as HL reports it — e.g. "flx:TSLA". This is what
   *  `info.l2Book({ coin })`, candle subscriptions, etc. accept. */
  coin: string;
  /** Global asset id used for order placement (see `PerpDex.perpDexIndex`). */
  assetIndex: number;
  szDecimals: number;
  markPx: number;
  oraclePx: number;
  dayNtlVlm: number;
  openInterest: number;
  maxLeverage: number;
  /** Maintenance-margin fraction default (1 / (2 * maxLev)). */
  maintenanceMarginFraction: number;
  onlyIsolated: boolean;
  funding: number;
  change24h: number;
}

interface DexStore {
  dexes: PerpDex[];
  assetsByDex: Record<string, DexAsset[]>;
  loading: boolean;
  error: string | null;
  loadingAssetsFor: string | null;

  fetchDexes: () => Promise<void>;
  fetchDexAssets: (dexName: string) => Promise<void>;
}

export const useDexStore = create<DexStore>((set, get) => ({
  dexes: [],
  assetsByDex: {},
  loading: false,
  error: null,
  loadingAssetsFor: null,

  fetchDexes: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const raw = await info.perpDexs();
      // Track the original array index — it's the `perpDexIndex` HL uses
      // to encode HIP-3 asset IDs (100000 + perpDexIndex*10000 + i).
      // Index 0 is the main dex (null entry); HIP-3 dexes start at 1.
      const dexes: PerpDex[] = raw
        .map((d, idx) => ({ d, idx }))
        .filter((e): e is { d: NonNullable<typeof e.d>; idx: number } => e.d !== null)
        .map(({ d, idx }) => ({
          name: d.name,
          fullName: d.fullName,
          deployer: d.deployer,
          feeRecipient: d.feeRecipient,
          assetCount: d.assetToStreamingOiCap.length,
          deployerFeeScale: parseFloat(d.deployerFeeScale),
          perpDexIndex: idx,
        }));
      set({ dexes, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch HIP-3 dexes',
      });
    }
  },

  fetchDexAssets: async (dexName: string) => {
    set({ loadingAssetsFor: dexName, error: null });
    try {
      const dex = get().dexes.find((d) => d.name === dexName);
      if (!dex) throw new Error(`Unknown HIP-3 dex: ${dexName}`);
      const [meta, ctxs] = await info.metaAndAssetCtxs({ dex: dexName });
      const offset = 100000 + dex.perpDexIndex * 10000;
      const assets: DexAsset[] = meta.universe.map((u, i) => {
        const c = ctxs[i];
        const markPx = c ? parseFloat(c.markPx) : 0;
        const prevDayPx = c ? parseFloat(c.prevDayPx) : 0;
        return {
          coin: u.name,
          assetIndex: offset + i,
          szDecimals: u.szDecimals,
          markPx,
          oraclePx: c ? parseFloat(c.oraclePx) : 0,
          dayNtlVlm: c ? parseFloat(c.dayNtlVlm) : 0,
          openInterest: c ? parseFloat(c.openInterest) : 0,
          maxLeverage: u.maxLeverage,
          maintenanceMarginFraction: u.maxLeverage > 0 ? 1 / (2 * u.maxLeverage) : 0.005,
          onlyIsolated: u.onlyIsolated === true,
          funding: c ? parseFloat(c.funding) : 0,
          change24h: prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0,
        };
      });
      set((s) => ({
        assetsByDex: { ...s.assetsByDex, [dexName]: assets },
        loadingAssetsFor: null,
      }));
    } catch (e) {
      set({
        loadingAssetsFor: null,
        error: e instanceof Error ? e.message : `Failed to fetch assets for ${dexName}`,
      });
    }
  },
}));
