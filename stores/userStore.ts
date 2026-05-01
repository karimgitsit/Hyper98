import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';
import { pickDiscountSource, type DiscountSource } from '@/lib/hyperliquid/fees';
import { useDexStore } from '@/stores/dexStore';

/**
 * Hyperliquid's `userAbstraction` states. A user on `"unifiedAccount"` has
 * spot and perp balances merged, so the spot<->perp USD class transfer flow
 * is a no-op and should be hidden from the UI.
 */
export type AbstractionMode =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction';

export interface Position {
  coin: string;
  szi: number;
  entryPx: number;
  markPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  liquidationPx: number | null;
  leverage: number;
  leverageType: 'isolated' | 'cross';
  marginUsed: number;
  /**
   * Empty string for main-dex positions; HIP-3 dex name (e.g. "flx") for
   * deployer-dex positions. Used by PositionsApp to look up market
   * metadata in the right store (priceStore vs dexStore).
   */
  dex: string;
}

/**
 * Per-HIP-3-dex margin snapshot. The user can hold positions on multiple
 * HIP-3 dexes simultaneously; each has its own clearinghouse and margin
 * account. Keyed by dex name. Withdrawable here is the dex-scoped
 * balance — NOT the main-account withdrawable (unless the user has
 * `dexAbstraction` enabled, in which case orders pull from main).
 */
export interface Hip3DexState {
  withdrawable: number;
  marginSummary: MarginSummary;
}

export interface MarginSummary {
  accountValue: number;
  totalNtlPos: number;
  totalMarginUsed: number;
}

export interface SpotBalance {
  coin: string;
  total: number;
  hold: number;
}

/**
 * Derived view of `info.userFees` used by TradeApp's M3.4 base-fee
 * strike-through. Stores only the four numeric rates the UI needs (plus
 * an attribution string) so the full UserFeesResponse — which includes
 * dailyUserVlm[] and the entire VIP tier table — doesn't have to live
 * in zustand state. All rates are decimals (`0.00045` = 4.5 bps).
 */
export interface FeeRates {
  /** Schedule taker rate (perps cross). VIP-0 is 0.00045. */
  headlineCross: number;
  /** Schedule maker rate (perps add). VIP-0 is 0.00015. */
  headlineAdd: number;
  /** User's effective taker rate post discounts. */
  userCross: number;
  /** User's effective maker rate post discounts. */
  userAdd: number;
  /** Dominant discount source, or null when paying schedule. */
  discountSource: DiscountSource;
}

interface UserStore {
  // Perp state. Includes both main-dex and HIP-3 positions in one flat
  // list — distinguish via `Position.dex` (empty string = main).
  positions: Position[];
  marginSummary: MarginSummary | null;
  withdrawable: number;

  /**
   * Per-HIP-3-dex margin state. Keyed by dex name. Populated by the same
   * `fetchUserState` fan-out that pulls main perp state. Empty until the
   * user opens a HIP-3 surface — the fan-out is gated on `dexStore.dexes`
   * being loaded.
   */
  hip3States: Record<string, Hip3DexState>;

  // Spot state
  spotBalances: SpotBalance[];

  // Account mode (Hyperliquid "abstraction"). `null` = not yet fetched.
  // When this is `'unifiedAccount'`, spot and perp balances are merged and
  // the class-transfer flow is irrelevant.
  abstraction: AbstractionMode | null;

  // Per-user fee rates from `info.userFees`, derived for TradeApp's
  // base-fee strike-through (M3.4). `null` = not yet fetched / wallet
  // disconnected — TradeApp falls back to the headline VIP-0 schedule
  // and renders the row without a strike-through (no visual regression).
  feeRates: FeeRates | null;

  loading: boolean;
  error: string | null;
  lastFetch: number;

  fetchUserState: (address: string, opts?: { force?: boolean }) => Promise<void>;
  clear: () => void;
}

/** Selector helper: `true` iff we know the user is on a unified account. */
export const selectIsUnifiedAccount = (s: Pick<UserStore, 'abstraction'>): boolean =>
  s.abstraction === 'unifiedAccount';

