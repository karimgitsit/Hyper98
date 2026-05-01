'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useWindowStore } from '@/stores/windowStore';
import type { RevenueSnapshot, UnconfiguredSnapshot } from '@/lib/hyperliquid/revenue';
import { claimRewards } from '@/lib/hyperliquid/orders';

type Snapshot = RevenueSnapshot | UnconfiguredSnapshot;

const POLL_INTERVAL_MS = 15_000;

function parseAdminAllowlist(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^0x[0-9a-f]{40}$/.test(s))
  );
}

function formatUsd(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n)) return s;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVlm(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n)) return s;
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

function formatBps(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n)) return s;
  return (n * 10_000).toFixed(1) + ' bps';
}

function formatAddr(a: string): string {
  if (a.length < 10) return a;
  return a.slice(0, 6) + '\u2026' + a.slice(-4);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function Sparkline({ data }: { data: Array<[number, string]> }) {
  const width = 440;
  const height = 56;
  const points = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.map(([, v]) => parseFloat(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (data.length - 1);
    return values
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / span) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data]);

  if (!points) {
    return (
      <div
        className="sunken"
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#808080',
          fontSize: 10,
          background: '#000',
        }}
      >
        no history yet
      </div>
    );
  }

  return (
    <div className="sunken" style={{ background: '#000', padding: 0 }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', imageRendering: 'pixelated' }}
      >
        <polyline points={points} stroke="#00ff00" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}

function DenyDialog({
  windowId,
  title,
  message,
}: {
  windowId: string;
  title: string;
  message: string;
}) {
  const close = useWindowStore((s) => s.close);
  return (
    <div
      style={{
        padding: 16,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11, maxWidth: 320 }}>{message}</div>
      <button
        className="btn"
        style={{ minWidth: 72, marginTop: 8 }}
        onClick={() => close(windowId)}
      >
        OK
      </button>
    </div>
  );
}

export function AdminApp({ windowId }: { windowId: string }) {
  const minimized = useWindowStore((s) => s.windows[windowId]?.minimized) ?? false;
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const allowlist = useMemo(() => parseAdminAllowlist(), []);
  const allowlistEmpty = allowlist.size === 0;
  const isAdmin = !!address && allowlist.has(address.toLowerCase());

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    if (minimized) return;

    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/revenue', { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setFetchError(
              typeof body.message === 'string'
                ? body.message
                : `HTTP ${res.status}`
            );
          }
          return;
        }
        const body = (await res.json()) as Snapshot;
        if (!cancelled) {
          setSnapshot(body);
          setFetchError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    fetchOnce();
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isAdmin, minimized, refreshTick]);

  if (!isConnected) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#808080', fontSize: 11 }}>
        Connect wallet to continue.
        <br />
        <span style={{ fontSize: 10 }}>Start &rarr; Wallet</span>
      </div>
    );
  }

  if (allowlistEmpty) {
    return (
      <DenyDialog
        windowId={windowId}
        title="Admin not configured"
        message="NEXT_PUBLIC_ADMIN_ADDRESSES is empty. Set it in .env.local to a comma-separated list of lowercase 0x addresses, then restart the dev server."
      />
    );
  }

  if (!isAdmin) {
    return (
      <DenyDialog
        windowId={windowId}
        title="Access Denied"
        message={`Wallet ${formatAddr(address!)} is not in the admin allowlist.`}
      />
    );
  }

  if (!snapshot) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#808080', fontSize: 11 }}>
        {fetchError ? `Error: ${fetchError}` : 'Loading\u2026'}
      </div>
    );
  }

  if (!snapshot.configured) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 12,
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
          }}
          className="sunken"
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Revenue worker not configured
            </div>
            <div style={{ fontSize: 11 }}>{snapshot.reason}</div>
          </div>
        </div>
        <StatusBar
          builderAddress={snapshot.builderAddress}
          network={snapshot.network}
          polledAt={snapshot.polledAt}
          error={fetchError}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        gap: 8,
        fontSize: 11,
      }}
    >
      {/* Big numerals row — builder revenue is the headline */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="Builder Revenue" value={'$' + formatUsd(snapshot.rewards.totalEarned)} />
        <Stat label="Routed Volume" value={formatVlm(snapshot.rewards.routedVlm)} />
      </div>

      {/* Sparkline */}
      <div>
        <div style={{ fontSize: 10, color: '#808080', marginBottom: 2 }}>
          All-time account value ({snapshot.history.allTime.length} points)
        </div>
        <Sparkline data={snapshot.history.allTime} />
      </div>

      {/* Fees/volume table */}
      <div className="sunken" style={{ padding: 4, flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            <Row k="Unclaimed rewards" v={'$' + formatUsd(snapshot.rewards.unclaimed)} />
            <Row k="Claimed rewards" v={'$' + formatUsd(snapshot.rewards.claimed)} />
            <Row k="Wallet balance" v={'$' + formatUsd(snapshot.account.accountValue)} />
            <Row k="7d exchange volume" v={formatVlm(snapshot.fees.last7dExchangeVlm)} />
            <Row k="User cross rate" v={formatBps(snapshot.fees.userCrossRate)} />
            <Row k="User add rate" v={formatBps(snapshot.fees.userAddRate)} />
          </tbody>
        </table>
      </div>

      <ClaimRewardsPanel
        unclaimed={snapshot.rewards.unclaimed}
        builderAddress={snapshot.builderAddress}
        connectedAddress={address ?? null}
        walletClient={walletClient ?? null}
        onSuccess={() => setRefreshTick((n) => n + 1)}
      />

      <StatusBar
        builderAddress={snapshot.builderAddress}
        network={snapshot.network}
        polledAt={snapshot.polledAt}
        error={fetchError}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="sunken"
      style={{
        flex: 1,
        padding: 6,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 10, color: '#808080' }}>{label}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: '2px 6px', color: '#404040' }}>{k}</td>
      <td className="num" style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 700 }}>
        {v}
      </td>
    </tr>
  );
}

