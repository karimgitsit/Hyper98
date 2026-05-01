'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useCandleStore, type CandleInterval } from '@/stores/candleStore';
import { usePriceStore } from '@/stores/priceStore';
import { useWindowStore } from '@/stores/windowStore';
import { useOrdersStore, type OpenOrder } from '@/stores/ordersStore';
import { useCancelOrder } from '@/hooks/useCancelOrder';
import { priceTier, formatPx, formatCompactUsd, formatCompactUnit, formatSignedPct, formatSignedPx } from '@/lib/format';
import {
  annualizeHourlyFunding,
  formatFundingPct,
  nextFundingMs,
  formatCountdown,
} from '@/lib/hyperliquid/funding';

const DEFAULT_COIN = 'BTC';
const DEFAULT_INTERVAL: CandleInterval = '15m';
const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';
const UP_VOL_COLOR = 'rgba(38, 166, 154, 0.5)';
const DOWN_VOL_COLOR = 'rgba(239, 83, 80, 0.5)';

export function ChartApp({ windowId }: { windowId: string }) {
  const props = useWindowStore((s) => s.windows[windowId]?.props) ?? {};
  const minimized = useWindowStore((s) => s.windows[windowId]?.minimized) ?? false;
  const coin = (props.coin as string | undefined) ?? DEFAULT_COIN;
  const propInterval = props.interval as CandleInterval | undefined;
  const [interval, setInterval] = useState<CandleInterval>(propInterval ?? DEFAULT_INTERVAL);

  const seriesKey = { coin, interval };
  const key = `${coin}|${interval}`;

  const candles = useCandleStore((s) => s.series[key]);
  const loading = useCandleStore((s) => s.loading[key]);
  const error = useCandleStore((s) => s.errors[key]);
  const subscribe = useCandleStore((s) => s.subscribe);
  const unsubscribe = useCandleStore((s) => s.unsubscribe);
  const spotMarket = usePriceStore((s) => s.getSpotMarket(coin));
  const perpMarket = usePriceStore((s) => s.getMarket(coin));
  const fetchMarkets = usePriceStore((s) => s.fetchMarkets);
  const displayCoin = spotMarket?.displayName ?? (coin.includes('/') ? coin : `${coin}/USDC`);

  // Pull perp metrics for the header strip; spot windows just hide them.
  const isPerp = !!perpMarket;

  useEffect(() => {
    if (minimized) return;
    subscribe(seriesKey);
    return () => unsubscribe(seriesKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, interval, minimized]);

  // Keep the perp asset-ctx warm so header readouts (mark/oracle/funding/OI/vol)
  // stay live when only the chart is open.
  useEffect(() => {
    if (minimized || !isPerp) return;
    fetchMarkets();
    const id = window.setInterval(() => fetchMarkets(), 5000);
    return () => window.clearInterval(id);
  }, [minimized, isPerp, fetchMarkets]);

  // Funding countdown ticker (1Hz). HL pays on the hour; this just diffs
  // against `nextFundingMs(now)` for display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (minimized || !isPerp) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [minimized, isPerp]);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Create chart on mount / container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#c0c0c0',
        fontFamily: '"Perfect DOS VGA 437", "Courier New", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: '#404040',
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#404040',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#808080', width: 1, style: 3 },
        horzLine: { color: '#808080', width: 1, style: 3 },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    // Volume overlay pinned to the bottom ~22% of the chart, sharing the
    // price-time axis but on its own (invisible) scale so it doesn't
    // distort price.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Update data on fetch
  useEffect(() => {
    if (!candles || !seriesRef.current || !volumeRef.current) return;
    const candleData = candles.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData = candles.map((c) => ({
      time: Math.floor(c.time / 1000) as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? UP_VOL_COLOR : DOWN_VOL_COLOR,
    }));
    seriesRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);

    // Re-tune the candle series' price format to match the asset's tier.
    // Use the last close as the tier reference — it'll be in the right
    // ballpark for everything visible on screen.
    const last = candles[candles.length - 1];
    if (last) {
      const tier = priceTier(last.close);
      seriesRef.current.applyOptions({
        priceFormat: {
          type: 'price',
          precision: tier.precision,
          minMove: tier.minMove,
        },
      });
    }
  }, [candles]);

  // ---- Open-order overlays --------------------------------------------------
  // Hyperliquid-style: each open limit order on this coin is drawn as a
  // dashed price-line on the candle series, with an HTML cancel button
  // pinned to its Y coordinate at the right edge of the chart.
  const { address } = useAccount();
  const allOpenOrders = useOrdersStore((s) => s.openOrders);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  // Make sure orders are warm even if Orders.exe isn't open.
  useEffect(() => {
    if (minimized || !address) return;
    fetchOpenOrders(address);
    const id = window.setInterval(() => fetchOpenOrders(address), 5000);
    return () => window.clearInterval(id);
  }, [minimized, address, fetchOpenOrders]);

  // Match coin (case-insensitive). Spot coins arrive as "ETH/USDC" in `coin`
  // and as "PURR" / "@140" style names in the orders payload — only show a
  // line when we can confidently match.
  const coinOrders = useMemo(
    () =>
      allOpenOrders.filter(
        (o) => o.coin.toUpperCase() === coin.toUpperCase() && !o.isTrigger,
      ),
    [allOpenOrders, coin],
  );

  // Manage createPriceLine handles in a ref so we can diff on update.
  const priceLinesRef = useRef<Map<number, IPriceLine>>(new Map());
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const lines = priceLinesRef.current;
    const nextOids = new Set(coinOrders.map((o) => o.oid));

    // Remove stale
    for (const [oid, line] of lines) {
      if (!nextOids.has(oid)) {
        try { series.removePriceLine(line); } catch { /* chart may be torn down */ }
        lines.delete(oid);
      }
    }
    // Add or update
    for (const o of coinOrders) {
      const color = o.side === 'buy' ? UP_COLOR : DOWN_COLOR;
      const title = `${o.side === 'buy' ? 'BUY' : 'SELL'} ${o.sz}`;
      const existing = lines.get(o.oid);
      if (existing) {
        existing.applyOptions({ price: o.limitPx, color, title });
      } else {
        const line = series.createPriceLine({
          price: o.limitPx,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        });
        lines.set(o.oid, line);
      }
    }
  }, [coinOrders]);

  // Clean up all price lines on unmount.
  useEffect(() => {
    return () => {
      const series = seriesRef.current;
      const lines = priceLinesRef.current;
      if (series) {
        for (const line of lines.values()) {
          try { series.removePriceLine(line); } catch { /* noop */ }
        }
      }
      lines.clear();
    };
  }, []);

  // Position cancel buttons. lightweight-charts has no event for price-scale
  // changes, so we run a cheap rAF loop while there are orders to display
  // and only update state when a Y coordinate actually shifts.
  const [buttonPositions, setButtonPositions] = useState<Record<number, number>>({});
  useEffect(() => {
    if (coinOrders.length === 0) {
      setButtonPositions({});
      return;
    }
    let raf = 0;
    let last: Record<number, number> = {};
    const tick = () => {
      const series = seriesRef.current;
      if (series) {
        const next: Record<number, number> = {};
        let changed = false;
        for (const o of coinOrders) {
          const y = series.priceToCoordinate(o.limitPx);
          if (y == null) continue;
          const rounded = Math.round(y);
          next[o.oid] = rounded;
          if (last[o.oid] !== rounded) changed = true;
        }
        if (changed || Object.keys(next).length !== Object.keys(last).length) {
          last = next;
          setButtonPositions(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [coinOrders]);

  const { cancel, cancelling, error: cancelError } = useCancelOrder();

  // Header readouts (perp only — spot windows skip these fields).
  const markPx = perpMarket?.markPx ?? 0;
  const oraclePx = perpMarket?.oraclePx ?? 0;
  const change24hPct = perpMarket?.change24h ?? 0;
  const change24hAbs = perpMarket && perpMarket.prevDayPx > 0 ? perpMarket.markPx - perpMarket.prevDayPx : 0;
  const dayVol = perpMarket?.dayNtlVlm ?? 0;
  const oi = perpMarket?.openInterest ?? 0;
  const fundingAnnual = perpMarket ? annualizeHourlyFunding(perpMarket.funding) : 0;
  const fundingMs = nextFundingMs(now) - now;
  const changeColor = change24hPct >= 0 ? UP_COLOR : DOWN_COLOR;
  const fundingColor = fundingAnnual >= 0 ? UP_COLOR : DOWN_COLOR;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Symbol + timeframe row */}
      <div
        style={{
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          borderBottom: '1px solid var(--bevel-dark-1)',
        }}
      >
        <span style={{ fontWeight: 700 }}>{displayCoin}</span>
        <span style={{ color: '#808080' }}>|</span>
        {INTERVALS.map((iv) => (
          <span
            key={iv}
            onClick={() => setInterval(iv)}
            style={{
              padding: '1px 5px',
              cursor: 'default',
              background: iv === interval ? 'var(--w98-titlebar-active-start)' : 'transparent',
              color: iv === interval ? 'var(--w98-white)' : 'inherit',
              fontWeight: iv === interval ? 700 : 400,
            }}
          >
            {iv}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: '#808080', fontSize: 10 }}>
          {loading ? 'loading...' : candles ? `${candles.length} candles` : ''}
        </span>
      </div>

      {/* Market info strip — perp only */}
      {isPerp && (
        <div
          style={{
            padding: '3px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 10,
            borderBottom: '1px solid var(--bevel-dark-1)',
            background: 'var(--w98-bg, transparent)',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <HeaderField label="Mark" value={markPx > 0 ? formatPx(markPx) : '—'} />
          <HeaderField label="Oracle" value={oraclePx > 0 ? formatPx(oraclePx) : '—'} />
          <HeaderField
            label="24h Δ"
            value={
              <span style={{ color: changeColor }}>
                {formatSignedPx(change24hAbs)} / {formatSignedPct(change24hPct)}
              </span>
            }
          />
          <HeaderField label="24h Vol" value={formatCompactUsd(dayVol)} />
          <HeaderField label="OI" value={`${formatCompactUnit(oi)} ${coin}`} />
          <HeaderField
            label="Funding"
            value={
              <span style={{ color: fundingColor }}>
                {formatFundingPct(fundingAnnual, 4)}
              </span>
            }
          />
          <HeaderField label="Countdown" value={<span className="mono">{formatCountdown(fundingMs)}</span>} />
        </div>
      )}

      {error && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>{error}</div>
      )}
      {cancelError && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>
          Cancel error: {cancelError}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={containerRef}
          style={{ position: 'absolute', inset: 0, background: '#000' }}
        />
        {/* Order cancel buttons — pointer-events:none on the layer so the
            chart still receives pan/zoom; only the buttons themselves are
            interactive. The right offset clears the price-axis gutter. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {coinOrders.map((o) => {
            const y = buttonPositions[o.oid];
            if (y == null) return null;
            return (
              <button
                key={o.oid}
                className="btn"
                onClick={() => cancel(o)}
                disabled={!!cancelling[o.oid]}
                title={`Cancel ${o.side === 'buy' ? 'BUY' : 'SELL'} ${o.sz} ${o.coin} @ ${o.limitPx}`}
                style={{
                  position: 'absolute',
                  right: 64,
                  top: y - 8,
                  pointerEvents: 'auto',
                  fontSize: 9,
                  minWidth: 'auto',
                  padding: '0 4px',
                  height: 16,
                  lineHeight: '14px',
                }}
              >
                {cancelling[o.oid] ? '…' : '✕'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: '#808080' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  );
}
