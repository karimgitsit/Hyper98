'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import type { WalletClient } from 'viem';
import { useUserStore, type Position } from '@/stores/userStore';
import { usePriceStore, type MarketRow } from '@/stores/priceStore';
import { useDexStore, type DexAsset } from '@/stores/dexStore';
import { useOrderBookStore } from '@/stores/orderBookStore';
import { useOrdersStore, type OpenOrder } from '@/stores/ordersStore';
import {
  placeOrder,
  placeOrderViaAgent,
  placeOrders,
  placeOrdersViaAgent,
  cancelOrders,
  cancelOrdersViaAgent,
  buildLimitEntry,
  buildTriggerEntry,
  submitOrderWithBuilderFeeRetry,
  marketPrice,
  roundPrice,
  builderFeeUsd,
  baseFeeUsd,
  updateLeverage,
  updateLeverageViaAgent,
  type PlaceOrderInput,
  type OrderEntry,
} from '@/lib/hyperliquid/orders';
import { computeCloseSize, type CloseSizeSelection } from '@/lib/hyperliquid/closeSize';
import {
  triggerPxFromRoePct,
  roePctFromTriggerPx,
  isTriggerOnCorrectSide,
} from '@/lib/hyperliquid/tpsl';
import { ensureAgentKey, getStoredAgentKey } from '@/lib/hyperliquid/agent';
import { playOrderFill, playOrderReject } from '@/lib/sounds/orderOutcome';
import { playSound } from '@/lib/sounds/SoundManager';
import { Dialog } from '@/components/ui/Dialog';
import { RightClickMenu, type RightClickMenuItem } from '@/components/ui/RightClickMenu';
import { LeverageDialog } from '@/components/ui/LeverageDialog';
import { MarginModeDialog, type MarginMode } from '@/components/ui/MarginModeDialog';
import { TpslRow } from '@/components/ui/TpslRow';
import { reconstructClosedPositions, type ClosedPosition } from '@/lib/hyperliquid/closedPositions';
import { useArrowKeyListNav } from '@/hooks/useArrowKeyListNav';

function formatPx(n: number): string {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1_000_000) return sign + '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return sign + '$' + (n / 1_000).toFixed(1) + 'K';
  return sign + '$' + n.toFixed(2);
}

function formatPct(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}

