'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import type { WalletClient } from 'viem';
import { ConnectKitButton } from 'connectkit';
import { Dialog } from '@/components/ui/Dialog';
import { MarketCloseDialog, LimitCloseDialog } from './PositionsApp';
import {
  useOrdersStore,
  type OpenOrder,
  type UserFill,
  type HistoricalOrder,
  type FundingEvent,
} from '@/stores/ordersStore';
import { useUserStore, type SpotBalance, type Position } from '@/stores/userStore';
import { usePriceStore } from '@/stores/priceStore';
import { useDexStore } from '@/stores/dexStore';
import { useArrowKeyListNav } from '@/hooks/useArrowKeyListNav';
import { useCancelOrder } from '@/hooks/useCancelOrder';

type Tab = 'open' | 'positions' | 'history' | 'fills' | 'funding' | 'balances';

const TABS: { id: Tab; label: string }[] = [
  { id: 'open', label: 'Open Orders' },
  { id: 'positions', label: 'Positions' },
  { id: 'history', label: 'Order History' },
  { id: 'fills', label: 'Trade History' },
  { id: 'funding', label: 'Funding' },
  { id: 'balances', label: 'Balances' },
];

const NUM = { fontVariantNumeric: 'tabular-nums' as const };
const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '3px 6px',
  fontWeight: 700,
  fontSize: 10,
  borderBottom: '1px solid var(--bevel-dark-1)',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 11 };

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
function formatSignedUsd(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${n.toFixed(2)}`;
}

/**
 * Hyperliquid spot orders come back with raw coin names like "@151".
 * Resolve those to the human-readable pair label (e.g. "FEUSD/USDC")
 * via the spot registry; fall through unchanged for canonical perps.
 */
function useFriendlyCoin(): (coin: string) => string {
  const getSpot = usePriceStore((s) => s.getSpotMarket);
  return (coin: string) => {
    if (coin.startsWith('@')) {
      const m = getSpot(coin);
      return m?.displayName ?? coin;
    }
    return coin;
  };
}

export function MarketBottomPanel({ coin }: { coin: string }) {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>('open');
  const [coinOnly, setCoinOnly] = useState(false);

  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);
  const fetchFills = useOrdersStore((s) => s.fetchFills);
  const fetchHistory = useOrdersStore((s) => s.fetchHistory);
  const fetchFunding = useOrdersStore((s) => s.fetchFunding);
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchMarkets = usePriceStore((s) => s.fetchMarkets);
  const fetchSpotMarkets = usePriceStore((s) => s.fetchSpotMarkets);

  // Warm both perp and spot market metadata. Cancel/display lookups need
  // both: spot orders return as "@151"-style coins that only resolve via
  // the spot registry.
  useEffect(() => {
    fetchMarkets();
    fetchSpotMarkets();
  }, [fetchMarkets, fetchSpotMarkets]);

  // Always poll Open Orders; the chart overlay relies on it. Other tabs
  // fetch on activation (and refresh while visible).
  useEffect(() => {
    if (!address) return;
    fetchOpenOrders(address);
    const t = window.setInterval(() => fetchOpenOrders(address), 5_000);
    return () => window.clearInterval(t);
  }, [address, fetchOpenOrders]);

  useEffect(() => {
    if (!address) return;
    if (tab === 'fills') {
      fetchFills(address);
      const t = window.setInterval(() => fetchFills(address), 15_000);
      return () => window.clearInterval(t);
    }
    if (tab === 'history') {
      fetchHistory(address);
      const t = window.setInterval(() => fetchHistory(address), 30_000);
      return () => window.clearInterval(t);
    }
    if (tab === 'funding') {
      fetchFunding(address);
      const t = window.setInterval(() => fetchFunding(address), 30_000);
      return () => window.clearInterval(t);
    }
    if (tab === 'balances' || tab === 'positions') {
      fetchUserState(address);
      const t = window.setInterval(() => fetchUserState(address), 10_000);
      return () => window.clearInterval(t);
    }
  }, [address, tab, fetchFills, fetchHistory, fetchFunding, fetchUserState]);

  if (!isConnected) {
    return (
      <div style={{ padding: 12, textAlign: 'center', fontSize: 11 }}>
        <div style={{ color: '#606060', marginBottom: 8 }}>
          Connect your wallet to see orders, fills, funding, and balances.
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => <button className="btn primary" onClick={show}>Connect Wallet</button>}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TabBar
        tab={tab}
        setTab={setTab}
        right={
          tab === 'open' || tab === 'positions' || tab === 'history' || tab === 'fills' || tab === 'funding' ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#404040' }}>
              <input type="checkbox" checked={coinOnly} onChange={(e) => setCoinOnly(e.target.checked)} />
              {coin} only
            </label>
          ) : null
        }
        cancelAll={tab === 'open' ? <CancelAllButton /> : null}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'open' && <OpenOrdersTable filterCoin={coinOnly ? coin : undefined} />}
        {tab === 'positions' && <PositionsTable filterCoin={coinOnly ? coin : undefined} />}
        {tab === 'history' && <OrderHistoryTable filterCoin={coinOnly ? coin : undefined} />}
        {tab === 'fills' && <FillsTable filterCoin={coinOnly ? coin : undefined} />}
        {tab === 'funding' && <FundingTable filterCoin={coinOnly ? coin : undefined} />}
        {tab === 'balances' && <BalancesTable />}
      </div>
    </div>
  );
}

function TabBar({
  tab,
  setTab,
  right,
  cancelAll,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  right?: ReactNode;
  cancelAll?: ReactNode;
}) {
  // Per-tab counts for the badges.
  const openCount = useOrdersStore((s) => s.openOrders.length);
  const fillsCount = useOrdersStore((s) => s.fills.length);
  const historyCount = useOrdersStore((s) => s.history.length);
  const fundingCount = useOrdersStore((s) => s.funding.length);
  const positionsCount = useUserStore((s) => s.positions.length);
  const balancesCount = useUserStore((s) => s.spotBalances.length + (s.withdrawable > 0 ? 1 : 0));
  const counts: Record<Tab, number | undefined> = {
    open: openCount,
    positions: positionsCount || undefined,
    history: historyCount || undefined,
    fills: fillsCount || undefined,
    funding: fundingCount || undefined,
    balances: balancesCount || undefined,
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--bevel-dark-1)',
        background: 'var(--w98-bg)',
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        const c = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderRight: '1px solid var(--bevel-dark-1)',
              background: active ? 'var(--w98-bg-light)' : 'transparent',
              fontWeight: active ? 700 : 400,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
            {c != null && <span style={{ color: '#606060', marginLeft: 4 }}>({c})</span>}
          </button>
        );
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px' }}>
        {right}
        {cancelAll}
      </div>
    </div>
  );
}

function CancelAllButton() {
  const openOrders = useOrdersStore((s) => s.openOrders);
  const { cancel, cancelling } = useCancelOrder();
  const busy = Object.keys(cancelling).length > 0;
  async function onClick() {
    for (const o of openOrders) {
      // eslint-disable-next-line no-await-in-loop
      await cancel(o);
    }
  }
  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={openOrders.length === 0 || busy}
      style={{ fontSize: 10, padding: '0 8px', height: 18 }}
    >
      Cancel All
    </button>
  );
}

// ---- Reusable selectable table ------------------------------------------

function SelectableTable<T>({
  rows,
  getId,
  header,
  renderRow,
  empty,
}: {
  rows: T[];
  getId: (r: T) => string;
  header: ReactNode;
  renderRow: (
    r: T,
    state: {
      isSelected: boolean;
      mutedColor: string;
      rowProps: { ref: (el: HTMLElement | null) => void; onClick: () => void; style: React.CSSProperties };
    },
  ) => ReactNode;
  empty: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { onKeyDown, setRowRef } = useArrowKeyListNav<T>({
    items: rows,
    getId,
    selectedId: selected,
    setSelectedId: setSelected,
  });
  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ flex: 1, overflow: 'auto', outline: 'none' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {header}
        <tbody>
          {rows.map((r) => {
            const id = getId(r);
            const isSel = id === selected;
            const sel: React.CSSProperties = isSel
              ? { background: 'var(--w98-titlebar-active-start, #000080)', color: '#fff' }
              : {};
            return renderRow(r, {
              isSelected: isSel,
              mutedColor: isSel ? '#dfdfdf' : '#606060',
              rowProps: {
                ref: setRowRef(id),
                // Move focus to the scroll container so ↑/↓ work immediately
                // after clicking a row. Without this the user has to click
                // the scrollbar/background first to focus the panel.
                onClick: () => {
                  setSelected(id);
                  scrollRef.current?.focus({ preventScroll: true });
                },
                style: { cursor: 'default', ...sel },
              },
            });
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={99} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Tab tables ---------------------------------------------------------

function OpenOrdersTable({ filterCoin }: { filterCoin?: string }) {
  const allOrders = useOrdersStore((s) => s.openOrders);
  const loading = useOrdersStore((s) => s.loadingOrders);
  const error = useOrdersStore((s) => s.errorOrders);
  const friendly = useFriendlyCoin();
  // Filter against the friendly label too so "BTC only" still matches a
  // user-facing "BTC" name even if the coin field is something different.
  const orders = filterCoin
    ? allOrders.filter((o) => {
        const c = filterCoin.toUpperCase();
        return o.coin.toUpperCase() === c || friendly(o.coin).toUpperCase().startsWith(c);
      })
    : allOrders;
  const { cancel, cancelling, error: cancelError } = useCancelOrder();
  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      {cancelError && <ErrorBar text={`Cancel error: ${cancelError}`} />}
      <SelectableTable
        rows={orders}
        getId={(o) => String(o.oid)}
        empty={loading ? 'Loading…' : `No open orders${filterCoin ? ` for ${filterCoin}` : ''}`}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Time</th>
              <th style={TH}>Coin</th>
              <th style={TH}>Type</th>
              <th style={TH}>Side</th>
              <th style={{ ...TH, textAlign: 'right' }}>Price</th>
              <th style={{ ...TH, textAlign: 'right' }}>Size</th>
              <th style={{ ...TH, textAlign: 'right' }}>Filled</th>
              <th style={{ ...TH, textAlign: 'center' }}>Flags</th>
              <th style={{ ...TH, textAlign: 'center' }}></th>
            </tr>
          </thead>
        }
        renderRow={(o, { isSelected, mutedColor, rowProps }) => {
          const filled = o.origSz - o.sz;
          const sideColor = isSelected
            ? '#fff'
            : o.side === 'buy'
              ? 'var(--w98-green)'
              : 'var(--w98-red)';
          return (
            <tr key={o.oid} {...rowProps}>
              <td style={{ ...TD, ...NUM }}>{formatTime(o.timestamp)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{friendly(o.coin)}</td>
              <td style={TD}>{o.orderType}{o.tif ? ` / ${o.tif}` : ''}</td>
              <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>
                {o.side === 'buy' ? 'LONG' : 'SHORT'}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{formatPx(o.limitPx)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{o.sz}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>
                {filled > 0 ? `${filled.toFixed(4)}/${o.origSz}` : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: mutedColor }}>
                {o.reduceOnly && 'R '}
                {o.isTrigger && 'T '}
              </td>
              <td style={{ ...TD, textAlign: 'center' }}>
                <button
                  className="btn"
                  onClick={(e) => { e.stopPropagation(); cancel(o); }}
                  disabled={!!cancelling[o.oid]}
                  style={{ fontSize: 9, padding: '0 6px', height: 14 }}
                >
                  {cancelling[o.oid] ? '…' : 'Cancel'}
                </button>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}

function OrderHistoryTable({ filterCoin }: { filterCoin?: string }) {
  const all = useOrdersStore((s) => s.history);
  const loading = useOrdersStore((s) => s.loadingHistory);
  const error = useOrdersStore((s) => s.errorHistory);
  const friendly = useFriendlyCoin();
  const rows = filterCoin
    ? all.filter((o) => {
        const c = filterCoin.toUpperCase();
        return o.coin.toUpperCase() === c || friendly(o.coin).toUpperCase().startsWith(c);
      })
    : all;
  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      <SelectableTable<HistoricalOrder>
        rows={rows}
        getId={(o) => `${o.oid}-${o.statusTimestamp}`}
        empty={loading ? 'Loading…' : 'No order history'}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Time</th>
              <th style={TH}>Coin</th>
              <th style={TH}>Type</th>
              <th style={TH}>Side</th>
              <th style={{ ...TH, textAlign: 'right' }}>Price</th>
              <th style={{ ...TH, textAlign: 'right' }}>Size</th>
              <th style={TH}>Status</th>
            </tr>
          </thead>
        }
        renderRow={(o, { isSelected, rowProps }) => {
          const sideColor = isSelected
            ? '#fff'
            : o.side === 'buy'
              ? 'var(--w98-green)'
              : 'var(--w98-red)';
          const statusColor = isSelected
            ? '#fff'
            : o.status === 'filled'
              ? 'var(--w98-green)'
              : '#606060';
          return (
            <tr key={`${o.oid}-${o.statusTimestamp}`} {...rowProps}>
              <td style={{ ...TD, ...NUM }}>{formatTime(o.statusTimestamp)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{friendly(o.coin)}</td>
              <td style={TD}>{o.orderType}{o.tif ? ` / ${o.tif}` : ''}</td>
              <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>
                {o.side === 'buy' ? 'LONG' : 'SHORT'}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{formatPx(o.limitPx)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{o.origSz}</td>
              <td style={{ ...TD, color: statusColor }}>{o.status}</td>
            </tr>
          );
        }}
      />
    </>
  );
}

function FillsTable({ filterCoin }: { filterCoin?: string }) {
  const all = useOrdersStore((s) => s.fills);
  const loading = useOrdersStore((s) => s.loadingFills);
  const error = useOrdersStore((s) => s.errorFills);
  const friendly = useFriendlyCoin();
  const rows = filterCoin
    ? all.filter((f) => {
        const c = filterCoin.toUpperCase();
        return f.coin.toUpperCase() === c || friendly(f.coin).toUpperCase().startsWith(c);
      })
    : all;
  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      <SelectableTable<UserFill>
        rows={rows}
        getId={(f) => `${f.hash}-${f.oid}-${f.time}-${f.sz}`}
        empty={loading ? 'Loading…' : 'No trade history'}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Time</th>
              <th style={TH}>Coin</th>
              <th style={TH}>Dir</th>
              <th style={{ ...TH, textAlign: 'right' }}>Price</th>
              <th style={{ ...TH, textAlign: 'right' }}>Size</th>
              <th style={{ ...TH, textAlign: 'right' }}>Closed PnL</th>
              <th style={{ ...TH, textAlign: 'right' }}>Fee</th>
              <th style={{ ...TH, textAlign: 'center' }}>Role</th>
            </tr>
          </thead>
        }
        renderRow={(f, { isSelected, mutedColor, rowProps }) => {
          const pnlColor = isSelected
            ? '#fff'
            : f.closedPnl > 0
              ? 'var(--w98-green)'
              : f.closedPnl < 0
                ? 'var(--w98-red)'
                : '#606060';
          return (
            <tr key={`${f.hash}-${f.oid}-${f.time}-${f.sz}`} {...rowProps}>
              <td style={{ ...TD, ...NUM }}>{formatTime(f.time)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{friendly(f.coin)}</td>
              <td style={TD}>{f.dir}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{formatPx(f.px)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{f.sz}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: pnlColor }}>
                {f.closedPnl !== 0 ? formatSignedUsd(f.closedPnl) : '—'}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>${f.fee.toFixed(4)}</td>
              <td style={{ ...TD, textAlign: 'center', color: mutedColor }}>{f.crossed ? 'T' : 'M'}</td>
            </tr>
          );
        }}
      />
    </>
  );
}

function FundingTable({ filterCoin }: { filterCoin?: string }) {
  const all = useOrdersStore((s) => s.funding);
  const loading = useOrdersStore((s) => s.loadingFunding);
  const error = useOrdersStore((s) => s.errorFunding);
  const friendly = useFriendlyCoin();
  const rows = filterCoin
    ? all.filter((f) => {
        const c = filterCoin.toUpperCase();
        return f.coin.toUpperCase() === c || friendly(f.coin).toUpperCase().startsWith(c);
      })
    : all;
  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      <SelectableTable<FundingEvent>
        rows={rows}
        getId={(f) => `${f.hash}-${f.coin}-${f.time}`}
        empty={loading ? 'Loading…' : 'No funding history (last 7 days)'}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Time</th>
              <th style={TH}>Coin</th>
              <th style={{ ...TH, textAlign: 'right' }}>Position</th>
              <th style={{ ...TH, textAlign: 'right' }}>Rate</th>
              <th style={{ ...TH, textAlign: 'right' }}>Payment</th>
            </tr>
          </thead>
        }
        renderRow={(f, { isSelected, rowProps }) => {
          // `usdc` is signed: positive = paid TO the user (received), negative = paid out.
          const payColor = isSelected
            ? '#fff'
            : f.usdc > 0
              ? 'var(--w98-green)'
              : f.usdc < 0
                ? 'var(--w98-red)'
                : '#606060';
          return (
            <tr key={`${f.hash}-${f.coin}-${f.time}`} {...rowProps}>
              <td style={{ ...TD, ...NUM }}>{formatTime(f.time)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{friendly(f.coin)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{f.szi}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{(f.fundingRate * 100).toFixed(4)}%</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: payColor }}>{formatSignedUsd(f.usdc)}</td>
            </tr>
          );
        }}
      />
    </>
  );
}

function BalancesTable() {
  const spotBalances = useUserStore((s) => s.spotBalances);
  const withdrawable = useUserStore((s) => s.withdrawable);
  const loading = useUserStore((s) => s.loading);
  const error = useUserStore((s) => s.error);

  // Synthesize a "Perp USDC" pseudo-balance row so the perp account
  // appears alongside spot. Only render if there's something to show.
  type Row = { id: string; asset: string; total: number; avail: number; inOrders: number };
  const rows: Row[] = [];
  if (withdrawable > 0) {
    rows.push({ id: 'perp-usdc', asset: 'USDC (Perp)', total: withdrawable, avail: withdrawable, inOrders: 0 });
  }
  for (const b of spotBalances as SpotBalance[]) {
    rows.push({
      id: `spot-${b.coin}`,
      asset: b.coin,
      total: b.total,
      avail: b.total - b.hold,
      inOrders: b.hold,
    });
  }
  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      <SelectableTable<Row>
        rows={rows}
        getId={(r) => r.id}
        empty={loading ? 'Loading…' : 'No balances'}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Asset</th>
              <th style={{ ...TH, textAlign: 'right' }}>Total</th>
              <th style={{ ...TH, textAlign: 'right' }}>Available</th>
              <th style={{ ...TH, textAlign: 'right' }}>In Orders</th>
            </tr>
          </thead>
        }
        renderRow={(r, { mutedColor, rowProps }) => (
          <tr key={r.id} {...rowProps}>
            <td style={{ ...TD, fontWeight: 700 }}>{r.asset}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.total.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.avail.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>
              {r.inOrders > 0 ? r.inOrders.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
            </td>
          </tr>
        )}
      />
    </>
  );
}

function PositionsTable({ filterCoin }: { filterCoin?: string }) {
  const all = useUserStore((s) => s.positions);
  const loading = useUserStore((s) => s.loading);
  const error = useUserStore((s) => s.error);
  const friendly = useFriendlyCoin();
  const getMarket = usePriceStore((s) => s.getMarket);
  const dexAssetsByDex = useDexStore((s) => s.assetsByDex);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const rows = filterCoin
    ? all.filter((p) => {
        const c = filterCoin.toUpperCase();
        return p.coin.toUpperCase() === c || friendly(p.coin).toUpperCase().startsWith(c);
      })
    : all;

  return (
    <>
      {error && <ErrorBar text={`Error: ${error}`} />}
      <SelectableTable<Position>
        rows={rows}
        getId={(p) => `${p.dex}:${p.coin}`}
        empty={loading ? 'Loading…' : `No open positions${filterCoin ? ` for ${filterCoin}` : ''}`}
        header={
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={TH}>Coin</th>
              <th style={TH}>Side</th>
              <th style={{ ...TH, textAlign: 'right' }}>Size</th>
              <th style={{ ...TH, textAlign: 'right' }}>Entry</th>
              <th style={{ ...TH, textAlign: 'right' }}>Mark</th>
              <th style={{ ...TH, textAlign: 'right' }}>Liq.</th>
              <th style={{ ...TH, textAlign: 'right' }}>uPnL</th>
              <th style={{ ...TH, textAlign: 'right' }}>ROE</th>
              <th style={{ ...TH, textAlign: 'right' }}>Margin</th>
              <th style={{ ...TH, textAlign: 'center' }}>Lev</th>
              <th style={{ ...TH, textAlign: 'center' }}>Close</th>
            </tr>
          </thead>
        }
        renderRow={(p, { isSelected, mutedColor, rowProps }) => {
          const isLong = p.szi > 0;
          const sideColor = isSelected ? '#fff' : isLong ? 'var(--w98-green)' : 'var(--w98-red)';
          const pnlColor = isSelected
            ? '#fff'
            : p.unrealizedPnl > 0
              ? 'var(--w98-green)'
              : p.unrealizedPnl < 0
                ? 'var(--w98-red)'
                : '#606060';
          const market = p.dex
            ? dexAssetsByDex[p.dex]?.find((a) => a.coin === p.coin)
            : getMarket(p.coin);
          const markPx = market?.markPx ?? 0;
          return (
            <tr key={`${p.dex}:${p.coin}`} {...rowProps}>
              <td style={{ ...TD, fontWeight: 700 }}>{friendly(p.coin)}</td>
              <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>{isLong ? 'LONG' : 'SHORT'}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{Math.abs(p.szi)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{formatPx(p.entryPx)}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{markPx > 0 ? formatPx(markPx) : '—'}</td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>
                {p.liquidationPx ? formatPx(p.liquidationPx) : '—'}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: pnlColor }}>
                {formatSignedUsd(p.unrealizedPnl)}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right', color: pnlColor }}>
                {(p.returnOnEquity >= 0 ? '+' : '') + (p.returnOnEquity * 100).toFixed(2) + '%'}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: 'right' }}>${p.marginUsed.toFixed(2)}</td>
              <td style={{ ...TD, textAlign: 'center', color: mutedColor }}>
                {p.leverage}x {p.leverageType === 'isolated' ? 'I' : 'C'}
              </td>
              <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                <PositionCloseActions position={p} address={address} walletClient={walletClient} />
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}

function PositionCloseActions({
  position,
  address,
  walletClient,
}: {
  position: Position;
  address: `0x${string}` | undefined;
  walletClient: WalletClient | undefined;
}) {
  const [marketOpen, setMarketOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  return (
    <>
      <button
        className="btn"
        style={{ fontSize: 9, padding: '0 6px', height: 14, color: 'var(--w98-red)' }}
        disabled={closing}
        onClick={(e) => { e.stopPropagation(); setMarketOpen(true); }}
      >
        {closing ? '…' : 'Market'}
      </button>{' '}
      <button
        className="btn"
        style={{ fontSize: 9, padding: '0 6px', height: 14 }}
        disabled={closing}
        onClick={(e) => { e.stopPropagation(); setLimitOpen(true); }}
      >
        Limit…
      </button>
      {marketOpen && (
        <MarketCloseDialog
          position={position}
          walletClient={walletClient}
          address={address}
          onSubmittingChange={setClosing}
          onError={setCloseError}
          onClose={() => setMarketOpen(false)}
        />
      )}
      {limitOpen && (
        <LimitCloseDialog
          position={position}
          walletClient={walletClient}
          address={address}
          onSubmittingChange={setClosing}
          onError={setCloseError}
          onClose={() => setLimitOpen(false)}
        />
      )}
      {closeError && (
        <Dialog
          title="Close failed"
          icon="error"
          body={closeError}
          onClose={() => setCloseError(null)}
          buttons={[
            { label: 'OK', primary: true, autoFocus: true, onClick: () => setCloseError(null) },
          ]}
        />
      )}
    </>
  );
}

function ErrorBar({ text }: { text: string }) {
  return (
    <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10, flexShrink: 0 }}>{text}</div>
  );
}
