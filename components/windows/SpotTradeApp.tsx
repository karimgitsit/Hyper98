'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useWindowStore } from '@/stores/windowStore';
import { usePriceStore } from '@/stores/priceStore';
import { useOrderBookStore } from '@/stores/orderBookStore';
import { useUserStore } from '@/stores/userStore';
import {
  placeOrder,
  placeOrderViaAgent,
  approveBuilderFee,
  marketPrice,
  roundSize,
  builderFeeUsd,
  baseFeeUsd,
} from '@/lib/hyperliquid/orders';
import { ensureAgentKey, getStoredAgentKey } from '@/lib/hyperliquid/agent';
import {
  coinToUsdString,
  usdToCoinString,
  pctToInputString,
  clampPct,
  type SizeUnit,
} from '@/lib/hyperliquid/sizeUnit';
import { IS_TESTNET } from '@/lib/hyperliquid/constants';
import { playOrderOutcome, playOrderReject } from '@/lib/sounds/orderOutcome';

type Side = 'buy' | 'sell';
type OrderType = 'limit' | 'market';

const DEFAULT_COIN = 'BTC';

/**
 * Spot price rounding. Hyperliquid allows `MAX_DECIMALS - szDecimals` decimal
 * places on prices, where `MAX_DECIMALS = 8` for spot (vs 6 for perps), and
 * additionally caps the value at 5 significant figures. The shared
 * `roundPrice` in lib/hyperliquid/orders.ts uses the perp cap of 6, so we
 * recompute here for spot — passing a perp-rounded price for a spot pair
 * with low szDecimals gets rejected by the matcher with `Px is not divisible
 * by tick size`.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#tick-and-lot-size
 */
function roundSpotPrice(px: number, szDecimals: number): string {
  const maxDecimals = Math.max(0, 8 - szDecimals);
  const sigFigs = 5;
  const magnitude = Math.floor(Math.log10(Math.abs(px)));
  const decimalsBySig = Math.max(0, sigFigs - magnitude - 1);
  const decimals = Math.min(maxDecimals, decimalsBySig);
  return px.toFixed(decimals);
}

function formatPx(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
}

function formatStatus(s: unknown): string {
  if (!s) return 'Order sent.';
  if (typeof s === 'string') return s;
  if (typeof s === 'object') {
    const obj = s as { error?: string; filled?: { totalSz: string; avgPx: string; oid: number }; resting?: { oid: number } };
    if (obj.error) return obj.error;
    if (obj.filled) return `Filled ${obj.filled.totalSz} @ ${obj.filled.avgPx} (oid ${obj.filled.oid})`;
    if (obj.resting) return `Resting on book (oid ${obj.resting.oid})`;
  }
  return JSON.stringify(s);
}