function formatRoePct(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

/**
 * Detect the resting TP/SL bracket legs for a position. HL's
 * `frontendOpenOrders` exposes the bracket as plain trigger orders on
 * the asset, with `orderType` carrying "Take Profit ..." or "Stop ..."
 * and `reduceOnly: true`. We pick the first match per kind — a
 * well-formed bracket has at most one TP and one SL on the position.
 */
interface PositionBrackets {
  tp?: { px: number; oid: number };
  sl?: { px: number; oid: number };
}

/**
 * Normalized view of an asset's metadata, sourced from priceStore (main
 * dex) or dexStore (HIP-3). Lets close / TP-SL / leverage code in
 * PositionsApp work on either kind of position without branching.
 */
interface PositionMarketView {
  coin: string;
  assetIndex: number;
  szDecimals: number;
  markPx: number;
  maxLeverage: number;
  funding: number;
}

function asMarketView(m: MarketRow | undefined): PositionMarketView | undefined {
  if (!m) return undefined;
  return {
    coin: m.coin,
    assetIndex: m.assetIndex,
    szDecimals: m.szDecimals,
    markPx: m.markPx,
    maxLeverage: m.maxLeverage,
    funding: m.funding,
  };
}

function asHip3MarketView(a: DexAsset | undefined): PositionMarketView | undefined {
  if (!a) return undefined;
  return {
    coin: a.coin,
    assetIndex: a.assetIndex,
    szDecimals: a.szDecimals,
    markPx: a.markPx,
    maxLeverage: a.maxLeverage,
    funding: a.funding,
  };
}

/**
 * Resolve the right market metadata for a position. Picks priceStore
 * for main-dex positions and dexStore for HIP-3 positions (`p.dex` is
 * the dex name; falls back to coin-prefix split for legacy callers).
 */
function usePositionMarket(p: Position): PositionMarketView | undefined {
  const mainMarket = usePriceStore((s) => (p.dex ? undefined : s.getMarket(p.coin)));
  const hip3Asset = useDexStore((s) =>
    p.dex ? s.assetsByDex[p.dex]?.find((a) => a.coin === p.coin) : undefined,
  );
  if (p.dex) return asHip3MarketView(hip3Asset);
  return asMarketView(mainMarket);
}

function findPositionBrackets(openOrders: OpenOrder[], position: Position): PositionBrackets {
  const expectSide = position.szi > 0 ? 'sell' : 'buy';
  const out: PositionBrackets = {};
  for (const o of openOrders) {
    if (o.coin !== position.coin) continue;
    if (!o.isTrigger) continue;
    if (!o.reduceOnly) continue;
    if (o.side !== expectSide) continue;
    if (o.triggerPx === null) continue;
    if (o.orderType.startsWith('Take Profit')) {
      if (!out.tp) out.tp = { px: o.triggerPx, oid: o.oid };
    } else if (o.orderType.startsWith('Stop')) {
      if (!out.sl) out.sl = { px: o.triggerPx, oid: o.oid };
    }
  }
  return out;
}

type PositionsTab = 'open' | 'closed' | 'balances';

export function PositionsApp({ windowId: _windowId }: { windowId: string }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const positions = useUserStore((s) => s.positions);
  const marginSummary = useUserStore((s) => s.marginSummary);
  const spotBalances = useUserStore((s) => s.spotBalances);
  const loading = useUserStore((s) => s.loading);
  const error = useUserStore((s) => s.error);
  const fetchUserState = useUserStore((s) => s.fetchUserState);

  // Open orders — needed for the M2.4 TP/SL columns + "Set TP/SL"
  // dialog's existing-bracket detection. Polled here at the parent so
  // the per-row work is just a filter + memo.
  const openOrders = useOrdersStore((s) => s.openOrders);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  // Fills feed the Closed tab — reconstructed into position cycles.
  // Polled at the same cadence as FillsApp; the store's debounce
  // dedupes when both windows are open.
  const fills = useOrdersStore((s) => s.fills);
  const fillsLoading = useOrdersStore((s) => s.loadingFills);
  const fillsError = useOrdersStore((s) => s.errorFills);
  const fetchFills = useOrdersStore((s) => s.fetchFills);

  const fetchMarkets = usePriceStore((s) => s.fetchMarkets);
  const fetchDexAssets = useDexStore((s) => s.fetchDexAssets);
  const fetchDexes = useDexStore((s) => s.fetchDexes);

  useEffect(() => {
    if (!address) return;
    fetchUserState(address);
    fetchOpenOrders(address);
    fetchFills(address);
    fetchMarkets();
    fetchDexes();
    const t = setInterval(() => {
      fetchUserState(address);
      fetchOpenOrders(address);
      fetchFills(address);
    }, 10_000);
    return () => clearInterval(t);
  }, [address, fetchUserState, fetchOpenOrders, fetchFills, fetchMarkets, fetchDexes]);

  const closedPositions = useMemo(() => reconstructClosedPositions(fills), [fills]);

  const [tab, setTab] = useState<PositionsTab>('open');
  const [selected, setSelected] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const focusScroller = () => scrollerRef.current?.focus({ preventScroll: true });

  const openNav = useArrowKeyListNav<Position>({
    items: positions,
    getId: (p) => p.coin,
    selectedId: tab === 'open' ? selected : null,
    setSelectedId: setSelected,
  });
  const closedNav = useArrowKeyListNav<ClosedPosition>({
    items: closedPositions,
    getId: (c) => c.id,
    selectedId: tab === 'closed' ? selected : null,
    setSelectedId: setSelected,
  });
  const nav = tab === 'open' ? openNav : closedNav;

  function switchTab(next: PositionsTab) {
    if (next === tab) return;
    setTab(next);
    setSelected(null);
  }

  // For each unique HIP-3 dex represented in `positions`, load its
  // asset universe so the per-row market lookups (mark px, szDecimals,
  // funding, maxLeverage) resolve. Refresh on the same 10s cadence as
  // user state.
  useEffect(() => {
    if (!address) return;
    const hip3Dexes = new Set(positions.map((p) => p.dex).filter((d) => !!d));
    if (hip3Dexes.size === 0) return;
    const tick = () => hip3Dexes.forEach((d) => void fetchDexAssets(d));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [address, positions, fetchDexAssets]);

  const [closeAllOpen, setCloseAllOpen] = useState(false);
  const [closeAllError, setCloseAllError] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#808080', fontSize: 11 }}>
        Connect wallet to view positions.
        <br />
        <span style={{ fontSize: 10 }}>Start &rarr; Wallet</span>
      </div>
    );
  }

  const activeError = tab === 'open' ? error : fillsError;
  const activeLoading = tab === 'open' ? loading : fillsLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Summary + toolbar bar */}
      <div style={{
        padding: '4px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 10,
        borderBottom: '1px solid var(--bevel-dark-1)',
      }}>
        {marginSummary && (
          <>
            <span>Account: <b className="mono">${marginSummary.accountValue.toFixed(2)}</b></span>
            <span>Margin: <b className="mono">${marginSummary.totalMarginUsed.toFixed(2)}</b></span>
          </>
        )}
        <span style={{ color: '#808080' }}>
          {tab === 'open'
            ? `${positions.length} position${positions.length !== 1 ? 's' : ''}`
            : tab === 'closed'
              ? `${closedPositions.length} closed`
              : `${spotBalances.length} balance${spotBalances.length !== 1 ? 's' : ''}`}
          {activeLoading && ' · loading...'}
        </span>
        <button
          className="btn"
          onClick={() => setCloseAllOpen(true)}
          disabled={positions.length === 0}
          style={{ marginLeft: 'auto', fontSize: 10, minWidth: 'auto', padding: '2px 8px', color: positions.length > 0 ? 'var(--w98-red)' : undefined }}
          title="Close every open position"
        >
          Close All
        </button>
      </div>

      <div style={{ padding: '4px 6px 0' }}>
        <div className="tabs" style={{ margin: 0 }}>
          <div
            className={`tab ${tab === 'open' ? 'active' : ''}`}
            onClick={() => switchTab('open')}
          >
            Open
          </div>
          <div
            className={`tab ${tab === 'closed' ? 'active' : ''}`}
            onClick={() => switchTab('closed')}
          >
            Closed
          </div>
          <div
            className={`tab ${tab === 'balances' ? 'active' : ''}`}
            onClick={() => switchTab('balances')}
          >
            Balances
          </div>
        </div>
      </div>

      {activeError && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>
          Error: {activeError}
        </div>
      )}

      {/* Table */}
      <div
        ref={scrollerRef}
        className="sunken"
        style={{ flex: 1, margin: '0 4px 4px', overflow: 'auto', outline: 'none' }}
        tabIndex={0}
        onKeyDown={nav.onKeyDown}
      >
        {tab === 'open' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Coin</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Entry</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Value</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>uPnL</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>ROE</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Liq. Px</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Lev</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Margin</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Funding</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TP</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>SL</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Close</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow
                  key={p.coin}
                  position={p}
                  address={address}
                  walletClient={walletClient}
                  openOrders={openOrders}
                  selected={selected === p.coin}
                  onSelect={() => { setSelected(p.coin); focusScroller(); }}
                  rowRef={openNav.setRowRef(p.coin)}
                />
              ))}
              {positions.length === 0 && !loading && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                    No open positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : tab === 'closed' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Coin</th>
                <th style={thStyle}>Side</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Entry</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Exit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>PnL</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Fees</th>
                <th style={thStyle}>Opened</th>
                <th style={thStyle}>Closed</th>
              </tr>
            </thead>
            <tbody>
              {closedPositions.map((c) => (
                <ClosedPositionRow
                  key={c.id}
                  closed={c}
                  selected={selected === c.id}
                  onSelect={() => { setSelected(c.id); focusScroller(); }}
                  rowRef={closedNav.setRowRef(c.id)}
                />
              ))}
              {closedPositions.length === 0 && !fillsLoading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                    No closed positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Coin</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Available</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>On Hold</th>
              </tr>
            </thead>
            <tbody>
              {spotBalances.map((b) => (
                <tr key={`spot-${b.coin}`}>
                  <td style={{ padding: '2px 6px', fontWeight: 700 }}>{b.coin}</td>
                  <td className="num" style={{ padding: '2px 6px' }}>{b.total.toFixed(4)}</td>
                  <td className="num" style={{ padding: '2px 6px' }}>{(b.total - b.hold).toFixed(4)}</td>
                  <td className="num" style={{ padding: '2px 6px' }}>{b.hold.toFixed(4)}</td>
                </tr>
              ))}
              {spotBalances.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                    No balances
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {closeAllOpen && (
        <CloseAllDialog
          positions={positions}
          walletClient={walletClient}
          address={address}
          onClose={() => setCloseAllOpen(false)}
          onError={setCloseAllError}
        />
      )}

      {closeAllError && (
        <Dialog
          title="Close All failed"
          icon="error"
          body={closeAllError}
          onClose={() => setCloseAllError(null)}
          buttons={[
            { label: 'OK', primary: true, autoFocus: true, onClick: () => setCloseAllError(null) },
          ]}
        />
      )}
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

interface PositionRowProps {
  position: Position;
  address: `0x${string}` | undefined;
  walletClient: WalletClient | undefined;
  openOrders: OpenOrder[];
  selected: boolean;
  onSelect: () => void;
  rowRef?: (el: HTMLTableRowElement | null) => void;
}

function PositionRow({
  position: p,
  address,
  walletClient,
  openOrders,
  selected,
  onSelect,
  rowRef,
}: PositionRowProps) {
  const sideClass = selected ? '' : p.szi > 0 ? 'green' : 'red';
  const pnlClass = selected ? '' : p.unrealizedPnl >= 0 ? 'green' : 'red';
  const side = p.szi > 0 ? 'LONG' : 'SHORT';

  // Per-asset funding rate (per-hour). Sourced from dexStore for HIP-3
  // positions, priceStore otherwise. Positive funding = longs pay shorts.
  const market = usePositionMarket(p);
  const fundingPct = market ? market.funding * 100 : null;

  const brackets = useMemo(() => findPositionBrackets(openOrders, p), [openOrders, p]);

  // Dialog state. Each is independent — multiple can never be open
  // simultaneously by construction (right-click menu closes itself
  // before invoking onClick).
  const [marketDialogOpen, setMarketDialogOpen] = useState(false);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [tpslDialogOpen, setTpslDialogOpen] = useState(false);
  const [leverageDialogOpen, setLeverageDialogOpen] = useState(false);
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Reduce-50% one-click flow — right-click *is* the confirm step, so
  // we go straight to submitting a market-close at exactly 50% of the
  // current absolute size. Errors land in the same row error dialog as
  // the M2.1 confirm path.
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  async function reduceFifty() {
    if (!market) {
      setCloseError(`Market data not found for ${p.coin}`);
      return;
    }
    const positionAbsSize = Math.abs(p.szi);
    const sizeStr = computeCloseSize(positionAbsSize, { kind: 'pct', pct: 50 }, market.szDecimals);
    if (!sizeStr || parseFloat(sizeStr) <= 0) {
      setCloseError('Position size too small to halve at this asset precision.');
      return;
    }
    setClosing(true);
    try {
      const isBuy = p.szi < 0;
      const px = roundPrice(marketPrice(market.markPx, isBuy), market.szDecimals);
      const orderInput: PlaceOrderInput = {
        asset: market.assetIndex,
        isBuy,
        price: px,
        size: sizeStr,
        reduceOnly: true,
        orderType: 'market',
        tif: 'Ioc',
      };
      await submitClose({ walletClient, address, orderInput });
      // M3.5 — reduce-only market IOC. A successful resolve means
      // submitOrderWithBuilderFeeRetry didn't surface a per-leg error,
      // so the close hit the book; mark with the fill chime. Errors
      // route to the catch and chord.
      playOrderFill();
      if (address) {
        fetchUserState(address);
        fetchOpenOrders(address);
      }
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : 'Close failed');
      playOrderReject();
    } finally {
      setClosing(false);
    }
  }

  async function handleLeverageConfirm(newLev: number) {
    if (!market) throw new Error(`Market data not found for ${p.coin}`);
    const isCross = p.leverageType === 'cross';
    const agentKey = address ? getStoredAgentKey(address) : null;
    if (agentKey) {
      await updateLeverageViaAgent(agentKey, market.assetIndex, newLev, isCross);
    } else if (walletClient) {
      await updateLeverage(walletClient, market.assetIndex, newLev, isCross);
    } else {
      throw new Error('Wallet not connected');
    }
    if (address) fetchUserState(address);
  }

  async function handleMarginModeConfirm(mode: MarginMode) {
    if (!market) throw new Error(`Market data not found for ${p.coin}`);
    const wantsCross = mode === 'cross';
    const agentKey = address ? getStoredAgentKey(address) : null;
    if (agentKey) {
      await updateLeverageViaAgent(agentKey, market.assetIndex, p.leverage, wantsCross);
    } else if (walletClient) {
      await updateLeverage(walletClient, market.assetIndex, p.leverage, wantsCross);
    } else {
      throw new Error('Wallet not connected');
    }
    if (address) fetchUserState(address);
  }

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    onSelect();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }

  // Right-click menu items — order matches HL's UI: close actions
  // first, then leverage/margin, then the one-click Reduce 50%.
  // Accelerator (`&`) marks a unique first-letter shortcut.
  // Re-allocated every render — that's intentional. `reduceFifty`
  // closes over `market`/`walletClient`/`address` which can change
  // independently of `closing`; freezing the array via useMemo would
  // capture stale closures. The ContextMenu only mounts while the
  // menu is open (a brief right-click interaction), so the doc-
  // listener rebind churn is negligible.
  const menuItems: RightClickMenuItem[] = [
    { label: '&Market Close', onClick: () => setMarketDialogOpen(true), disabled: closing },
    { label: '&Limit Close…', onClick: () => setLimitDialogOpen(true), disabled: closing },
    { label: '&Set TP/SL…', onClick: () => setTpslDialogOpen(true), disabled: closing },
    { separator: true, label: '' },
    { label: 'Adjust Le&verage…', onClick: () => setLeverageDialogOpen(true), disabled: closing },
    { label: '&Adjust Margin…', onClick: () => setMarginDialogOpen(true), disabled: closing },
    { separator: true, label: '' },
    { label: 'Reduce 5&0%', onClick: () => void reduceFifty(), disabled: closing },
  ];

  const rowSelectedStyle: React.CSSProperties = selected
    ? { background: 'var(--w98-titlebar-active-start)', color: 'var(--w98-white)' }
    : {};

  return (
    <>
      <tr
        ref={rowRef}
        style={{ cursor: 'default', ...rowSelectedStyle }}
        onClick={onSelect}
        onContextMenu={openMenu}
      >
        <td style={{ padding: '2px 6px' }}>
          <span style={{ fontWeight: 700 }}>{p.coin}</span>
          {' '}
          <span className={sideClass} style={{ fontSize: 9 }}>{side}</span>
        </td>
        <td className="num" style={{ padding: '2px 6px' }}>{Math.abs(p.szi).toFixed(4)}</td>
        <td className="num" style={{ padding: '2px 6px' }}>{formatPx(p.entryPx)}</td>
        <td className="num" style={{ padding: '2px 6px' }}>${p.positionValue.toFixed(2)}</td>
        <td className={`num ${pnlClass}`} style={{ padding: '2px 6px' }}>{formatUsd(p.unrealizedPnl)}</td>
        <td className={`num ${pnlClass}`} style={{ padding: '2px 6px' }}>{formatPct(p.returnOnEquity)}</td>
        <td className="num" style={{ padding: '2px 6px' }}>
          {p.liquidationPx !== null ? formatPx(p.liquidationPx) : '—'}
        </td>
        <td className="num" style={{ padding: '2px 6px', textAlign: 'center' }}>
          {p.leverage}x {p.leverageType === 'isolated' ? 'I' : 'C'}
        </td>
        <td className="num" style={{ padding: '2px 6px' }}>
          ${p.marginUsed.toFixed(2)}
        </td>
        <td
          className={`num ${selected ? '' : fundingPct !== null ? (fundingPct >= 0 ? 'green' : 'red') : ''}`}
          style={{ padding: '2px 6px' }}
          title="Hourly funding rate. Positive = longs pay shorts."
        >
          {fundingPct === null ? '—' : (fundingPct >= 0 ? '+' : '') + fundingPct.toFixed(4) + '%'}
        </td>
        <td className="num" style={{ padding: '2px 6px' }}>
          {brackets.tp ? formatPx(brackets.tp.px) : '—'}
        </td>
        <td className="num" style={{ padding: '2px 6px' }}>
          {brackets.sl ? formatPx(brackets.sl.px) : '—'}
        </td>
        <td style={{ padding: '2px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <button
            className="btn"
            style={{ fontSize: 9, padding: '1px 6px', color: 'var(--w98-red)', cursor: 'pointer' }}
            disabled={closing}
            onClick={() => setMarketDialogOpen(true)}
          >
            {closing ? 'Closing...' : 'Market'}
          </button>
          {' '}
          <button
            className="btn"
            style={{ fontSize: 9, padding: '1px 6px', cursor: 'pointer' }}
            disabled={closing}
            onClick={() => setLimitDialogOpen(true)}
          >
            Limit...
          </button>
        </td>
      </tr>

      {menuPos && (
        <RightClickMenu
          x={menuPos.x}
          y={menuPos.y}
          items={menuItems}
          onClose={() => setMenuPos(null)}
        />
      )}

      {marketDialogOpen && (
        <MarketCloseDialog
          position={p}
          walletClient={walletClient}
          address={address}
          onSubmittingChange={setClosing}
          onError={setCloseError}
          onClose={() => setMarketDialogOpen(false)}
        />
      )}

      {limitDialogOpen && (
        <LimitCloseDialog
          position={p}
          walletClient={walletClient}
          address={address}
          onSubmittingChange={setClosing}
          onError={setCloseError}
          onClose={() => setLimitDialogOpen(false)}
        />
      )}

      {tpslDialogOpen && (
        <TpslPositionDialog
          position={p}
          brackets={brackets}
          walletClient={walletClient}
          address={address}
          onError={setCloseError}
          onClose={() => setTpslDialogOpen(false)}
        />
      )}

      {leverageDialogOpen && market && (
        <LeverageDialog
          coin={p.coin}
          maxLeverage={market.maxLeverage}
          current={p.leverage}
          onConfirm={handleLeverageConfirm}
          onClose={() => setLeverageDialogOpen(false)}
        />
      )}

      {marginDialogOpen && market && (
        <MarginModeDialog
          coin={p.coin}
          current={p.leverageType}
          hasOpenPosition={true}
          onConfirm={handleMarginModeConfirm}
          onClose={() => setMarginDialogOpen(false)}
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

/* ============================================================
   Close-size selector — shared between Market & Limit dialogs.
   ============================================================ */

interface CloseSizeSelectorProps {
  positionAbsSize: number;
  coin: string;
  szDecimals: number;
  selection: CloseSizeSelection;
  onChange: (s: CloseSizeSelection) => void;
}

function CloseSizeSelector({
  positionAbsSize,
  coin,
  szDecimals,
  selection,
  onChange,
}: CloseSizeSelectorProps) {
  const [customInput, setCustomInput] = useState<string>(
    selection.kind === 'custom' ? String(selection.size) : '',
  );

  const presets: Array<{ pct: number; label: string }> = [
    { pct: 25, label: '25%' },
    { pct: 50, label: '50%' },
    { pct: 75, label: '75%' },
    { pct: 100, label: '100%' },
  ];

  function pickPreset(pct: number) {
    setCustomInput('');
    onChange({ kind: 'pct', pct });
  }

  function onCustomChange(raw: string) {
    setCustomInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      onChange({ kind: 'custom', size: 0 });
      return;
    }
    onChange({ kind: 'custom', size: n });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {presets.map((preset) => {
          const pressed = selection.kind === 'pct' && selection.pct === preset.pct;
          return (
            <button
              key={preset.pct}
              type="button"
              className={`btn ${pressed ? 'pressed' : ''}`}
              onClick={() => pickPreset(preset.pct)}
              style={{ flex: 1, fontSize: 11 }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <span style={{ color: '#808080', minWidth: 44 }}>Custom</span>
        <input
          className="input mono"
          value={customInput}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={szDecimals > 0 ? `0.${'0'.repeat(szDecimals)}` : '0'}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span style={{ color: '#808080' }}>{coin}</span>
      </div>
      <div style={{ fontSize: 11, color: '#808080' }}>
        Position: <span className="mono">{positionAbsSize.toFixed(szDecimals)} {coin}</span>
      </div>
    </div>
  );
}

/* ============================================================
   Market close dialog (M2.1)
   ============================================================ */

interface CloseDialogProps {
  position: Position;
  walletClient: WalletClient | undefined;
  address: `0x${string}` | undefined;
  onSubmittingChange: (b: boolean) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

export function MarketCloseDialog({
  position: p,
  walletClient,
  address,
  onSubmittingChange,
  onError,
  onClose,
}: CloseDialogProps) {
  const market = usePositionMarket(p);
  const szDecimals = market?.szDecimals ?? 4;
  const positionAbsSize = Math.abs(p.szi);
  const [selection, setSelection] = useState<CloseSizeSelection>({ kind: 'pct', pct: 100 });

  const closeSizeStr = computeCloseSize(positionAbsSize, selection, szDecimals);
  const closeSizeNum = closeSizeStr ? parseFloat(closeSizeStr) : 0;
  const markPx = market?.markPx ?? 0;
  const notional = closeSizeNum * markPx;
  const canConfirm = closeSizeNum > 0 && market !== undefined;

  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  async function handleConfirm() {
    if (!market) {
      onError(`Market data not found for ${p.coin}`);
      onClose();
      return;
    }
    if (!closeSizeStr || closeSizeNum <= 0) return;
    onClose();
    onSubmittingChange(true);
    try {
      const isBuy = p.szi < 0;
      const px = roundPrice(marketPrice(market.markPx, isBuy), szDecimals);
      const orderInput: PlaceOrderInput = {
        asset: market.assetIndex,
        isBuy,
        price: px,
        size: closeSizeStr,
        reduceOnly: true,
        orderType: 'market',
        tif: 'Ioc',
      };
      await submitClose({ walletClient, address, orderInput });
      // M3.5 — market-IOC close: chimes on success, chord on reject.
      playOrderFill();
      if (address) {
        fetchUserState(address);
        fetchOpenOrders(address);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Close failed');
      playOrderReject();
    } finally {
      onSubmittingChange(false);
    }
  }

  const sideVerb = p.szi > 0 ? 'sell' : 'buy';

  return (
    <Dialog
      title="Close position"
      onClose={onClose}
      body={
        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            Market-close <b>{p.coin}</b> {p.szi > 0 ? 'long' : 'short'} at the current price.
          </div>
          <CloseSizeSelector
            positionAbsSize={positionAbsSize}
            coin={p.coin}
            szDecimals={szDecimals}
            selection={selection}
            onChange={setSelection}
          />
          <div className="fieldset">
            <div className="fieldset-legend">Order</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5, columnGap: 16, fontSize: 11 }}>
              <span style={{ color: '#808080' }}>Action</span>
              <span className="mono">{sideVerb} {closeSizeStr || '—'} {p.coin}</span>
              <span style={{ color: '#808080' }}>Mark Price</span>
              <span className="mono">{markPx > 0 ? `$${formatPx(markPx)}` : '—'}</span>
              <span style={{ color: '#808080' }}>Notional</span>
              <span className="mono">{notional > 0 ? `$${notional.toFixed(2)}` : '—'}</span>
              <span style={{ color: '#808080' }}>Reduce-only</span>
              <span className="mono">Yes</span>
            </div>
          </div>
        </div>
      }
      buttons={[
        { label: 'Cancel', onClick: onClose, autoFocus: false },
        {
          label: 'Close Position',
          primary: true,
          autoFocus: true,
          onClick: () => {
            if (!canConfirm) return;
            void handleConfirm();
          },
        },
      ]}
    />
  );
}

/* ============================================================
   Limit close dialog (M2.2)
   ============================================================ */

export function LimitCloseDialog({
  position: p,
  walletClient,
  address,
  onSubmittingChange,
  onError,
  onClose,
}: CloseDialogProps) {
  const market = usePositionMarket(p);
  const szDecimals = market?.szDecimals ?? 4;
  const positionAbsSize = Math.abs(p.szi);

  const book = useOrderBookStore((s) => s.books[p.coin]);
  const subscribeBook = useOrderBookStore((s) => s.subscribe);
  const unsubscribeBook = useOrderBookStore((s) => s.unsubscribe);
  useEffect(() => {
    subscribeBook(p.coin);
    return () => unsubscribeBook(p.coin);
  }, [p.coin, subscribeBook, unsubscribeBook]);

  const bestBid = book?.bids[0]?.px;
  const bestAsk = book?.asks[0]?.px;
  const mid = useMemo(() => {
    if (bestBid === undefined || bestAsk === undefined) return undefined;
    return (bestBid + bestAsk) / 2;
  }, [bestBid, bestAsk]);

  const [selection, setSelection] = useState<CloseSizeSelection>({ kind: 'pct', pct: 100 });
  const [priceInput, setPriceInput] = useState<string>('');

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (mid !== undefined && market) {
      setPriceInput(roundPrice(mid, szDecimals));
      seededRef.current = true;
    }
  }, [mid, market, szDecimals]);

  function applyPricePill(px: number | undefined) {
    if (px === undefined || !market) return;
    setPriceInput(roundPrice(px, szDecimals));
    seededRef.current = true;
  }

  const closeSizeStr = computeCloseSize(positionAbsSize, selection, szDecimals);
  const closeSizeNum = closeSizeStr ? parseFloat(closeSizeStr) : 0;
  const priceNum = parseFloat(priceInput);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;
  const notional = priceValid ? closeSizeNum * priceNum : 0;
  const canConfirm = closeSizeNum > 0 && priceValid && market !== undefined;

  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  async function handleConfirm() {
    if (!market) {
      onError(`Market data not found for ${p.coin}`);
      onClose();
      return;
    }
    if (!closeSizeStr || closeSizeNum <= 0 || !priceValid) return;
    onClose();
    onSubmittingChange(true);
    try {
      const isBuy = p.szi < 0;
      const px = roundPrice(priceNum, szDecimals);
      const orderInput: PlaceOrderInput = {
        asset: market.assetIndex,
        isBuy,
        price: px,
        size: closeSizeStr,
        reduceOnly: true,
        orderType: 'limit',
        tif: 'Gtc',
      };
      await submitClose({ walletClient, address, orderInput });
      // M3.5 — limit GTC close lands on the book rather than filling
      // immediately. `ding` marks the resting acknowledgement vs.
      // `chimes` used for the IOC market-close.
      playSound('ding');
      if (address) {
        fetchUserState(address);
        fetchOpenOrders(address);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Close failed');
      playOrderReject();
    } finally {
      onSubmittingChange(false);
    }
  }

  const sideVerb = p.szi > 0 ? 'sell' : 'buy';

  return (
    <Dialog
      title="Limit close"
      icon="info"
      onClose={onClose}
      body={
        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320 }}>
          <div>
            Place a reduce-only GTC limit order to close the {p.szi > 0 ? 'long' : 'short'} on <b>{p.coin}</b>.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#808080', fontSize: 11, width: 40 }}>Price</span>
            <input
              className="input mono"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                seededRef.current = true;
              }}
              placeholder={mid !== undefined ? formatPx(mid) : 'Loading book...'}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              className="pill-btn"
              onClick={() => applyPricePill(bestBid)}
              disabled={bestBid === undefined}
              title="Best bid"
            >
              Bid
            </button>
            <button
              type="button"
              className="pill-btn"
              onClick={() => applyPricePill(mid)}
              disabled={mid === undefined}
              title="Mid"
            >
              Mid
            </button>
            <button
              type="button"
              className="pill-btn"
              onClick={() => applyPricePill(bestAsk)}
              disabled={bestAsk === undefined}
              title="Best ask"
            >
              Ask
            </button>
          </div>

          <CloseSizeSelector
            positionAbsSize={positionAbsSize}
            coin={p.coin}
            szDecimals={szDecimals}
            selection={selection}
            onChange={setSelection}
          />

          <div className="fieldset">
            <div className="fieldset-legend">Order</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5, columnGap: 16, fontSize: 11 }}>
              <span style={{ color: '#808080' }}>Action</span>
              <span className="mono">{sideVerb} {closeSizeStr || '—'} {p.coin}</span>
              <span style={{ color: '#808080' }}>Limit Price</span>
              <span className="mono">{priceValid ? `$${priceInput}` : '—'}</span>
              <span style={{ color: '#808080' }}>Notional</span>
              <span className="mono">{notional > 0 ? `$${notional.toFixed(2)}` : '—'}</span>
              <span style={{ color: '#808080' }}>TIF</span>
              <span className="mono">GTC · Reduce-only</span>
            </div>
          </div>
        </div>
      }
      buttons={[
        { label: 'Cancel', onClick: onClose, autoFocus: false },
        {
          label: 'Place Order',
          primary: true,
          autoFocus: true,
          onClick: () => {
            if (!canConfirm) return;
            void handleConfirm();
          },
        },
      ]}
    />
  );
}

/* ============================================================
   Set TP/SL on existing position dialog (M2.4)

   Reuses the M1.6 TpslRow inputs anchored to the *position's* entry
   price (not the order price). Either row is optional. Existing
   bracket legs (detected via `findPositionBrackets`) pre-fill the
   inputs and are cancelled in-place before the new bracket is placed
   — two signed actions:
     1. cancel(s) of any existing TP/SL legs in one signed action
     2. order(s) carrying the new bracket with grouping=positionTpsl
   The whole thing routes through `submitOrderWithBuilderFeeRetry` so
   the builder-fee approval flow is consistent with M2.1/M2.2/M2.5.
   ============================================================ */

interface TpslPositionDialogProps {
  position: Position;
  brackets: PositionBrackets;
  walletClient: WalletClient | undefined;
  address: `0x${string}` | undefined;
  onError: (msg: string) => void;
  onClose: () => void;
}

function TpslPositionDialog({
  position: p,
  brackets,
  walletClient,
  address,
  onError,
  onClose,
}: TpslPositionDialogProps) {
  const market = usePositionMarket(p);
  const szDecimals = market?.szDecimals ?? 4;
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  const side: 'long' | 'short' = p.szi > 0 ? 'long' : 'short';
  const positionAbsSize = Math.abs(p.szi);
  const entryPx = p.entryPx;
  const leverage = p.leverage;

  // Pre-fill from existing bracket. ROE % rendered against entry +
  // current leverage so the user sees what the resting trigger means
  // in PnL terms before they edit it. Use `roundPrice` (tick-aware)
  // not `formatPx` (display-only) so an unedited submit replaces the
  // bracket at the existing price without precision drift.
  const initialTpPx = brackets.tp ? roundPrice(brackets.tp.px, szDecimals) : '';
  const initialSlPx = brackets.sl ? roundPrice(brackets.sl.px, szDecimals) : '';
  const initialTpPct = brackets.tp
    ? formatRoePct(roePctFromTriggerPx({ side, kind: 'tp', entryPx, leverage, triggerPx: brackets.tp.px }))
    : '';
  const initialSlPct = brackets.sl
    ? formatRoePct(roePctFromTriggerPx({ side, kind: 'sl', entryPx, leverage, triggerPx: brackets.sl.px }))
    : '';

  const [tpPriceInput, setTpPriceInput] = useState(initialTpPx);
  const [tpGainPctInput, setTpGainPctInput] = useState(initialTpPct);
  const [slPriceInput, setSlPriceInput] = useState(initialSlPx);
  const [slLossPctInput, setSlLossPctInput] = useState(initialSlPct);
  const [submitting, setSubmitting] = useState(false);

  // Derived parse + side-of-entry validation. Empty rows pass through
  // untouched; partially-filled rows are caught at submit by the
  // explicit validity check.
  const tpPxNum = parseFloat(tpPriceInput);
  const slPxNum = parseFloat(slPriceInput);
  const tpSet = Number.isFinite(tpPxNum) && tpPxNum > 0;
  const slSet = Number.isFinite(slPxNum) && slPxNum > 0;
  const tpValid = tpSet && isTriggerOnCorrectSide(side, 'tp', entryPx, tpPxNum);
  const slValid = slSet && isTriggerOnCorrectSide(side, 'sl', entryPx, slPxNum);
  const tpInvalid = tpSet && !tpValid;
  const slInvalid = slSet && !slValid;

  // Field handlers — typing a price re-derives ROE %, typing a % re-
  // derives price. Invalid input clears its mirror so the user isn't
  // staring at a stale paired value.
  function onTpPriceChange(raw: string) {
    setTpPriceInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setTpGainPctInput('');
      return;
    }
    setTpGainPctInput(
      formatRoePct(roePctFromTriggerPx({ side, kind: 'tp', entryPx, leverage, triggerPx: n })),
    );
  }
  function onTpGainPctChange(raw: string) {
    setTpGainPctInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setTpPriceInput('');
      return;
    }
    const px = triggerPxFromRoePct({ side, kind: 'tp', entryPx, leverage, roePct: n });
    setTpPriceInput(px > 0 ? roundPrice(px, szDecimals) : '');
  }
  function onSlPriceChange(raw: string) {
    setSlPriceInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setSlLossPctInput('');
      return;
    }
    setSlLossPctInput(
      formatRoePct(roePctFromTriggerPx({ side, kind: 'sl', entryPx, leverage, triggerPx: n })),
    );
  }
  function onSlLossPctChange(raw: string) {
    setSlLossPctInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setSlPriceInput('');
      return;
    }
    const px = triggerPxFromRoePct({ side, kind: 'sl', entryPx, leverage, roePct: n });
    setSlPriceInput(px > 0 ? roundPrice(px, szDecimals) : '');
  }

  const hasExisting = brackets.tp !== undefined || brackets.sl !== undefined;
  const anySet = tpSet || slSet;
  // Allow "clear all" via submitting empty fields when there are
  // existing brackets — that's the cancel-only path.
  const canConfirm =
    market !== undefined &&
    !submitting &&
    !tpInvalid &&
    !slInvalid &&
    (anySet || hasExisting);

  async function handleConfirm() {
    if (!market) {
      onError(`Market data not found for ${p.coin}`);
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }
      const agentKey = await ensureAgentKey(walletClient, address);

      // Step 1: cancel any existing brackets. One signed cancel action
      // covers up to 2 oids (TP + SL). Skipped if no existing legs.
      const toCancel: Array<{ asset: number; oid: number }> = [];
      if (brackets.tp) toCancel.push({ asset: market.assetIndex, oid: brackets.tp.oid });
      if (brackets.sl) toCancel.push({ asset: market.assetIndex, oid: brackets.sl.oid });
      if (toCancel.length > 0) {
        await cancelOrdersViaAgent(agentKey, toCancel);
      }

      // Step 2: place the new bracket. Side is opposite the position.
      // Reduce-only is baked into `buildTriggerEntry`.
      // `positionTpsl` grouping → HL scales the trigger size with the
      // live position so a partial fill before the trigger doesn't
      // leave the bracket hanging at a stale size.
      const newOrders: OrderEntry[] = [];
      const isBuy = side === 'short';
      // Use the post-rounding price + post-rounding side check so a
      // tick-flooring trigger doesn't slip onto entry.
      if (tpValid) {
        const tpRounded = roundPrice(tpPxNum, szDecimals);
        if (!isTriggerOnCorrectSide(side, 'tp', entryPx, parseFloat(tpRounded))) {
          throw new Error('Take Profit price rounded onto the entry price.');
        }
        newOrders.push(
          buildTriggerEntry({
            asset: market.assetIndex,
            isBuy,
            size: positionAbsSize.toFixed(szDecimals),
            triggerPx: tpRounded,
            tpsl: 'tp',
          }),
        );
      }
      if (slValid) {
        const slRounded = roundPrice(slPxNum, szDecimals);
        if (!isTriggerOnCorrectSide(side, 'sl', entryPx, parseFloat(slRounded))) {
          throw new Error('Stop Loss price rounded onto the entry price.');
        }
        newOrders.push(
          buildTriggerEntry({
            asset: market.assetIndex,
            isBuy,
            size: positionAbsSize.toFixed(szDecimals),
            triggerPx: slRounded,
            tpsl: 'sl',
          }),
        );
      }

      if (newOrders.length > 0) {
        await submitOrderWithBuilderFeeRetry({
          walletClient,
          buildAndSend: () => placeOrdersViaAgent(agentKey, newOrders, 'positionTpsl'),
        });
      }
      // M3.5 — TP/SL legs rest on the book waiting for trigger; ding
      // marks the acknowledgement. A pure cancel-only path (replacing
      // existing legs with none) also lands here and gets the ding,
      // which is the right read: "we did the thing you asked".
      playSound('ding');

      if (address) {
        fetchUserState(address);
        fetchOpenOrders(address);
      }
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Set TP/SL failed');
      playOrderReject();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={`Set TP/SL — ${p.coin}`}
      icon="info"
      onClose={submitting ? undefined : onClose}
      body={
        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 360 }}>
          <div>
            Bracket against the {side} on <b>{p.coin}</b>. Both legs are reduce-only and scale with the
            position size; either is optional.
          </div>
          <div className="fieldset" style={{ paddingTop: 4 }}>
            <div className="fieldset-legend">Anchor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: 10 }}>
              <span style={{ color: '#808080' }}>Entry</span>
              <span className="mono">${formatPx(entryPx)}</span>
              <span style={{ color: '#808080' }}>Leverage</span>
              <span className="mono">{leverage}x</span>
              <span style={{ color: '#808080' }}>Position</span>
              <span className="mono">{positionAbsSize.toFixed(szDecimals)} {p.coin}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <TpslRow
              label="TP"
              priceLabel="Price"
              pctLabel="Gain %"
              priceValue={tpPriceInput}
              pctValue={tpGainPctInput}
              bg={tpInvalid ? '#ffd0d0' : undefined}
              onPriceChange={onTpPriceChange}
              onPctChange={onTpGainPctChange}
            />
            <TpslRow
              label="SL"
              priceLabel="Price"
              pctLabel="Loss %"
              priceValue={slPriceInput}
              pctValue={slLossPctInput}
              bg={slInvalid ? '#ffd0d0' : undefined}
              onPriceChange={onSlPriceChange}
              onPctChange={onSlLossPctChange}
            />
          </div>

          {(tpInvalid || slInvalid) && (
            <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>
              {tpInvalid && (side === 'long'
                ? 'TP must be above entry for a long. '
                : 'TP must be below entry for a short. ')}
              {slInvalid && (side === 'long'
                ? 'SL must be below entry for a long.'
                : 'SL must be above entry for a short.')}
            </div>
          )}

          {hasExisting && !anySet && (
            <div style={{ fontSize: 10, color: '#808080' }}>
              Confirm with both rows blank to clear the existing bracket.
            </div>
          )}
        </div>
      }
      buttons={[
        { label: 'Cancel', onClick: onClose, autoFocus: false },
        {
          label: submitting ? 'Saving…' : (anySet ? 'Set TP/SL' : 'Clear'),
          primary: true,
          autoFocus: true,
          onClick: () => {
            if (!canConfirm) return;
            void handleConfirm();
          },
        },
      ]}
    />
  );
}

