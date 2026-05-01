'use client';

import { useEffect, useMemo } from 'react';
import { useOrderBookStore, type BookLevel } from '@/stores/orderBookStore';
import { usePriceStore } from '@/stores/priceStore';
import { useWindowStore } from '@/stores/windowStore';
import { useQuickActionStore } from '@/stores/quickActionStore';

function formatPx(n: number): string {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function formatSz(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

// Plain decimal string suitable for piping into TradeApp's Size input —
// no `K` suffix, no exponent. The submit path re-rounds via `roundSize`
// so the per-asset szDecimals is enforced server-bound.
function formatSizeForInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  // toFixed(8) avoids exponent notation for tiny sizes; trim trailing
  // zeros / lone dot so the input doesn't look weirdly padded.
  return n.toFixed(8).replace(/\.?0+$/, '');
}

const DEFAULT_COIN = 'BTC';
const LEVELS_PER_SIDE = 12;

type DisplayLevel = BookLevel & { cum: number };

export function OrderBookApp({ windowId }: { windowId: string }) {
  const props = useWindowStore((s) => s.windows[windowId]?.props) ?? {};
  const minimized = useWindowStore((s) => s.windows[windowId]?.minimized) ?? false;
  const coin = (props.coin as string | undefined) ?? DEFAULT_COIN;

  const book = useOrderBookStore((s) => s.books[coin]);
  const error = useOrderBookStore((s) => s.errors[coin]);
  const subscribe = useOrderBookStore((s) => s.subscribe);
  const unsubscribe = useOrderBookStore((s) => s.unsubscribe);
  const spotMarket = usePriceStore((s) => s.getSpotMarket(coin));
  const displayCoin = spotMarket?.displayName ?? coin;

  useEffect(() => {
    if (minimized) return;
    subscribe(coin);
    return () => unsubscribe(coin);
  }, [coin, minimized, subscribe, unsubscribe]);

  const { asks, bids, maxSz, spread, mid } = useMemo(() => {
    if (!book) return { asks: [] as DisplayLevel[], bids: [] as DisplayLevel[], maxSz: 0, spread: 0, mid: 0 };

    const asksFromBest = book.asks.slice(0, LEVELS_PER_SIDE);
    let askCum = 0;
    const asksWithCum = asksFromBest.map((l) => { askCum += l.sz; return { ...l, cum: askCum }; });
    const topAsks = asksWithCum.reverse(); // display top-to-bottom, best at bottom

    let cum = 0;
    const bidsWithCum = book.bids.slice(0, LEVELS_PER_SIDE).map((l) => { cum += l.sz; return { ...l, cum }; });

    const maxSz = Math.max(
      ...topAsks.map((l) => l.sz),
      ...bidsWithCum.map((l) => l.sz),
      1,
    );
    const bestAsk = book.asks[0]?.px ?? 0;
    const bestBid = book.bids[0]?.px ?? 0;
    const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
    const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : 0;
    return { asks: topAsks, bids: bidsWithCum, maxSz, spread, mid };
  }, [book]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 10 }}>
      <div style={{ padding: '4px 6px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 11 }}>{displayCoin}</span>
        <span style={{ color: '#808080', marginLeft: 'auto' }}>L2</span>
      </div>

      {error && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>{error}</div>
      )}

      <div className="sunken" style={{ flex: 1, margin: '0 4px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {asks.map((l) => (
              <BookRow key={'a' + l.px} level={l} maxSz={maxSz} side="ask" coin={coin} />
            ))}
            <tr style={{ background: '#ffffcc', fontFamily: 'var(--w98-font-mono)' }}>
              <td colSpan={3} style={{ padding: '2px 6px', textAlign: 'center', fontSize: 10 }}>
                {mid > 0 ? (
                  <>
                    <span style={{ fontWeight: 700 }}>{formatPx(mid)}</span>
                    <span style={{ color: '#808080', marginLeft: 8 }}>
                      spread {spread > 0 ? formatPx(spread) : '—'}
                    </span>
                  </>
                ) : (
                  <span style={{ color: '#808080' }}>loading...</span>
                )}
              </td>
            </tr>
            {bids.map((l) => (
              <BookRow key={'b' + l.px} level={l} maxSz={maxSz} side="bid" coin={coin} />
            ))}
            {!book && (
              <tr>
                <td colSpan={3} style={{ padding: 12, color: '#808080', textAlign: 'center' }}>
                  loading {displayCoin}...
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
  padding: '2px 6px',
  fontWeight: 700,
  fontSize: 10,
  borderBottom: '1px solid var(--bevel-dark-1)',
};

function BookRow({
  level,
  maxSz,
  side,
  coin,
}: {
  level: DisplayLevel;
  maxSz: number;
  side: 'bid' | 'ask';
  coin: string;
}) {
  const pct = Math.min(100, (level.sz / maxSz) * 100);
  const bg = side === 'bid' ? 'rgba(0, 128, 0, 0.18)' : 'rgba(168, 0, 0, 0.18)';
  const color = side === 'bid' ? 'var(--w98-green)' : 'var(--w98-red)';

  // Click variants (M3.1):
  //   plain click   → fill price only (parity with HL)
  //   shift+click   → fill price + flip side (book-walk the opposite side)
  //   double-click  → fill price + cumulative size at this level
  // shift is checked on both `click` and `dblclick` so shift+dblclick
  // remains a net side-flip (the two preceding `click`s flip-flip = no
  // net change, then the dblclick flips once more). `e.shiftKey` is
  // identical on Mac and Windows — we deliberately do not key on the
  // Mac ⌘ since dblclick is the documented size-fill gesture.
  const pxStr = formatPx(level.px);
  const szStr = formatSizeForInput(level.sz);

  return (
    <tr
      style={{ position: 'relative', cursor: 'var(--click-cursor, default)' }}
      onClick={(e) =>
        useQuickActionStore.getState().setQuickFill(coin, {
          px: pxStr,
          flipSide: e.shiftKey,
        })
      }
      onDoubleClick={(e) =>
        useQuickActionStore.getState().setQuickFill(coin, {
          px: pxStr,
          sz: szStr,
          flipSide: e.shiftKey,
        })
      }
    >
      <td
        className="num"
        style={{
          padding: '1px 6px',
          color,
          fontWeight: 700,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: `${pct}%`,
            background: bg,
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'relative' }}>{formatPx(level.px)}</span>
      </td>
      <td className="num" style={{ padding: '1px 6px' }}>{formatSz(level.sz)}</td>
      <td className="num" style={{ padding: '1px 6px', color: '#808080' }}>{formatSz(level.cum)}</td>
    </tr>
  );
}
