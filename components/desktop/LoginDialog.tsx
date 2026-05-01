'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import type { Connector } from 'wagmi';
import { playSound } from '@/lib/sounds/SoundManager';

const DISMISS_KEY = 'hyper98:login:dismissed';

interface LoginDialogProps {
  bootDone: boolean;
}

type WalletKind = 'metamask' | 'coinbase' | 'rabby' | 'phantom' | 'walletconnect';

interface WalletSlot {
  kind: WalletKind;
  label: string;
  rdns?: string;      // EIP-6963 rdns — preferred when extension is installed
  sdkId?: string;     // wagmi SDK connector id — fallback (always works)
  installUrl: string; // shown when neither rdns nor sdk match
}

const WALLET_SLOTS: WalletSlot[] = [
  {
    kind: 'metamask',
    label: 'MetaMask',
    rdns: 'io.metamask',
    sdkId: 'metaMaskSDK',
    installUrl: 'https://metamask.io/download/',
  },
  {
    kind: 'coinbase',
    label: 'Coinbase Wallet',
    rdns: 'com.coinbase.wallet',
    sdkId: 'coinbaseWalletSDK',
    installUrl: 'https://www.coinbase.com/wallet/downloads',
  },
  {
    kind: 'rabby',
    label: 'Rabby',
    rdns: 'io.rabby',
    installUrl: 'https://rabby.io/',
  },
  {
    kind: 'phantom',
    label: 'Phantom',
    rdns: 'app.phantom',
    installUrl: 'https://phantom.com/download',
  },
  {
    kind: 'walletconnect',
    label: 'WalletConnect',
    sdkId: 'walletConnect',
    installUrl: 'https://walletconnect.com/',
  },
];

// Pixel-fitting Win98-ish glyphs for each wallet. Brand colors + initials —
// trademark-safe while remaining recognizable at 16x16.
const GLYPHS: Record<WalletKind, { bg: string; fg: string; letter: string }> = {
  metamask:      { bg: '#F6851B', fg: '#FFFFFF', letter: 'M' },
  coinbase:      { bg: '#0052FF', fg: '#FFFFFF', letter: 'C' },
  rabby:         { bg: '#7084FF', fg: '#FFFFFF', letter: 'R' },
  phantom:       { bg: '#551BF9', fg: '#FFFFFF', letter: 'P' },
  walletconnect: { bg: '#3B99FC', fg: '#FFFFFF', letter: 'W' },
};

function WalletGlyph({ kind, icon }: { kind: WalletKind; icon?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="login-wallet-icon" />;
  }
  const g = GLYPHS[kind];
  return (
    <span
      className="login-wallet-icon login-wallet-glyph"
      style={{ background: g.bg, color: g.fg }}
      aria-hidden
    >
      {g.letter}
    </span>
  );
}

function connectorIcon(c: Connector | undefined): string | undefined {
  if (!c) return undefined;
  const withIcon = c as Connector & { icon?: string };
  return withIcon.icon;
}

interface SlotEntry {
  slot: WalletSlot;
  connector: Connector | null; // null = not installed
}

