'use client';

import { useAccount, useDisconnect } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useWindowStore } from '@/stores/windowStore';
import { expectDisconnect } from '@/lib/wallet/disconnectTracker';

/**
 * Fixed top-right desktop affordance. When no wallet is connected, shows a
 * prominent "Connect Wallet" button so first-time users don't have to open
 * Wallet.exe to find the entry point. When connected, collapses to a small
 * status chip that opens Wallet.exe on click.
 */
export function ConnectCorner() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const openWindow = useWindowStore((s) => s.open);

  if (!isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button
            className="btn primary"
            style={{
              position: 'fixed',
              top: 12,
              right: 12,
              zIndex: 50,
              padding: '6px 14px',
              fontWeight: 700,
              fontSize: 12,
              minWidth: 140,
            }}
            onClick={show}
          >
            Connect Wallet
          </button>
        )}
      </ConnectKitButton.Custom>
    );
  }

  const short = address ? address.slice(0, 6) + '\u2026' + address.slice(-4) : '';

  return (
    <div
      className="window"
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 50,
        display: 'inline-flex',
        padding: 4,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: 'var(--w98-green)', fontSize: 14, lineHeight: 1 }}>{'\u25CF'}</span>
      <span
        className="mono"
        style={{ fontSize: 11, cursor: 'pointer' }}
        onClick={() => openWindow('wallet', { singleton: true })}
        title="Open Wallet.exe"
      >
        {short}
      </span>
      <button
        className="btn"
        style={{ fontSize: 10, padding: '1px 6px', minWidth: 'auto' }}
        onClick={() => {
          expectDisconnect();
          disconnect();
        }}
      >
        Disconnect
      </button>
    </div>
  );
}
