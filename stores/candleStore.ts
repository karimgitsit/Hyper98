import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';

export type CandleInterval =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '8h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

export interface Candle {
  time: number; // ms
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface CandleSeriesKey {
  coin: string;
  interval: CandleInterval;
}

function keyOf(k: CandleSeriesKey): string {
  return `${k.coin}|${k.interval}`;
}

interface CandleState {
  // Keyed by coin|interval
  series: Record<string, Candle[]>;
  errors: Record<string, string | null>;
  loading: Record<string, boolean>;

  subscribe: (key: CandleSeriesKey) => void;
  unsubscribe: (key: CandleSeriesKey) => void;
  fetchSeries: (key: CandleSeriesKey) => Promise<void>;
}

const refCounts = new Map<string, number>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();
const POLL_MS = 5000;

// Rough "how many ms to look back by default" per interval
const LOOKBACK_MS: Record<CandleInterval, number> = {
  '1m': 60 * 60 * 1000 * 6,       // 6 hours of 1m
  '3m': 60 * 60 * 1000 * 18,
  '5m': 60 * 60 * 1000 * 24,      // 1 day of 5m
  '15m': 60 * 60 * 1000 * 24 * 3,
  '30m': 60 * 60 * 1000 * 24 * 7,
  '1h': 60 * 60 * 1000 * 24 * 14,
  '2h': 60 * 60 * 1000 * 24 * 30,
  '4h': 60 * 60 * 1000 * 24 * 60,
  '8h': 60 * 60 * 1000 * 24 * 120,
  '12h': 60 * 60 * 1000 * 24 * 180,
  '1d': 60 * 60 * 1000 * 24 * 365,
  '3d': 60 * 60 * 1000 * 24 * 365 * 2,
  '1w': 60 * 60 * 1000 * 24 * 365 * 3,
  '1M': 60 * 60 * 1000 * 24 * 365 * 5,
};

export const useCandleStore = create<CandleState>((set, get) => ({
  series: {},
  errors: {},
  loading: {},

  fetchSeries: async (k) => {
    const key = keyOf(k);
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const endTime = Date.now();
      const baseLookback = LOOKBACK_MS[k.interval];

      // Some spot pairs (low-volume / dormant tokens like WOW) have no trades
      // in the default window even though they have plenty of historical
      // candles. Show *something* by widening the window when the first
      // request comes back empty. Each step is uncached, so cap retries at 2.
      const lookbackTries = [baseLookback, baseLookback * 30, baseLookback * 365];
      let raw: Awaited<ReturnType<typeof info.candleSnapshot>> = [];
      for (const lookback of lookbackTries) {
        raw = await info.candleSnapshot({
          coin: k.coin,
          interval: k.interval,
          startTime: endTime - lookback,
          endTime,
        });
        if (raw.length > 0) break;
      }

      const candles: Candle[] = raw.map((c) => ({
        time: c.t,
        open: parseFloat(c.o),
        close: parseFloat(c.c),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        volume: parseFloat(c.v),
      }));
      set((s) => ({
        series: { ...s.series, [key]: candles },
        errors: { ...s.errors, [key]: null },
        loading: { ...s.loading, [key]: false },
      }));
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [key]: false },
        errors: {
          ...s.errors,
          [key]: e instanceof Error ? e.message : 'Failed to fetch candles',
        },
      }));
    }
  },

  subscribe: (k) => {
    const key = keyOf(k);
    const current = refCounts.get(key) ?? 0;
    refCounts.set(key, current + 1);
    if (current === 0) {
      void get().fetchSeries(k);
      const id = setInterval(() => void get().fetchSeries(k), POLL_MS);
      pollers.set(key, id);
    }
  },

  unsubscribe: (k) => {
    const key = keyOf(k);
    const current = refCounts.get(key) ?? 0;
    if (current <= 1) {
      refCounts.delete(key);
      const id = pollers.get(key);
      if (id) clearInterval(id);
      pollers.delete(key);
    } else {
      refCounts.set(key, current - 1);
    }
  },
}));
