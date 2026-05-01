'use client';

import { useAccountEffect } from 'wagmi';
import { useCrashStore } from '@/stores/crashStore';
import { consumeExpectedDisconnect } from '@/lib/wallet/disconnectTracker';
import { playSound } from '@/lib/sounds/SoundManager';

/**
 * Listens for wagmi account state transitions. When the wallet disconnects
 * *without* having been asked to via `expectDisconnect()`, it's treated as
 * a fatal error — we crash to BSOD. User-initiated disconnects (the
 * Disconnect button in WalletApp) flip the flag first and pass through
 * silently.
 *
 * Renders nothing; must be mounted once below <WalletProvider>.
 */
export function DisconnectGuard() {
  const trigger = useCrashStore((s) => s.trigger);
  useAccountEffect({
    onDisconnect() {
      if (consumeExpectedDisconnect()) return;
      playSound('chord');
      trigger(
        'Wallet connection lost',
        'VXD device HYPERLIQUID.VXD was disconnected unexpectedly. Your session has ended.',
      );
    },
  });
  return null;
}
