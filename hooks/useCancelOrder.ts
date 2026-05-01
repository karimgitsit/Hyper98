'use client';

import { useCallback, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useOrdersStore, type OpenOrder } from '@/stores/ordersStore';
import { usePriceStore } from '@/stores/priceStore';
import { cancelOrder, cancelOrderViaAgent } from '@/lib/hyperliquid/orders';
import { getStoredAgentKey } from '@/lib/hyperliquid/agent';

export function useCancelOrder() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);
  const getMarket = usePriceStore((s) => s.getMarket);
  const getSpotMarket = usePriceStore((s) => s.getSpotMarket);

  const [cancelling, setCancelling] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(
    async (o: OpenOrder) => {
      if (!walletClient) return;
      setError(null);
      // Spot orders come back with coin names like "@151" (or canonical
      // "PURR/USDC") and need the spot asset index, which is 10000 + the
      // spot universe index. Fall back to spot lookup when the perp
      // registry doesn't know the coin.
      const perp = getMarket(o.coin);
      const spot = perp ? null : getSpotMarket(o.coin);
      const assetIndex = perp?.assetIndex ?? spot?.assetIndex;
      if (assetIndex == null) {
        setError(`Cannot cancel ${o.coin}: market metadata not loaded`);
        return;
      }
      setCancelling((m) => ({ ...m, [o.oid]: true }));
      try {
        const connectedAddr = walletClient.account?.address;
        const agentKey = connectedAddr ? getStoredAgentKey(connectedAddr) : null;
        const res = agentKey
          ? await cancelOrderViaAgent(agentKey, assetIndex, o.oid)
          : await cancelOrder(walletClient, assetIndex, o.oid);
        const status = res?.response?.data?.statuses?.[0];
        if (status && typeof status === 'object' && 'error' in status && (status as { error?: unknown }).error) {
          setError(String((status as { error?: unknown }).error));
        } else if (address) {
          fetchOpenOrders(address);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cancel failed');
      } finally {
        setCancelling((m) => {
          const copy = { ...m };
          delete copy[o.oid];
          return copy;
        });
      }
    },
    [walletClient, address, getMarket, fetchOpenOrders],
  );

  return { cancel, cancelling, error };
}