export const useUserStore = create<UserStore>((set, get) => ({
  positions: [],
  marginSummary: null,
  withdrawable: 0,
  hip3States: {},
  spotBalances: [],
  abstraction: null,
  feeRates: null,
  loading: false,
  error: null,
  lastFetch: 0,

  fetchUserState: async (address: string, opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (get().loading) return;
    if (!force && Date.now() - get().lastFetch < 5000) return;

    set({ loading: true, error: null });
    try {
      // Pull the HIP-3 dex list. `fetchDexes` is debounced internally
      // (no-op when already in flight or loaded), so calling on every
      // tick is cheap. We need the list before we can fan out per-dex
      // clearinghouseState calls — without it, HIP-3 positions don't
      // surface in PositionsApp at all.
      const dexStore = useDexStore.getState();
      if (dexStore.dexes.length === 0) {
        await dexStore.fetchDexes();
      }
      const dexNames = useDexStore.getState().dexes.map((d) => d.name);

      // `userAbstraction` is a newer endpoint — on older nodes or unusual
      // account states it may reject. Treat a failure as "unknown" and fall
      // back to the classic (non-unified) flow, rather than blocking the
      // whole fetch. `userFees` is treated the same way: a transient
      // failure leaves the existing `feeRates` in place and TradeApp
      // falls back to the headline schedule rather than the whole user
      // state stalling.
      const [perpState, spotState, abstractionResult, feesResult, hip3Results] = await Promise.all([
        info.clearinghouseState({ user: address }),
        info.spotClearinghouseState({ user: address }),
        info
          .userAbstraction({ user: address as `0x${string}` })
          .then((a) => ({ ok: true as const, a }))
          .catch(() => ({ ok: false as const })),
        info
          .userFees({ user: address as `0x${string}` })
          .then((f) => ({ ok: true as const, f }))
          .catch(() => ({ ok: false as const })),
        // Fan-out across every HIP-3 dex. Each call is independent;
        // failures on one dex shouldn't block the others. Empty
        // `dexNames` resolves to [] immediately.
        Promise.all(
          dexNames.map((dex) =>
            info
              .clearinghouseState({ user: address, dex })
              .then((state) => ({ ok: true as const, dex, state }))
              .catch(() => ({ ok: false as const, dex })),
          ),
        ),
      ]);

      const mainPositions: Position[] = perpState.assetPositions
        .map((ap) => {
          const p = ap.position;
          const szi = parseFloat(p.szi);
          if (szi === 0) return null;
          return {
            coin: p.coin,
            szi,
            entryPx: parseFloat(p.entryPx),
            markPx: 0, // Will be filled from price store
            positionValue: parseFloat(p.positionValue),
            unrealizedPnl: parseFloat(p.unrealizedPnl),
            returnOnEquity: parseFloat(p.returnOnEquity),
            liquidationPx: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
            leverage: p.leverage.value,
            leverageType: p.leverage.type,
            marginUsed: parseFloat(p.marginUsed),
            dex: '',
          };
        })
        .filter((p): p is Position => p !== null);

      // Merge HIP-3 positions in. Each dex's clearinghouseState returns
      // positions whose `coin` already carries the dex prefix
      // (e.g. "flx:TSLA"), so they're naturally distinct from main-dex
      // entries — we tag with `dex` for downstream lookups (market
      // metadata via dexStore vs. priceStore).
      const hip3States: Record<string, Hip3DexState> = {};
      const hip3Positions: Position[] = [];
      for (const r of hip3Results) {
        if (!r.ok) continue;
        hip3States[r.dex] = {
          withdrawable: parseFloat(r.state.withdrawable),
          marginSummary: {
            accountValue: parseFloat(r.state.marginSummary.accountValue),
            totalNtlPos: parseFloat(r.state.marginSummary.totalNtlPos),
            totalMarginUsed: parseFloat(r.state.marginSummary.totalMarginUsed),
          },
        };
        for (const ap of r.state.assetPositions) {
          const p = ap.position;
          const szi = parseFloat(p.szi);
          if (szi === 0) continue;
          hip3Positions.push({
            coin: p.coin,
            szi,
            entryPx: parseFloat(p.entryPx),
            markPx: 0,
            positionValue: parseFloat(p.positionValue),
            unrealizedPnl: parseFloat(p.unrealizedPnl),
            returnOnEquity: parseFloat(p.returnOnEquity),
            liquidationPx: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
            leverage: p.leverage.value,
            leverageType: p.leverage.type,
            marginUsed: parseFloat(p.marginUsed),
            dex: r.dex,
          });
        }
      }
      const positions: Position[] = [...mainPositions, ...hip3Positions];

      const marginSummary: MarginSummary = {
        accountValue: parseFloat(perpState.marginSummary.accountValue),
        totalNtlPos: parseFloat(perpState.marginSummary.totalNtlPos),
        totalMarginUsed: parseFloat(perpState.marginSummary.totalMarginUsed),
      };

      const spotBalances: SpotBalance[] = spotState.balances
        .map((b) => ({
          coin: b.coin,
          total: parseFloat(b.total),
          hold: parseFloat(b.hold),
        }))
        .filter((b) => b.total > 0);

      // Derive the fee-rate slice from `userFees`. We pull only the four
      // numbers the strike-through needs plus an attribution string;
      // the full response (incl. dailyUserVlm[] and the full VIP tier
      // table) doesn't need to round-trip through zustand.
      let feeRates: FeeRates | null = get().feeRates;
      if (feesResult.ok) {
        const f = feesResult.f;
        feeRates = {
          headlineCross: parseFloat(f.feeSchedule.cross),
          headlineAdd: parseFloat(f.feeSchedule.add),
          userCross: parseFloat(f.userCrossRate),
          userAdd: parseFloat(f.userAddRate),
          discountSource: pickDiscountSource(f),
        };
      }

      set({
        positions,
        marginSummary,
        withdrawable: parseFloat(perpState.withdrawable),
        hip3States,
        spotBalances,
        abstraction: abstractionResult.ok
          ? (abstractionResult.a as AbstractionMode)
          : get().abstraction, // keep previous value on transient failure
        feeRates,
        loading: false,
        lastFetch: Date.now(),
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch user state',
      });
    }
  },

  clear: () =>
    set({
      positions: [],
      marginSummary: null,
      withdrawable: 0,
      hip3States: {},
      spotBalances: [],
      abstraction: null,
      feeRates: null,
      error: null,
      lastFetch: 0,
    }),
}));
