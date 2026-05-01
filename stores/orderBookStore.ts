import { create } from 'zustand';
import { info } from '@/lib/hyperliquid/client';

export interface BookLevel {
  px: number;
  sz: number;
  n: number;
}

export interface OrderBook {
  coin: string;
  time: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

interface OrderBookState {
  books: Record<string, OrderBook>;
  errors: Record<string, string | null>;
  loading: Record<string, boolean>;

  /** Ref-counted subscription. Starts a poll loop for the coin if first subscriber. */
  subscribe: (coin: string) => void;
  unsubscribe: (coin: string) => void;
  /** Internal — forces a refetch. */
  fetchBook: (coin: string) => Promise<void>;
}

// Module-level subscription state (not in zustand since we only want re-renders on data)
const refCounts = new Map<string, number>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();

const POLL_MS = 2000;

function parseLevel(raw: { px: string; sz: string; n: number }): BookLevel {
  return { px: parseFloat(raw.px), sz: parseFloat(raw.sz), n: raw.n };
}

export const useOrderBookStore = create<OrderBookState>((set, get) => ({
  books: {},
  errors: {},
  loading: {},

  fetchBook: async (coin: string) => {
    set((s) => ({ loading: { ...s.loading, [coin]: true } }));
    try {
      const res = await info.l2Book({ coin });
      if (!res) {
        set((s) => ({
          loading: { ...s.loading, [coin]: false },
          errors: { ...s.errors, [coin]: 'Market not found' },
        }));
        return;
      }
      const [bidsRaw, asksRaw] = res.levels;
      const book: OrderBook = {
        coin: res.coin,
        time: res.time,
        bids: bidsRaw.map(parseLevel),
        asks: asksRaw.map(parseLevel),
      };
      set((s) => ({
        books: { ...s.books, [coin]: book },
        errors: { ...s.errors, [coin]: null },
        loading: { ...s.loading, [coin]: false },
      }));
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [coin]: false },
        errors: {
          ...s.errors,
          [coin]: e instanceof Error ? e.message : 'Failed to fetch order book',
        },
      }));
    }
  },

  subscribe: (coin: string) => {
    const current = refCounts.get(coin) ?? 0;
    refCounts.set(coin, current + 1);
    if (current === 0) {
      // Start polling
      void get().fetchBook(coin);
      const id = setInterval(() => void get().fetchBook(coin), POLL_MS);
      pollers.set(coin, id);
    }
  },

  unsubscribe: (coin: string) => {
    const current = refCounts.get(coin) ?? 0;
    if (current <= 1) {
      refCounts.delete(coin);
      const id = pollers.get(coin);
      if (id) clearInterval(id);
      pollers.delete(coin);
    } else {
      refCounts.set(coin, current - 1);
    }
  },
}));
