/**
 * Tracks whether a pending wagmi disconnect event was explicitly initiated
 * from our own UI. `components/desktop/DisconnectGuard.tsx` uses this to
 * decide whether to treat the disconnect as "unexpected" (→ BSOD) or as a
 * normal user-initiated disconnect (→ no-op).
 *
 * Call `expectDisconnect()` immediately before `useDisconnect().disconnect()`.
 * The guard's `useAccountEffect.onDisconnect` then calls
 * `consumeExpectedDisconnect()` — if it returns true the event is swallowed.
 *
 * A 5s TTL auto-clears the flag in case the disconnect never actually fires
 * (wallet refused, connector hung, etc.) so a *later* unexpected disconnect
 * still raises BSOD.
 */

let expected = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const WINDOW_MS = 5_000;

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function expectDisconnect(): void {
  expected = true;
  clearTimer();
  timer = setTimeout(() => {
    expected = false;
    timer = null;
  }, WINDOW_MS);
}

export function consumeExpectedDisconnect(): boolean {
  const was = expected;
  expected = false;
  clearTimer();
  return was;
}