export function SpotTradeApp({ windowId }: { windowId: string }) {
  const props = useWindowStore((s) => s.windows[windowId]?.props) ?? {};
  const updateProps = useWindowStore((s) => s.updateProps);
  const coin = (props.coin as string | undefined) ?? DEFAULT_COIN;

  const spotMarket = usePriceStore((s) => s.getSpotMarket(coin));
  const spotMarkets = usePriceStore((s) => s.spotMarkets);
  const fetchSpotMarkets = usePriceStore((s) => s.fetchSpotMarkets);
  const spotBalances = useUserStore((s) => s.spotBalances);
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const book = useOrderBookStore((s) => s.books[coin]);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Refresh balances whenever the trade panel mounts or the connected
  // wallet changes — gives the user a current "Available" the moment
  // they open the panel after toggling pairs.
  useEffect(() => {
    if (address) fetchUserState(address);
  }, [address, fetchUserState]);

  // Keep the spot universe populated so the coin picker has something to
  // show on first paint.
  useEffect(() => {
    if (spotMarkets.length === 0) fetchSpotMarkets();
  }, [spotMarkets.length, fetchSpotMarkets]);

  const [side, setSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  // Size unit toggle: `size` holds the user's typed string in whichever
  // unit is currently displayed; the canonical base-coin amount is
  // derived in `sizeNum` below and is what goes to the SDK.
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('coin');
  const [sizePct, setSizePct] = useState(0);
  const [sizePctInput, setSizePctInput] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  // Coin picker state — same pattern as TradeApp's perp picker.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // Auto-prefill the limit price with the current mid when switching pairs
  // or to limit type from market — same UX as TradeApp's price seed.
  const bestBid = book?.bids[0]?.px ?? 0;
  const bestAsk = book?.asks[0]?.px ?? 0;
  const midPx = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : (spotMarket?.markPx ?? 0);

  useEffect(() => {
    if (orderType === 'limit' && !price && midPx > 0 && spotMarket) {
      setPrice(roundSpotPrice(midPx, spotMarket.szDecimals));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, orderType, midPx, spotMarket?.szDecimals]);

  // Reset price when the user switches pairs so a stale figure from a
  // different asset doesn't leak through into the new market.
  useEffect(() => {
    setPrice('');
    setSize('');
    setSizePct(0);
    setSizePctInput('');
    setStatusMsg(null);
  }, [coin]);

  // Close coin picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (pickerOpen) {
      setPickerSearch('');
      setTimeout(() => pickerInputRef.current?.focus(), 0);
    }
  }, [pickerOpen]);

  const filteredSpotMarkets = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return spotMarkets;
    return spotMarkets.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.coin.toLowerCase().includes(q),
    );
  }, [spotMarkets, pickerSearch]);

  const sizeInputNum = parseFloat(size) || 0;
  const priceNum = parseFloat(price) || 0;
  const effectivePx = orderType === 'market' ? midPx : (priceNum || midPx);
  // In quote-unit mode the user is typing a USDC notional; convert to the
  // canonical base-coin amount via the effective price. Coin remains the
  // single source of truth that flows into `roundSize` / the wire payload.
  const sizeNum = sizeUnit === 'usd' && effectivePx > 0
    ? sizeInputNum / effectivePx
    : sizeInputNum;
  const notional = sizeNum * effectivePx;

  // Available balance for the active side. For buy the user spends the
  // quote token (typically USDC); for sell they spend the base token.
  // `total - hold` is the canonical "free" amount per HL semantics.
  const baseBalance = useMemo(
    () => spotBalances.find((b) => b.coin === spotMarket?.base),
    [spotBalances, spotMarket?.base],
  );
  const quoteBalance = useMemo(
    () => spotBalances.find((b) => b.coin === (spotMarket?.quote ?? 'USDC')),
    [spotBalances, spotMarket?.quote],
  );
  const availableForSide =
    side === 'buy'
      ? Math.max(0, (quoteBalance?.total ?? 0) - (quoteBalance?.hold ?? 0))
      : Math.max(0, (baseBalance?.total ?? 0) - (baseBalance?.hold ?? 0));

  // For the slider we always work in *quote* (USDC) units so the same
  // `pct → size` math handles both buy and sell. On sell, we approximate
  // the user's base-coin balance in USD via the effective price.
  const sliderUsdAvail =
    side === 'buy'
      ? availableForSide
      : availableForSide * effectivePx;

  function applySizePct(pct: number) {
    setSizePct(pct);
    if (!spotMarket || sliderUsdAvail <= 0 || effectivePx <= 0) return;
    const next = pctToInputString({
      pct,
      withdrawable: sliderUsdAvail,
      px: effectivePx,
      szDecimals: spotMarket.szDecimals,
      unit: sizeUnit,
    });
    setSize(next);
  }

  // Flip the displayed value in-place so the user keeps context. Empty /
  // zero / no entry price → just toggle the unit without rewriting.
  function toggleSizeUnit() {
    if (!spotMarket) return;
    const num = parseFloat(size);
    if (!Number.isFinite(num) || num <= 0 || effectivePx <= 0) {
      setSizeUnit((u) => (u === 'coin' ? 'usd' : 'coin'));
      return;
    }
    if (sizeUnit === 'coin') {
      setSize(coinToUsdString(num, effectivePx));
      setSizeUnit('usd');
    } else {
      setSize(usdToCoinString(num, effectivePx, spotMarket.szDecimals));
      setSizeUnit('coin');
    }
  }

  async function executeSubmit() {
    if (!walletClient || !spotMarket) return;
    if (!sizeNum || sizeNum <= 0) {
      setStatusMsg({ kind: 'err', text: 'Enter a size.' });
      playOrderReject();
      return;
    }
    if (orderType === 'limit' && (!priceNum || priceNum <= 0)) {
      setStatusMsg({ kind: 'err', text: 'Enter a limit price.' });
      playOrderReject();
      return;
    }

    setSubmitting(true);
    setStatusMsg({ kind: 'info', text: 'Preparing order...' });

    const connectedAddr = walletClient.account?.address;
    if (!connectedAddr) {
      setSubmitting(false);
      setStatusMsg({ kind: 'err', text: 'Wallet not connected.' });
      return;
    }

    let agentKey = getStoredAgentKey(connectedAddr);
    if (!agentKey) {
      setStatusMsg({
        kind: 'info',
        text: 'First trade — approve session key in wallet...',
      });
      try {
        agentKey = await ensureAgentKey(walletClient, connectedAddr);
      } catch (err) {
        setSubmitting(false);
        setStatusMsg({
          kind: 'err',
          text: err instanceof Error ? err.message : 'Session key approval failed',
        });
        return;
      }
    }

    const sendOrder = (orderInput: Parameters<typeof placeOrder>[1]) =>
      placeOrderViaAgent(agentKey!, orderInput);

    try {
      const roundedSize = roundSize(sizeNum, spotMarket.szDecimals);
      const roundedPx =
        orderType === 'market'
          ? roundSpotPrice(marketPrice(midPx, side === 'buy'), spotMarket.szDecimals)
          : roundSpotPrice(priceNum, spotMarket.szDecimals);

      const orderInput = {
        // assetIndex on SpotMarketRow is already 10000 + spotUniverseIndex
        // (HL's spot offset convention). Matches the perp `meta.universe`
        // index for perps, so the same `placeOrder` signs both kinds.
        asset: spotMarket.assetIndex,
        isBuy: side === 'buy',
        price: roundedPx,
        size: roundedSize,
        reduceOnly: false,
        orderType,
      } as const;

      setStatusMsg({ kind: 'info', text: 'Signing with agent...' });

      let res;
      try {
        res = await sendOrder(orderInput);
      } catch (err) {
        const errStr = err instanceof Error ? err.message : String(err);
        // Builder-fee approval is per-user and once-only — same recovery
        // path as TradeApp: prompt the user to approve, then retry.
        if (!/builder/i.test(errStr)) throw err;
        setStatusMsg({ kind: 'info', text: 'Builder fee not approved. Sign approval in wallet...' });
        await approveBuilderFee(walletClient, '0.05%');
        setStatusMsg({ kind: 'info', text: 'Approved. Retrying order...' });
        res = await sendOrder(orderInput);
      }

      const statuses = res?.response?.data?.statuses ?? [];
      const first: unknown = statuses[0];
      if (first && typeof first === 'object' && 'error' in first && (first as { error?: unknown }).error) {
        const errStr = String((first as { error?: unknown }).error);
        if (/builder/i.test(errStr)) {
          setStatusMsg({ kind: 'info', text: 'Builder fee not approved. Sign approval...' });
          try {
            await approveBuilderFee(walletClient, '0.05%');
            setStatusMsg({ kind: 'info', text: 'Approved. Retrying order...' });
            const retry = await sendOrder(orderInput);
            const retryStatus = retry?.response?.data?.statuses?.[0];
            setStatusMsg({ kind: 'ok', text: formatStatus(retryStatus) });
            playOrderOutcome(retryStatus);
          } catch (e) {
            setStatusMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Builder fee approval failed' });
            playOrderReject();
          }
        } else {
          setStatusMsg({ kind: 'err', text: errStr });
          playOrderReject();
        }
      } else {
        setStatusMsg({ kind: 'ok', text: formatStatus(first) });
        playOrderOutcome(first);
        // Refresh balances after a successful submit so the new "Available"
        // reflects the fill / resting hold immediately.
        if (address) void fetchUserState(address);
      }
    } catch (e) {
      setStatusMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Order failed' });
      playOrderReject();
    } finally {
      setSubmitting(false);
    }
  }

  if (!spotMarket) {
    return (
      <div style={{ padding: 8, fontSize: 11, color: '#808080' }}>
        Loading market info for {coin}...
      </div>
    );
  }

  const isMaker = orderType === 'limit';
  const baseFee = baseFeeUsd(notional, isMaker);
  const builderFee = builderFeeUsd(notional);
  const totalFee = baseFee + builderFee;

  const buyDisabled = submitting || !isConnected;
  const submitLabel = submitting
    ? 'Submitting...'
    : side === 'buy'
      ? `Buy ${spotMarket.base}`
      : `Sell ${spotMarket.base}`;
  const pairLabel = `${spotMarket.base}/${spotMarket.quote}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      {/* Header — coin picker + mark price + network. Mirrors TradeApp's
          top strip; leverage / margin pills are dropped since they don't
          apply to spot. */}
      <div
        style={{
          padding: '4px 6px',
          borderBottom: '1px solid var(--bevel-dark-1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
        }}
      >
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            className="pill-btn"
            style={{ fontWeight: 700 }}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {pairLabel} ▾
          </button>
          {pickerOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 9999,
                background: 'var(--w98-bg)',
                border: '2px solid',
                borderColor:
                  'var(--bevel-light-1) var(--bevel-dark-2) var(--bevel-dark-2) var(--bevel-light-1)',
                boxShadow: '2px 2px 4px rgba(0,0,0,0.4)',
                minWidth: 200,
                padding: 4,
              }}
            >
              <input
                ref={pickerInputRef}
                className="input"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search..."
                style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {filteredSpotMarkets.map((m) => (
                  <div
                    key={m.coin}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '3px 6px',
                      cursor: 'pointer',
                      fontSize: 11,
                      background: m.coin === coin ? '#a8c8f0' : 'transparent',
                      color: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (m.coin !== coin) (e.currentTarget as HTMLDivElement).style.background = '#d4d0c8';
                    }}
                    onMouseLeave={(e) => {
                      if (m.coin !== coin) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                    onMouseDown={() => {
                      updateProps(windowId, { coin: m.coin });
                      setPickerOpen(false);
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{m.displayName}</span>
                    <span className="mono" style={{ color: '#808080' }}>
                      {formatPx(m.markPx)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="mono" style={{ color: '#808080' }}>
          {spotMarket.markPx > 0 ? formatPx(spotMarket.markPx) : '—'}
        </span>

        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#808080' }}>
          {IS_TESTNET ? 'TESTNET' : 'MAINNET'} · SPOT
        </span>
      </div>

      {/* Buy / Sell — green/maroon Win98 buttons that visually indent
          when selected, matching the LONG/SHORT toggle on perps. */}
      <div style={{ display: 'flex', gap: 2, padding: 6 }}>
        <button
          className={`btn ${side === 'buy' ? 'btn-long pressed' : ''}`}
          onClick={() => setSide('buy')}
          style={{ flex: 1 }}
        >
          BUY
        </button>
        <button
          className={`btn ${side === 'sell' ? 'btn-short pressed' : ''}`}
          onClick={() => setSide('sell')}
          style={{ flex: 1 }}
        >
          SELL
        </button>
      </div>

      {/* Order type tabs */}
      <div style={{ padding: '0 6px', display: 'flex', gap: 2 }}>
        <button
          className={`btn ${orderType === 'limit' ? 'pressed' : ''}`}
          onClick={() => setOrderType('limit')}
          style={{ flex: 1, minWidth: 0 }}
        >
          Limit
        </button>
        <button
          className={`btn ${orderType === 'market' ? 'pressed' : ''}`}
          onClick={() => setOrderType('market')}
          style={{ flex: 1, minWidth: 0 }}
        >
          Market
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: '#808080',
            padding: '0 2px',
          }}
        >
          <span>Available {side === 'buy' ? spotMarket.quote : spotMarket.base}:</span>
          <span className="mono">
            {isConnected ? formatPx(availableForSide) : '—'}{' '}
            {side === 'buy' ? spotMarket.quote : spotMarket.base}
          </span>
        </div>

        {orderType === 'limit' && (
          <Row label="Price">
            <input
              className="input mono"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={midPx > 0 ? roundSpotPrice(midPx, spotMarket.szDecimals) : '0'}
              inputMode="decimal"
              style={{ flex: 1, minWidth: 0, width: '100%' }}
            />
          </Row>
        )}

        <Row label="Size">
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%' }}>
            <input
              className="input mono"
              value={size}
              onChange={(e) => {
                const v = e.target.value;
                setSize(v);
                // Bidirectional Size ↔ slider: derive the slider/% from
                // the typed size so the thumb tracks the user's input.
                const num = parseFloat(v);
                if (
                  !Number.isFinite(num) ||
                  num <= 0 ||
                  sliderUsdAvail <= 0 ||
                  effectivePx <= 0
                ) {
                  setSizePct(0);
                  setSizePctInput('');
                  return;
                }
                const usdValue = sizeUnit === 'usd' ? num : num * effectivePx;
                const pct = clampPct((usdValue / sliderUsdAvail) * 100);
                setSizePct(pct);
                setSizePctInput(
                  pct === 0 ? '' : Number.isInteger(pct) ? String(pct) : pct.toFixed(1),
                );
              }}
              placeholder={sizeUnit === 'usd' ? '0.00' : '0.0'}
              inputMode="decimal"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              className="pill-btn"
              onClick={toggleSizeUnit}
              title={`Switch size unit (currently ${sizeUnit === 'coin' ? spotMarket.base : spotMarket.quote})`}
              style={{ minWidth: 48 }}
            >
              {sizeUnit === 'coin' ? spotMarket.base : spotMarket.quote} ⇄
            </button>
          </div>
        </Row>

        {/* Size slider + numeric % input — same component layout as
            TradeApp's M1.3 slider. step=1 so programmatic updates from
            typed sizes don't snap to coarse boundaries. */}
        <div style={{ padding: '2px 6px 0 66px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              type="range"
              className="trackbar"
              min={0}
              max={100}
              step={1}
              value={sizePct}
              onChange={(e) => {
                const pct = parseFloat(e.target.value);
                applySizePct(pct);
                setSizePctInput(
                  pct === 0 ? '' : Number.isInteger(pct) ? String(pct) : pct.toFixed(1),
                );
              }}
            />
            <div className="trackbar-ticks" />
          </div>
          <input
            className="input mono"
            value={sizePctInput}
            onChange={(e) => {
              const raw = e.target.value;
              setSizePctInput(raw);
              if (raw === '') {
                setSizePct(0);
                setSize('');
                return;
              }
              const n = parseFloat(raw);
              if (!Number.isFinite(n)) return;
              applySizePct(clampPct(n));
            }}
            placeholder="0"
            style={{ width: 36, boxSizing: 'border-box', textAlign: 'right' }}
            aria-label="Size as percent of available"
          />
          <span style={{ fontSize: 10, color: '#808080' }}>%</span>
        </div>
      </div>

      {/* Order Preview — fees only (no liq / margin since spot has neither) */}
      <div className="fieldset" style={{ margin: '4px 6px' }}>
        <div className="fieldset-legend">Order Preview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: 10 }}>
          <span style={{ color: '#808080' }}>Order Value</span>
          <span className="mono">{notional > 0 ? `$${notional.toFixed(2)}` : '—'}</span>

          <span style={{ color: '#808080' }}>
            Base fee ({isMaker ? 'maker 1.5bps' : 'taker 4.5bps'})
          </span>
          <span className="mono">${baseFee.toFixed(4)}</span>

          <span style={{ color: '#808080' }}>Builder fee (5bps)</span>
          <span className="mono">${builderFee.toFixed(4)}</span>

          <span
            style={{
              color: '#808080',
              fontWeight: 700,
              borderTop: '1px solid var(--bevel-dark-1)',
            }}
          >
            Total fee
          </span>
          <span
            className="mono"
            style={{ borderTop: '1px solid var(--bevel-dark-1)', fontWeight: 700 }}
          >
            ${totalFee.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div
          style={{
            margin: '0 6px 4px',
            padding: '4px 6px',
            background:
              statusMsg.kind === 'ok'
                ? '#d0ffd0'
                : statusMsg.kind === 'err'
                  ? '#ffd0d0'
                  : '#ffffcc',
            border: '1px solid #808080',
            fontSize: 10,
            wordBreak: 'break-word',
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Submit / Connect — pinned to the bottom of the panel. */}
      <div style={{ padding: 6, marginTop: 'auto' }}>
        {isConnected ? (
          <button
            className={`btn ${side === 'buy' ? 'btn-long' : 'btn-short'}`}
            onClick={executeSubmit}
            disabled={buyDisabled}
            style={{ width: '100%', opacity: buyDisabled ? 0.6 : 1 }}
          >
            {submitLabel}
          </button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button className="btn primary" onClick={show} style={{ width: '100%' }}>
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'center', gap: 6 }}>
      <span style={{ color: '#808080', fontSize: 11 }}>{label}</span>
      {children}
    </div>
  );
}
