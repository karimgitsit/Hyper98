/**
 * M3.5 — map a Hyperliquid per-order status object (or a thrown error)
 * to a Win98 sound. Centralized so TradeApp and PositionsApp pick the
 * same sample for the same outcome.
 *
 *   - filled / waitingForFill / partial fill → `chimes` (fill chime)
 *   - resting (limit landed on the book)     → `ding`   (acknowledgement)
 *   - error / reject                          → `chord`  (Win98 error chord)
 *   - anything else                           → no sound (info / preparing)
 *
 * Pure function — only triggers a `playSound` call. Caller decides
 * whether to invoke this on success vs. error paths.
 */
import { playSound } from './SoundManager';

/**
 * Inspect a per-leg status from `response.data.statuses[i]` — the
 * shape of the SDK's `OrderResponse` per-leg union — and play the
 * matching sound. Accepts `unknown` so callers can pass the raw array
 * element without narrowing first; we runtime-check the known shapes.
 */
export function playOrderOutcome(status: unknown): void {
  if (!status) return;
  if (typeof status === 'string') {
    if (status === 'waitingForFill') {
      playSound('chimes');
      return;
    }
    if (status === 'waitingForTrigger') {
      playSound('ding');
      return;
    }
    return;
  }
  if (typeof status === 'object') {
    const obj = status as { filled?: unknown; resting?: unknown; error?: unknown };
    if (obj.error) {
      playSound('chord');
      return;
    }
    if (obj.filled) {
      playSound('chimes');
      return;
    }
    if (obj.resting) {
      playSound('ding');
      return;
    }
  }
}

/** Reject path — caught error or per-leg error. Always `chord`. */
export function playOrderReject(): void {
  playSound('chord');
}

/**
 * Success path for callers that don't have a per-leg status to
 * inspect (e.g. PositionsApp's market-IOC close, where a successful
 * resolve means the order at least made it through the network and
 * any per-leg error would have rethrown out of
 * `submitOrderWithBuilderFeeRetry`).
 */
export function playOrderFill(): void {
  playSound('chimes');
}
