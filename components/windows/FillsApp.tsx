'use client';

import { useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useOrdersStore, type UserFill } from '@/stores/ordersStore';

function formatPx(n: number): string {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1_000_000) return sign + '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return sign + '$' + (n / 1_000).toFixed(1) + 'K';
  return sign + '$' + n.toFixed(2);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function FillsApp({ windowId: _windowId }: { windowId: string }) {
  const { address, isConnected } = useAccount();

  const fills = useOrdersStore((s) => s.fills);
  const loading = useOrdersStore((s) => s.loadingFills);
  const error = useOrdersStore((s) => s.errorFills);
  const fetchFills = useOrdersStore((s) => s.fetchFills);

  useEffect(() => {
    if (!address) return;
    fetchFills(address);
    const t = setInterval(() => fetchFills(address), 15_000);
    return () => clearInterval(t);
  }, [address, fetchFills]);

  const totals = useMemo(() => {
    let pnl = 0;
    let baseFee = 0;
    let builderFee = 0;
    let volume = 0;
    let hip3Count = 0;
    for (const f of fills) {
      pnl += f.closedPnl;
      baseFee += f.fee - f.builderFee; // "fee" includes builder; subtract to get base
      builderFee += f.builderFee;
      volume += f.px * f.sz;
      // HIP-3 fills carry a `dex:asset` coin name (e.g. "flx:TSLA"),
      // which is the marker used by the API. Used only for the
      // summary chip; per-row rendering picks up the prefix as part
      // of the coin label.
      if (f.coin.includes(':')) hip3Count += 1;
    }
    return { pnl, baseFee, builderFee, volume, hip3Count };
  }, [fills]);

  if (!isConnected) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Fills.exe</div>
        <div style={{ color: '#808080', marginBottom: 16 }}>
          Connect your wallet to view trade history.
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button className="btn primary" onClick={show}>
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      <div style={{
        padding: '4px 6px',
        display: 'flex',
        gap: 12,
        fontSize: 10,
        borderBottom: '1px solid var(--bevel-dark-1)',
        flexWrap: 'wrap',
      }}>
        <span>Volume <b className="mono">{formatUsd(totals.volume).replace('+', '')}</b></span>
        <span>PnL <b className="mono" style={{ color: totals.pnl >= 0 ? 'var(--w98-green)' : 'var(--w98-red)' }}>
          {formatUsd(totals.pnl)}
        </b></span>
        <span>Base fee <b className="mono">${totals.baseFee.toFixed(2)}</b></span>
        <span style={{ color: 'var(--w98-maroon)' }}>Builder fee <b className="mono">${totals.builderFee.toFixed(4)}</b></span>
        <span style={{ marginLeft: 'auto', color: '#808080' }}>
          {fills.length} fill{fills.length !== 1 ? 's' : ''}
          {loading && ' \u00B7 loading...'}
        </span>
        {totals.hip3Count > 0 && (
          <span style={{ color: '#808080' }} title="Fills on HIP-3 deployer dexes">
            HIP-3 <b className="mono">{totals.hip3Count}</b>
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '4px 6px', color: 'var(--w98-red)', fontSize: 10 }}>Error: {error}</div>
      )}

      <div className="sunken" style={{ flex: 1, margin: '0 4px 4px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Coin</th>
              <th style={thStyle}>Dir</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Size</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Closed PnL</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Base fee</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Builder fee</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((f) => (
              <FillRow key={f.hash + f.oid + f.time + f.sz} fill={f} />
            ))}
            {fills.length === 0 && !loading && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>
                  No fills yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FillRow({ fill: f }: { fill: UserFill }) {
  const pnlClass = f.closedPnl >= 0 ? 'green' : 'red';
  const baseFee = f.fee - f.builderFee;
  return (
    <tr>
      <td className="num" style={cellStyle}>{formatTime(f.time)}</td>
      <td style={{ ...cellStyle, fontWeight: 700 }}>{f.coin}</td>
      <td style={cellStyle}>{f.dir}</td>
      <td className="num" style={cellStyle}>{formatPx(f.px)}</td>
      <td className="num" style={cellStyle}>{f.sz}</td>
      <td className={`num ${pnlClass}`} style={cellStyle}>
        {f.closedPnl !== 0 ? formatUsd(f.closedPnl) : '\u2014'}
      </td>
      <td className="num" style={cellStyle}>${baseFee.toFixed(4)}</td>
      <td className="num" style={{ ...cellStyle, color: f.builderFee > 0 ? 'var(--w98-maroon)' : '#808080' }}>
        {f.builderFee > 0 ? '$' + f.builderFee.toFixed(4) : '\u2014'}
      </td>
      <td style={{ ...cellStyle, textAlign: 'center', color: '#808080' }}>
        {f.crossed ? 'T' : 'M'}
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '3px 6px',
  fontWeight: 700,
  fontSize: 10,
  borderBottom: '1px solid var(--bevel-dark-1)',
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  padding: '2px 6px',
  whiteSpace: 'nowrap',
};