/* ============================================================
   Close All dialog (M2.5)

   SDK spike (this conversation): one signed `order` action can carry
   reduce-only orders for mixed asset indices — `orders[].a` is per-
   element with no client-side or signature-level uniformity check
   (`OrderRequest` schema in @nktkas/hyperliquid). One EIP-712 sig
   over the whole action means atomic dispatch.

   Each leg is an aggressive limit IOC at `marketPrice(markPx, isBuy,
   0.01)` — same shape the M2.1 market close uses, just batched.
   `grouping: 'na'` since we're not opening a new bracket, just
   closing N positions.
   ============================================================ */

interface CloseAllDialogProps {
  positions: Position[];
  walletClient: WalletClient | undefined;
  address: `0x${string}` | undefined;
  onClose: () => void;
  onError: (msg: string) => void;
}

interface CloseAllLeg {
  position: Position;
  market: PositionMarketView;
  sizeStr: string;
  px: string;
  notional: number;
  isBuy: boolean;
}

function CloseAllDialog({ positions, walletClient, address, onClose, onError }: CloseAllDialogProps) {
  const getMarket = usePriceStore((s) => s.getMarket);
  const assetsByDex = useDexStore((s) => s.assetsByDex);
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);
  const [submitting, setSubmitting] = useState(false);

  const legs = useMemo<CloseAllLeg[]>(() => {
    const out: CloseAllLeg[] = [];
    for (const p of positions) {
      // Resolve the market view via the dex-aware lookup — Close All
      // batches reduce-only orders across mixed dexes in one signed
      // action; the asset id (which encodes the dex for HIP-3) is what
      // tells the protocol which clearinghouse to hit.
      const market: PositionMarketView | undefined = p.dex
        ? asHip3MarketView(assetsByDex[p.dex]?.find((a) => a.coin === p.coin))
        : asMarketView(getMarket(p.coin));
      if (!market) continue;
      const positionAbsSize = Math.abs(p.szi);
      const sizeStr = computeCloseSize(positionAbsSize, { kind: 'pct', pct: 100 }, market.szDecimals);
      if (!sizeStr || parseFloat(sizeStr) <= 0) continue;
      const isBuy = p.szi < 0;
      const px = roundPrice(marketPrice(market.markPx, isBuy), market.szDecimals);
      const notional = parseFloat(sizeStr) * market.markPx;
      out.push({ position: p, market, sizeStr, px, notional, isBuy });
    }
    return out;
  }, [positions, getMarket, assetsByDex]);

  const totalNotional = legs.reduce((sum, l) => sum + l.notional, 0);
  // Close All goes via aggressive IOC = taker fee. 4.5 bps @ VIP 0.
  const totalBaseFee = baseFeeUsd(totalNotional, false);
  const totalBuilderFee = builderFeeUsd(totalNotional);
  const totalFee = totalBaseFee + totalBuilderFee;

  const skipped = positions.length - legs.length;
  const canConfirm = legs.length > 0 && !submitting;

  async function handleConfirm() {
    if (legs.length === 0) {
      onError('No closable positions found.');
      onClose();
      return;
    }
    setSubmitting(true);
    onClose();
    try {
      const orders: OrderEntry[] = legs.map((l) =>
        buildLimitEntry({
          asset: l.market.assetIndex,
          isBuy: l.isBuy,
          price: l.px,
          size: l.sizeStr,
          reduceOnly: true,
          tif: 'FrontendMarket',
        }),
      );

      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }
      const agentKey = await ensureAgentKey(walletClient, address);
      await submitOrderWithBuilderFeeRetry({
        walletClient,
        buildAndSend: () => placeOrdersViaAgent(agentKey, orders, 'na'),
      });
      // M3.5 — Close All is N reduce-only FrontendMarket legs; chimes
      // marks the bulk fill on success. Per-leg errors would have
      // rethrown out of submitOrderWithBuilderFeeRetry into the catch.
      playOrderFill();

      if (address) {
        fetchUserState(address);
        fetchOpenOrders(address);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Close All failed');
      playOrderReject();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title="Close all positions"
      icon="warn"
      onClose={submitting ? undefined : onClose}
      body={
        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 360 }}>
          <div>
            Market-close every open position in one signed action.
          </div>

          <div className="sunken" style={{ maxHeight: 180, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: 'var(--w98-bg)' }}>
                  <th style={thStyle}>Coin</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Side</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Notional</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={l.position.coin}>
                    <td style={{ padding: '2px 6px', fontWeight: 700 }}>{l.position.coin}</td>
                    <td className="num" style={{ padding: '2px 6px' }}>
                      {l.sizeStr}
                    </td>
                    <td
                      className="num"
                      style={{ padding: '2px 6px', color: l.isBuy ? 'var(--w98-green)' : 'var(--w98-red)' }}
                    >
                      {l.isBuy ? 'BUY' : 'SELL'}
                    </td>
                    <td className="num" style={{ padding: '2px 6px' }}>
                      ${l.notional.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {legs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 8, color: '#808080' }}>
                      No closable positions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="fieldset" style={{ paddingTop: 4 }}>
            <div className="fieldset-legend">Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: 10 }}>
              <span style={{ color: '#808080' }}>Positions</span>
              <span className="mono">{legs.length}</span>
              <span style={{ color: '#808080' }}>Total notional</span>
              <span className="mono">${totalNotional.toFixed(2)}</span>
              <span style={{ color: '#808080' }}>Est. taker fee</span>
              <span className="mono">${totalBaseFee.toFixed(4)}</span>
              <span style={{ color: '#808080' }}>Builder fee (5 bps)</span>
              <span className="mono">${totalBuilderFee.toFixed(4)}</span>
              <span style={{ color: '#808080' }}>Total fee preview</span>
              <span className="mono">${totalFee.toFixed(4)}</span>
              <span style={{ color: '#808080' }}>Reduce-only</span>
              <span className="mono">Yes (every leg)</span>
            </div>
          </div>

          {skipped > 0 && (
            <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>
              {skipped} position{skipped !== 1 ? 's' : ''} skipped — market metadata still loading or
              size below minimum tick.
            </div>
          )}
        </div>
      }
      buttons={[
        { label: 'Cancel', onClick: onClose, autoFocus: false },
        {
          label: submitting ? 'Closing…' : 'Close All',
          primary: true,
          autoFocus: true,
          onClick: () => {
            if (!canConfirm) return;
            void handleConfirm();
          },
        },
      ]}
    />
  );
}

