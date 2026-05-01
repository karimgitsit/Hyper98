import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';
import type { FrontendOpenOrdersResponse } from '@nktkas/hyperliquid';

export interface HistoricalOrder extends OpenOrder {
  status: string;
  statusTimestamp: number;
}

export interface FundingEvent {
  time: number;
  hash: string;
  coin: string;
  usdc: number;
  szi: number;
  fundingRate: number;
}

export interface OpenOrder {
  coin: string;
  side: 'buy' | 'sell';
  limitPx: number;
  sz: number;
  origSz: number;
  oid: number;
  timestamp: number;
  orderType: string;
  tif: string | null;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: number | null;
}

export interface UserFill {
  coin: string;
  side: 'buy' | 'sell';
  px: number;
  sz: number;
  time: number;
  closedPnl: number;
  fee: number;
  builderFee: number;
  feeToken: string;
  crossed: boolean;
  oid: number;
  hash: string;
  dir: string;
}

interface OrdersStore {
  openOrders: OpenOrder[];
  fills: UserFill[];
  history: HistoricalOrder[];
  funding: FundingEvent[];
  loadingOrders: boolean;
  loadingFills: boolean;
  loadingHistory: boolean;
  loadingFunding: boolean;
  errorOrders: string | null;
  errorFills: string | null;
  errorHistory: string | null;
  errorFunding: string | null;
  lastOrdersFetch: number;
  lastFillsFetch: number;
  lastHistoryFetch: number;
  lastFundingFetch: number;

  fetchOpenOrders: (address: string) => Promise<void>;
  fetchFills: (address: string) => Promise<void>;
  fetchHistory: (address: string) => Promise<void>;
  fetchFunding: (address: string) => Promise<void>;
  clear: () => void;
}

function parseOrder(raw: FrontendOpenOrdersResponse[number]): OpenOrder {
  return {
    coin: raw.coin,
    side: raw.side === 'B' ? 'buy' : 'sell',
    limitPx: parseFloat(raw.limitPx),
    sz: parseFloat(raw.sz),
    origSz: parseFloat(raw.origSz),
    oid: raw.oid,
    timestamp: raw.timestamp,
    orderType: raw.orderType,
    tif: raw.tif,
    reduceOnly: raw.reduceOnly,
    isTrigger: raw.isTrigger,
    triggerPx: raw.isTrigger ? parseFloat(raw.triggerPx) : null,
  };
}

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  openOrders: [],
  fills: [],
  history: [],
  funding: [],
  loadingOrders: false,
  loadingFills: false,
  loadingHistory: false,
  loadingFunding: false,
  errorOrders: null,
  errorFills: null,
  errorHistory: null,
  errorFunding: null,
  lastOrdersFetch: 0,
  lastFillsFetch: 0,
  lastHistoryFetch: 0,
  lastFundingFetch: 0,

  fetchOpenOrders: async (address: string) => {
    if (get().loadingOrders || Date.now() - get().lastOrdersFetch < 3000) return;
    set({ loadingOrders: true, errorOrders: null });
    try {
      const raw = await info.frontendOpenOrders({ user: address as `0x${string}` });
      set({
        openOrders: raw.map(parseOrder),
        loadingOrders: false,
        lastOrdersFetch: Date.now(),
      });
    } catch (e) {
      set({
        loadingOrders: false,
        errorOrders: e instanceof Error ? e.message : 'Failed to fetch open orders',
      });
    }
  },

  fetchFills: async (address: string) => {
    if (get().loadingFills || Date.now() - get().lastFillsFetch < 5000) return;
    set({ loadingFills: true, errorFills: null });
    try {
      const raw = await info.userFills({ user: address as `0x${string}` });
      const fills: UserFill[] = raw.map((f) => ({
        coin: f.coin,
        side: f.side === 'B' ? 'buy' : 'sell',
        px: parseFloat(f.px),
        sz: parseFloat(f.sz),
        time: f.time,
        closedPnl: parseFloat(f.closedPnl),
        fee: parseFloat(f.fee),
        builderFee: f.builderFee ? parseFloat(f.builderFee) : 0,
        feeToken: f.feeToken,
        crossed: f.crossed,
        oid: f.oid,
        hash: f.hash,
        dir: f.dir,
      }));
      // Newest first
      fills.sort((a, b) => b.time - a.time);
      set({
        fills,
        loadingFills: false,
        lastFillsFetch: Date.now(),
      });
    } catch (e) {
      set({
        loadingFills: false,
        errorFills: e instanceof Error ? e.message : 'Failed to fetch fills',
      });
    }
  },

  fetchHistory: async (address: string) => {
    if (get().loadingHistory || Date.now() - get().lastHistoryFetch < 10_000) return;
    set({ loadingHistory: true, errorHistory: null });
    try {
      const raw = await info.historicalOrders({ user: address as `0x${string}` });
      // The API emits one entry per status transition (e.g. an order shows up
      // as both `open` and later `filled`). Hyperliquid's UI collapses these
      // into a single row showing the latest status — match that.
      const latestByOid = new Map<number, HistoricalOrder>();
      for (const row of raw) {
        const item: HistoricalOrder = {
          ...parseOrder(row.order as FrontendOpenOrdersResponse[number]),
          status: row.status,
          statusTimestamp: row.statusTimestamp,
        };
        const prev = latestByOid.get(item.oid);
        if (!prev || item.statusTimestamp > prev.statusTimestamp) {
          latestByOid.set(item.oid, item);
        }
      }
      const history = Array.from(latestByOid.values()).sort(
        (a, b) => b.statusTimestamp - a.statusTimestamp,
      );
      set({ history, loadingHistory: false, lastHistoryFetch: Date.now() });
    } catch (e) {
      set({
        loadingHistory: false,
        errorHistory: e instanceof Error ? e.message : 'Failed to fetch order history',
      });
    }
  },

  fetchFunding: async (address: string) => {
    if (get().loadingFunding || Date.now() - get().lastFundingFetch < 10_000) return;
    set({ loadingFunding: true, errorFunding: null });
    try {
      // Last 7 days; the API caps at ~10k events anyway.
      const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const raw = await info.userFunding({ user: address as `0x${string}`, startTime });
      const funding: FundingEvent[] = raw.map((row) => ({
        time: row.time,
        hash: row.hash,
        coin: row.delta.coin,
        usdc: parseFloat(row.delta.usdc),
        szi: parseFloat(row.delta.szi),
        fundingRate: parseFloat(row.delta.fundingRate),
      }));
      funding.sort((a, b) => b.time - a.time);
      set({ funding, loadingFunding: false, lastFundingFetch: Date.now() });
    } catch (e) {
      set({
        loadingFunding: false,
        errorFunding: e instanceof Error ? e.message : 'Failed to fetch funding history',
      });
    }
  },

  clear: () =>
    set({
      openOrders: [],
      fills: [],
      history: [],
      funding: [],
      errorOrders: null,
      errorFills: null,
      errorHistory: null,
      errorFunding: null,
      lastOrdersFetch: 0,
      lastFillsFetch: 0,
      lastHistoryFetch: 0,
      lastFundingFetch: 0,
    }),
}));
