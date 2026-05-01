'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useOrdersStore, type OpenOrder } from '@/stores/ordersStore';
import { usePriceStore } from '@/stores/priceStore';
import { cancelOrder, cancelOrderViaAgent } from '@/lib/hyperliquid/orders';
import { getStoredAgentKey } from '@/lib/hyperliquid/agent';

function formatPx(n: number): string {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function OrdersApp({ windowId: _windowId }: { windowId: string }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const openOrders = useOrdersStore((s) => s.openOrders);
  const loading = useOrdersStore((s) => s.loadingOrders);
  const error = useOrdersStore((s) => s.errorOrders);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);
  const clearStore = useOrdersStore((s) => s.clear);

  const getMarket = usePriceStore((s) => s.getMarket);
  const fetchMarkets = usePriceStore((s) => s.fetchMarkets);

  const [cancelling, setCancelling] = useState<Record<number, boolean>>({});
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      clearStore();
      return;
    }
    fetchOpenOrders(address);
    fetchMarkets();
    const t = setInterval(() => fetchOpenOrders(address), 5000);
    return () => clearInterval(t);
  }, [address, fetchOpenOrders, fetchMarkets, clearStore]);

  async function onCancel(o: OpenOrder) {
    if (!walletClient) return;
    setCancelError(null);
    const market = getMarket(o.coin);
    if (!market) {
      setCancelError(`Cannot cancel ${o.coin}: market metadata not loaded`);
      return;
    }
    setCancelling((m) => ({ ...m, [o.oid]: true }));
    try {
      const connectedAddr = walletClient.account?.address;
      const agentKey = connectedAddr ? getStoredAgentKey(connectedAddr) : null;
      const res = agentKey
        ? await cancelOrderViaAgent(agentKey, market.assetIndex, o.oid)
        : await cancelOrder(walletClient, market.assetIndex, o.oid);
      const status = res?.response?.data?.statuses?.[0];
      if (status && typeof status === 'object' && 'error' in status && (status as { error?: unknown }).error) {
        setCancelError(String((status as { error?: unknown }).error));
      } else {
        // Refresh
        if (address) fetchOpenOrders(address);
      }
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling((m) => {
        const copy = { ...m };
        delete copy[o.oid];
        return copy;
      });
    }
  }

  async function onCancelAll() {
    for (const o of openOrders) {
      // Sequential to keep nonces clean
      // eslint-disable-next-line no-await-in-loop
      await onCancel(o);
    }
  }

  if (!isConnected) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Orders.exe</div>
        <div style={{ color: '#808080', marginBottom: 16 }}>
          Connect your wallet to view open orders.
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button className="btn primary" onClick={show}>
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <div style={{
        padding: '4px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--bevel-dark-1)',
      }}>
        <span style={{ color: '#808080' }}>
          {openOrders.length} open order{openOrders.length !== 1 ? 's' : ''}
          {loading && ' \u00B7 loading...'}
        </span>
        <button
          className="btn"
          onClick={onCancelAll}
          disabled={openOrders.length === 0}
          style={{ marginLeft: 'auto', fontSize: 10, minWidth: 'auto', padding: '2px 8px' }}
        >
          Cancel All
        </button>
      </div>

      {error && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>Error: {error}</div>
      )}
      {cancelError && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>Cancel error: {cancelError}</div>
      )}

      <div className="sunken" style={{ flex: 1, margin: '0 4px 4px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Coin</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Side</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Filled</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Flags</th>
              <th style={{ ...thStyle, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map((o) => {
              const filled = o.origSz - o.sz;
              const sideColor = o.side === 'buy' ? 'var(--w98-green)' : 'var(--w98-red)';
              return (
                <tr key={o.oid}>
                  <td className="num" style={cellStyle}>{formatTime(o.timestamp)}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{o.coin}</td>
                  <td style={cellStyle}>{o.orderType}{o.tif ? ` / ${o.tif}` : ''}</td>
                  <td style={{ ...cellStyle, color: sideColor, fontWeight: 700 }}>
                    {o.side === 'buy' ? 'LONG' : 'SHORT'}
                  </td>
                  <td className="num" style={cellStyle}>{formatPx(o.limitPx)}</td>
                  <td className="num" style={cellStyle}>{o.sz}</td>
                  <td className="num" style={{ ...cellStyle, color: '#808080' }}>
                    {filled > 0 ? `${filled.toFixed(4)}/${o.origSz}` : '\u2014'}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center', fontSize: 9, color: '#808080' }}>
                    {o.reduceOnly && 'R '}
                    {o.isTrigger && 'T '}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <button
                      className="btn"
                      onClick={() => onCancel(o)}
                      disabled={!!cancelling[o.oid]}
                      style={{ fontSize: 10, minWidth: 'auto', padding: '1px 6px' }}
                    >
                      {cancelling[o.oid] ? '...' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {openOrders.length === 0 && !loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                  No open orders
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '3px 6px',
  fontWeight: 700,
  fontSize: 10,
  borderBottom: '1px solid var(--bevel-dark-1)',
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  padding: '2px 6px',
  whiteSpace: 'nowrap',
};
