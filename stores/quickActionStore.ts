import { create } from 'zustand';
import type { UseBoundStore, StoreApi } from 'zustand';

// Signal from OrderBookApp → TradeApp for click-to-fill semantics.
// One consolidated record so a single zustand `set` produces a single
// render tick and TradeApp's consumer effect fires exactly once even
// when shift+click would otherwise want both a price-fill *and* a
// side-flip. `seq` forces effect re-fire when the user clicks the
// same level twice in a row (object reference would be new anyway,
// but seq keeps the contract explicit).
export interface QuickFill {
  coin: string;
  px: string;
  sz?: string;
  flipSide?: boolean;
  seq: number;
}

interface QuickActionState {
  quickFill: QuickFill | null;
  setQuickFill: (
    coin: string,
    opts: { px: string; sz?: string; flipSide?: boolean },
  ) => void;
  clearQuickFill: () => void;
}

export const useQuickActionStore: UseBoundStore<StoreApi<QuickActionState>> = create<QuickActionState>((set, get) => ({
  quickFill: null,
  setQuickFill: (coin, opts) =>
    set({
      quickFill: {
        coin,
        px: opts.px,
        sz: opts.sz,
        flipSide: opts.flipSide,
        seq: (get().quickFill?.seq ?? 0) + 1,
      },
    }),
  clearQuickFill: () => set({ quickFill: null }),
}));