/* ============================================================
   Local close-submission helper — thin wrapper around the promoted
   `submitOrderWithBuilderFeeRetry` in `lib/hyperliquid/orders.ts`
   that handles the agent / main-wallet routing for a single-order
   close path. Used by Market / Limit close + Reduce 50%. The TP/SL
   and Close All paths call `submitOrderWithBuilderFeeRetry` directly
   with their own batched closures.
   ============================================================ */

async function submitClose({
  walletClient,
  address,
  orderInput,
}: {
  walletClient: WalletClient | undefined;
  address: `0x${string}` | undefined;
  orderInput: PlaceOrderInput;
}): Promise<void> {
  if (!walletClient || !address) throw new Error('Wallet not connected');
  const agentKey = await ensureAgentKey(walletClient, address);
  await submitOrderWithBuilderFeeRetry({
    walletClient,
    buildAndSend: () => placeOrderViaAgent(agentKey, orderInput),
  });
}

/* ============================================================
   Closed-positions row — historical cycle reconstructed from
   user fills. Read-only; selection mirrors the Open tab so the
   blue selector bar moves with arrow keys.
   ============================================================ */

function formatHistTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ClosedPositionRow({
  closed: c,
  selected,
  onSelect,
  rowRef,
}: {
  closed: ClosedPosition;
  selected: boolean;
  onSelect: () => void;
  rowRef?: (el: HTMLTableRowElement | null) => void;
}) {
  const sideClass = selected ? '' : c.side === 'long' ? 'green' : 'red';
  const pnlClass = selected ? '' : c.realizedPnl >= 0 ? 'green' : 'red';
  const totalFee = c.baseFee + c.builderFee;

  const rowSelectedStyle: React.CSSProperties = selected
    ? { background: 'var(--w98-titlebar-active-start)', color: 'var(--w98-white)' }
    : {};

  return (
    <tr ref={rowRef} style={{ cursor: 'default', ...rowSelectedStyle }} onClick={onSelect}>
      <td style={{ padding: '2px 6px', fontWeight: 700 }}>{c.coin}</td>
      <td className={sideClass} style={{ padding: '2px 6px', fontSize: 10 }}>
        {c.side === 'long' ? 'LONG' : 'SHORT'}
      </td>
      <td className="num" style={{ padding: '2px 6px' }}>{c.maxSize.toFixed(4)}</td>
      <td className="num" style={{ padding: '2px 6px' }}>{formatPx(c.avgEntryPx)}</td>
      <td className="num" style={{ padding: '2px 6px' }}>{formatPx(c.avgExitPx)}</td>
      <td className={`num ${pnlClass}`} style={{ padding: '2px 6px' }}>{formatUsd(c.realizedPnl)}</td>
      <td className="num" style={{ padding: '2px 6px' }}>${totalFee.toFixed(4)}</td>
      <td className="num" style={{ padding: '2px 6px' }}>{formatHistTime(c.openedAt)}</td>
      <td className="num" style={{ padding: '2px 6px' }}>{formatHistTime(c.closedAt)}</td>
    </tr>
  );
}
