import { usePriceStore } from '@/stores/priceStore';

type TitleType = 'market' | 'chart' | 'orderbook';

const BASE: Record<TitleType, string> = {
  market: 'Market.exe',
  chart: 'Chart.exe',
  orderbook: 'OrderBook.exe',
};

// Resolve the user-facing label for a coin: spot pairs use displayName
// (e.g. "PURR/USDC") while perps use the bare coin symbol (e.g. "SOL").
function coinLabel(coin: string, kind: 'perps' | 'spot' | undefined): string {
  if (kind === 'spot') {
    const m = usePriceStore.getState().getSpotMarket(coin);
    return m?.displayName ?? coin;
  }
  return coin;
}

export function marketTitle(
  type: TitleType,
  coin: string | undefined,
  kind: 'perps' | 'spot' | undefined,
): string {
  if (!coin) return BASE[type];
  return `${BASE[type]} - ${coinLabel(coin, kind)}`;
}