function StatusBar({
  builderAddress,
  network,
  polledAt,
  error,
}: {
  builderAddress: string;
  network: string;
  polledAt: string;
  error: string | null;
}) {
  return (
    <div
      className="sunken"
      style={{
        padding: '2px 6px',
        fontSize: 10,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        color: error ? 'var(--w98-red)' : undefined,
      }}
    >
      {error ? (
        <span style={{ flex: 1 }}>
          <b>Error:</b> {error}
        </span>
      ) : (
        <>
          <span>
            builder <span className="num">{formatAddr(builderAddress)}</span>
          </span>
          <span>
            net <b>{network}</b>
          </span>
          <span style={{ marginLeft: 'auto' }}>
            polled <span className="num">{formatTime(polledAt)}</span>
          </span>
        </>
      )}
    </div>
  );
}

function ClaimRewardsPanel({
  unclaimed,
  builderAddress,
  connectedAddress,
  walletClient,
  onSuccess,
}: {
  unclaimed: string;
  builderAddress: string;
  connectedAddress: string | null;
  walletClient: import('viem').WalletClient | null;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const hasUnclaimed = parseFloat(unclaimed) > 0;
  const isBuilder =
    !!connectedAddress &&
    connectedAddress.toLowerCase() === builderAddress.toLowerCase();

  if (!hasUnclaimed) return null;

  async function onClaim() {
    if (!walletClient) return;
    setSubmitting(true);
    setStatus({ kind: 'info', text: 'Sign claimRewards in wallet...' });
    try {
      await claimRewards(walletClient);
      setStatus({ kind: 'ok', text: `Swept $${unclaimed} into perp balance.` });
      onSuccess();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Claim failed' });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && isBuilder && !!walletClient;

  return (
    <div className="fieldset" style={{ margin: 0 }}>
      <div className="fieldset-legend">Claim Rewards</div>
      {status && (
        <div
          style={{
            margin: '4px 0',
            padding: '4px 6px',
            fontSize: 10,
            background:
              status.kind === 'err' ? '#ffd0d0'
              : status.kind === 'ok' ? '#d0ffd0'
              : '#ffffcc',
            border: '1px solid #808080',
            wordBreak: 'break-word',
          }}
        >
          {status.text}
        </div>
      )}
      {!isBuilder && (
        <div style={{ fontSize: 10, color: '#808080', padding: '2px 0', lineHeight: 1.4 }}>
          Connect the builder wallet ({formatAddr(builderAddress)}) to sweep
          unclaimed rewards into its perp balance.
        </div>
      )}
      <button
        className="btn"
        onClick={onClaim}
        disabled={!canSubmit}
        style={{ width: '100%', marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
      >
        {submitting ? 'Submitting...' : `Claim $${formatUsd(unclaimed)}`}
      </button>
    </div>
  );
}