export function LoginDialog({ bootDone }: LoginDialogProps) {
  const { isConnected } = useAccount();
  const { connectors, connect, isPending, error, variables } = useConnect();
  const [open, setOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<WalletKind | null>(null);

  const entries: SlotEntry[] = useMemo(() => {
    return WALLET_SLOTS.map((slot) => {
      // Prefer EIP-6963 extension (has installed icon + no extra SDK overhead).
      const byRdns = slot.rdns ? connectors.find((c) => c.id === slot.rdns) : undefined;
      if (byRdns) return { slot, connector: byRdns };
      // Fall back to explicit SDK connector (MetaMask SDK, Coinbase SDK, WC).
      const bySdk = slot.sdkId ? connectors.find((c) => c.id === slot.sdkId) : undefined;
      if (bySdk) return { slot, connector: bySdk };
      return { slot, connector: null };
    });
  }, [connectors]);

  useEffect(() => {
    if (!bootDone) return;
    if (isConnected) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    const t = window.setTimeout(() => {
      setOpen(true);
      playSound('ding');
    }, 450);
    return () => window.clearTimeout(t);
  }, [bootDone, isConnected]);

  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);

  useEffect(() => {
    if (selectedKind) return;
    const first = entries.find((e) => e.connector);
    if (first) setSelectedKind(first.slot.kind);
  }, [entries, selectedKind]);

  if (!open) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setOpen(false);
  };

  const selectedEntry = entries.find((e) => e.slot.kind === selectedKind);
  const canConnect = !!(selectedEntry?.connector) && !isPending;

  const doConnect = () => {
    if (!selectedEntry) return;
    if (!selectedEntry.connector) {
      window.open(selectedEntry.slot.installUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    connect({ connector: selectedEntry.connector });
  };

  const pendingId = isPending && variables?.connector && 'id' in variables.connector
    ? variables.connector.id
    : null;

  return (
    <div className="dialog-backdrop" style={{ zIndex: 18000 }}>
      <div className="dialog login-dialog" role="dialog" aria-label="Enter Network Password">
        <div className="titlebar">
          <span className="titlebar-text">Enter Network Password</span>
          <div className="titlebar-buttons">
            <button
              className="titlebar-btn"
              aria-label="Close"
              onClick={dismiss}
            >
              ×
            </button>
          </div>
        </div>
        <div className="dialog-body login-body">
          <div className="login-key-icon" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <rect x="0" y="0" width="44" height="44" fill="none" />
              <circle cx="14" cy="22" r="8" fill="none" stroke="#000" strokeWidth="2" />
              <circle cx="14" cy="22" r="3" fill="#000" />
              <rect x="20" y="20" width="20" height="4" fill="#dcdc00" stroke="#000" strokeWidth="1" />
              <rect x="30" y="24" width="3" height="5" fill="#dcdc00" stroke="#000" strokeWidth="1" />
              <rect x="36" y="24" width="3" height="7" fill="#dcdc00" stroke="#000" strokeWidth="1" />
            </svg>
          </div>
          <div className="login-body-text">
            <div style={{ marginBottom: 10 }}>
              Enter your network password for <b>HYPERLIQUID</b>.
            </div>
            <div className="login-row">
              <label className="login-label">Resource:</label>
              <span className="login-value">\\HYPERLIQUID\PERPS</span>
            </div>
            <div className="login-row login-row-top">
              <label className="login-label">Wallet:</label>
              <div className="login-wallet-list sunken" role="listbox" tabIndex={0}>
                {entries.map(({ slot, connector }) => {
                  const selected = slot.kind === selectedKind;
                  const pending = !!connector && pendingId === connector.id;
                  const icon = connectorIcon(connector ?? undefined);
                  const unavailable = !connector;
                  return (
                    <div
                      key={slot.kind}
                      role="option"
                      aria-selected={selected}
                      className={[
                        'login-wallet-item',
                        selected ? 'selected' : '',
                        unavailable ? 'unavailable' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedKind(slot.kind)}
                      onDoubleClick={() => {
                        setSelectedKind(slot.kind);
                        if (connector) connect({ connector });
                        else window.open(slot.installUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <WalletGlyph kind={slot.kind} icon={icon} />
                      <span className="login-wallet-name">{slot.label}</span>
                      {pending && <span className="login-wallet-pending">connecting…</span>}
                      {unavailable && <span className="login-wallet-tag">install &rarr;</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            {error && (
              <div className="login-error">
                {error.message.split('\n')[0] || 'Connection failed.'}
              </div>
            )}
          </div>
        </div>
        <div className="dialog-buttons login-buttons">
          <button
            className="btn primary"
            onClick={doConnect}
            disabled={!selectedEntry || (!canConnect && !!selectedEntry.connector)}
            style={{ minWidth: 88 }}
          >
            {isPending
              ? 'Connecting…'
              : selectedEntry && !selectedEntry.connector
                ? 'Install'
                : 'Connect'}
          </button>
          <button
            className="btn"
            onClick={dismiss}
            style={{ minWidth: 88 }}
          >
            Cancel
          </button>
        </div>
        <div className="login-footnote">
          Tip: Cancel to browse as <b>Guest</b>. You can connect any time from the top-right.
        </div>
      </div>
    </div>
  );
}
