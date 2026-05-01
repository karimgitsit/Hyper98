import type { UserFill } from '@/stores/ordersStore';

export interface ClosedPosition {
  /** Stable id for list keying / selection. Coin + close timestamp + idx. */
  id: string;
  coin: string;
  side: 'long' | 'short';
  /** Peak absolute size held during the cycle. */
  maxSize: number;
  /** Size-weighted avg of fills that opened/added to the position. */
  avgEntryPx: number;
  /** Size-weighted avg of fills that reduced/closed the position. */
  avgExitPx: number;
  /** Sum of `closedPnl` across the cycle. */
  realizedPnl: number;
  /** Cumulative base fee (excludes builder fee). */
  baseFee: number;
  /** Cumulative builder fee paid to the 5bps attribution. */
  builderFee: number;
  openedAt: number;
  closedAt: number;
}

const EPS = 1e-9;

/**
 * Rebuild closed-position cycles from a user's fill history.
 *
 * A cycle on a coin starts when net size moves from 0 to non-zero, and
 * ends when it returns to 0. A flip fill (e.g. a sell larger than the
 * current long) closes the in-progress cycle and opens a new one in the
 * opposite direction with the overflow at the same fill price.
 *
 * Fee + closedPnl on a flip fill are booked entirely to the closing
 * cycle. closedPnl is unambiguous (HL only reports PnL on the closing
 * portion); the fee allocation is an approximation, but flip fills are
 * rare and the alternative — pro-rating — adds complexity for marginal
 * accuracy on a UI-side estimate.
 *
 * Works uniformly for main-dex (`coin: "BTC"`) and HIP-3 fills
 * (`coin: "flx:TSLA"`) since cycles are tracked per unique coin string.
 */
export function reconstructClosedPositions(fills: UserFill[]): ClosedPosition[] {
  const byCoin = new Map<string, UserFill[]>();
  for (const f of fills) {
    if (!byCoin.has(f.coin)) byCoin.set(f.coin, []);
    byCoin.get(f.coin)!.push(f);
  }

  const out: ClosedPosition[] = [];
  for (const [coin, list] of byCoin) {
    const sorted = [...list].sort((a, b) => a.time - b.time);

    let netSize = 0;
    let cycleSide: 'long' | 'short' = 'long';
    let openedAt = 0;
    let openSizeCum = 0;
    let openNotional = 0;
    let closeSizeCum = 0;
    let closeNotional = 0;
    let realizedPnl = 0;
    let baseFeeCum = 0;
    let builderFeeCum = 0;
    let maxSize = 0;
    let cycleIdx = 0;

    function reset() {
      netSize = 0;
      openSizeCum = 0;
      openNotional = 0;
      closeSizeCum = 0;
      closeNotional = 0;
      realizedPnl = 0;
      baseFeeCum = 0;
      builderFeeCum = 0;
      maxSize = 0;
      openedAt = 0;
    }

    for (const f of sorted) {
      const signedSize = f.side === 'buy' ? f.sz : -f.sz;
      const baseFee = f.fee - f.builderFee;

      if (Math.abs(netSize) < EPS) {
        cycleSide = f.side === 'buy' ? 'long' : 'short';
        openedAt = f.time;
        netSize = signedSize;
        openSizeCum = f.sz;
        openNotional = f.sz * f.px;
        baseFeeCum = baseFee;
        builderFeeCum = f.builderFee;
        realizedPnl = f.closedPnl;
        maxSize = Math.abs(netSize);
        continue;
      }

      if (Math.sign(signedSize) === Math.sign(netSize)) {
        netSize += signedSize;
        openSizeCum += f.sz;
        openNotional += f.sz * f.px;
        baseFeeCum += baseFee;
        builderFeeCum += f.builderFee;
        realizedPnl += f.closedPnl;
        maxSize = Math.max(maxSize, Math.abs(netSize));
        continue;
      }

      const reduceBy = Math.min(Math.abs(signedSize), Math.abs(netSize));
      const overflow = Math.abs(signedSize) - reduceBy;
      closeSizeCum += reduceBy;
      closeNotional += reduceBy * f.px;
      baseFeeCum += baseFee;
      builderFeeCum += f.builderFee;
      realizedPnl += f.closedPnl;
      netSize += signedSize;

      // A reducing fill that lands above 0 size leaves the cycle
      // intact. Anything else — exact close OR a flip past zero —
      // ends the in-progress cycle. On a flip the overflow opens a
      // new cycle in the opposite direction at the fill price.
      const closesCycle = Math.abs(netSize) < EPS || overflow > EPS;
      if (closesCycle) {
        out.push({
          id: `${coin}-${f.time}-${cycleIdx++}`,
          coin,
          side: cycleSide,
          maxSize,
          avgEntryPx: openSizeCum > 0 ? openNotional / openSizeCum : 0,
          avgExitPx: closeSizeCum > 0 ? closeNotional / closeSizeCum : 0,
          realizedPnl,
          baseFee: baseFeeCum,
          builderFee: builderFeeCum,
          openedAt,
          closedAt: f.time,
        });
        reset();
        if (overflow > EPS) {
          cycleSide = f.side === 'buy' ? 'long' : 'short';
          openedAt = f.time;
          netSize = f.side === 'buy' ? overflow : -overflow;
          openSizeCum = overflow;
          openNotional = overflow * f.px;
          maxSize = Math.abs(netSize);
        }
      }
    }
  }

  out.sort((a, b) => b.closedAt - a.closedAt);
  return out;
}
