'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useDexStore } from '@/stores/dexStore';
import { useWindowStore } from '@/stores/windowStore';
import { useUserStore } from '@/stores/userStore';
import { setAbstractionMode } from '@/lib/hyperliquid/orders';
import { Dialog } from '@/components/ui/Dialog';
import { useArrowKeyListNav } from '@/hooks/useArrowKeyListNav';

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function formatPx(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function truncateAddr(a: string): string {
  return a.slice(0, 6) + '...' + a.slice(-4);
}

export function Hip3App({ windowId: _windowId }: { windowId: string }) {
  const dexes = useDexStore((s) => s.dexes);
  const loading = useDexStore((s) => s.loading);
  const error = useDexStore((s) => s.error);
  const loadingAssetsFor = useDexStore((s) => s.loadingAssetsFor);
  const assetsByDex = useDexStore((s) => s.assetsByDex);
  const fetchDexes = useDexStore((s) => s.fetchDexes);
  const fetchDexAssets = useDexStore((s) => s.fetchDexAssets);
  const openWindow = useWindowStore((s) => s.open);
  const focusWindow = useWindowStore((s) => s.focus);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const abstraction = useUserStore((s) => s.abstraction);
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const dexAbstractionEnabled = abstraction === 'dexAbstraction';

  const [selected, setSelected] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  async function enableDexAbstraction() {
    if (!walletClient || !address) return;
    setEnabling(true);
    setEnableError(null);
    try {
      await setAbstractionMode(walletClient, address as `0x${string}`, 'dexAbstraction');
      // Refresh user state to pick up the new mode. fetchUserState
      // re-reads `info.userAbstraction`.
      await fetchUserState(address);
    } catch (e) {
      setEnableError(e instanceof Error ? e.message : 'Failed to enable HIP-3 dex abstraction');
    } finally {
      setEnabling(false);
    }
  }

  function openTrade(dexName: string, coin: string) {
    const current = useWindowStore.getState().windows;
    // Reuse an existing market window for the same HIP-3 pair if open.
    const existing = Object.values(current).find(
      (w) => w.type === 'market' && w.props.coin === coin && w.props.hip3Dex === dexName,
    );
    if (existing) {
      focusWindow(existing.id);
      return;
    }
    const vw = (typeof window !== 'undefined' && window.innerWidth > 0) ? window.innerWidth : 1280;
    const vh = (typeof window !== 'undefined' && window.innerHeight > 0) ? window.innerHeight : 900;
    // Same sizing as MarketsApp's spawn — bigger window leaves room for
    // the bottom panel (orders/fills/funding/balances) beneath the
    // chart/book/trade columns.
    const width = Math.min(1240, Math.max(700, vw - 80));
    const height = Math.min(vh < 700 ? 540 : 820, Math.max(560, vh - 120));
    const x = Math.max(20, Math.floor((vw - width) / 2));
    const y = Math.max(40, Math.floor((vh - height) / 3));
    openWindow('market', {
      title: `Market.exe - ${coin}`,
      props: { coin, kind: 'perps', hip3Dex: dexName },
      x,
      y,
      width,
      height,
    });
  }

  useEffect(() => {
    fetchDexes();
  }, [fetchDexes]);

  useEffect(() => {
    if (selected && !assetsByDex[selected]) {
      fetchDexAssets(selected);
    }
  }, [selected, assetsByDex, fetchDexAssets]);

  const selectedAssets = selected ? assetsByDex[selected] : undefined;
  const selectedDex = selected ? dexes.find((d) => d.name === selected) : undefined;

  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const focusSidebar = () => sidebarRef.current?.focus({ preventScroll: true });
  const dexNav = useArrowKeyListNav({
    items: dexes,
    getId: (d) => d.name,
    selectedId: selected,
    setSelectedId: setSelected,
  });

  const assetsScrollerRef = useRef<HTMLDivElement | null>(null);
  const focusAssetsScroller = () => assetsScrollerRef.current?.focus({ preventScroll: true });
  const assetNav = useArrowKeyListNav({
    items: selectedAssets ?? [],
    getId: (a) => a.coin,
    selectedId: selectedAsset,
    setSelectedId: setSelectedAsset,
    onActivate: (a) => selectedDex && openTrade(selectedDex.name, a.coin),
  });

  useEffect(() => {
    setSelectedAsset(null);
  }, [selected]);

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 11 }}>
      {/* Sidebar — dex list */}
      <div
        ref={sidebarRef}
        className="sunken"
        style={{ width: 180, flexShrink: 0, overflow: 'auto', margin: '4px 0 4px 4px', outline: 'none' }}
        tabIndex={0}
        onKeyDown={dexNav.onKeyDown}
      >
        <div style={{ background: 'var(--w98-bg)', padding: '3px 6px', fontWeight: 700, fontSize: 10, borderBottom: '1px solid var(--bevel-dark-1)' }}>
          HIP-3 Dexes ({dexes.length})
          {loading && ' \u00B7 \u2026'}
        </div>
        {error && (
          <div style={{ padding: 6, color: 'var(--w98-red)', fontSize: 10 }}>{error}</div>
        )}
        {dexes.map((d) => (
          <div
            key={d.name}
            ref={dexNav.setRowRef(d.name)}
            onClick={() => { setSelected(d.name); focusSidebar(); }}
            style={{
              padding: '3px 6px',
              cursor: 'default',
              background: selected === d.name ? 'var(--w98-titlebar-active-start)' : 'transparent',
              color: selected === d.name ? 'var(--w98-white)' : 'inherit',
              fontWeight: selected === d.name ? 700 : 400,
              fontSize: 11,
              borderBottom: '1px dotted #c0c0c0',
            }}
          >
            <div>{d.name}</div>
            <div style={{ fontSize: 9, color: selected === d.name ? '#cce' : '#808080' }}>
              {d.assetCount} asset{d.assetCount !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
        {dexes.length === 0 && !loading && (
          <div style={{ padding: 8, color: '#808080', textAlign: 'center', fontSize: 10 }}>
            No HIP-3 dexes
          </div>
        )}
      </div>

      {/* Detail pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: '4px 4px 4px 4px', minWidth: 0 }}>
        {!selectedDex ? (
          <div style={{ padding: 16, color: '#808080', textAlign: 'center' }}>
            Select a dex from the list to view its markets.
          </div>
        ) : (
          <>
            <div className="fieldset" style={{ marginTop: 0 }}>
              <div className="fieldset-legend">{selectedDex.fullName || selectedDex.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 10 }}>
                <span style={{ color: '#808080' }}>Deployer</span>
                <span className="mono">{truncateAddr(selectedDex.deployer)}</span>
                <span style={{ color: '#808080' }}>Fee recipient</span>
                <span className="mono">{selectedDex.feeRecipient ? truncateAddr(selectedDex.feeRecipient) : '—'}</span>
                <span style={{ color: '#808080' }}>Deployer fee scale</span>
                <span className="mono">{(selectedDex.deployerFeeScale * 100).toFixed(2)}%</span>
              </div>
            </div>

            <div
              ref={assetsScrollerRef}
              className="sunken"
              style={{ flex: 1, marginTop: 6, overflow: 'auto', outline: 'none' }}
              tabIndex={0}
              onKeyDown={assetNav.onKeyDown}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
                    <th style={thStyle}>Coin</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>24h</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Volume</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>OI</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Max Lev</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedAssets ?? []).map((a) => {
                    const isSel = selectedAsset === a.coin;
                    return (
                      <tr
                        key={a.coin}
                        ref={assetNav.setRowRef(a.coin)}
                        onClick={() => { setSelectedAsset(a.coin); focusAssetsScroller(); }}
                        onDoubleClick={() => openTrade(selectedDex.name, a.coin)}
                        style={{
                          cursor: 'var(--click-cursor, default)',
                          background: isSel ? 'var(--w98-titlebar-active-start)' : undefined,
                          color: isSel ? 'var(--w98-white)' : undefined,
                        }}
                      >
                        <td style={{ padding: '2px 6px', fontWeight: 700 }}>{a.coin}</td>
                        <td className="num" style={{ padding: '2px 6px' }}>{formatPx(a.markPx)}</td>
                        <td
                          className={`num ${isSel ? '' : a.change24h >= 0 ? 'green' : 'red'}`}
                          style={{ padding: '2px 6px' }}
                        >
                          {(a.change24h >= 0 ? '+' : '') + (a.change24h * 100).toFixed(2)}%
                        </td>
                        <td className="num" style={{ padding: '2px 6px' }}>${formatNum(a.dayNtlVlm)}</td>
                        <td className="num" style={{ padding: '2px 6px' }}>${formatNum(a.openInterest)}</td>
                        <td className="num" style={{ padding: '2px 6px', color: isSel ? '#cce' : '#808080' }}>{a.maxLeverage}x</td>
                        <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                          <button
                            className="pill-btn"
                            onClick={(e) => { e.stopPropagation(); openTrade(selectedDex.name, a.coin); }}
                            title={`Trade ${a.coin}`}
                            style={{ fontSize: 10, padding: '0 6px' }}
                          >
                            Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!selectedAssets && loadingAssetsFor === selectedDex.name && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>
                        loading {selectedDex.name}...
                      </td>
                    </tr>
                  )}
                  {selectedAssets && selectedAssets.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#808080' }}>
                        No assets
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 6,
                padding: '4px 6px',
                fontSize: 9,
                color: '#404040',
                background: '#ffffcc',
                border: '1px solid #808080',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ flex: 1 }}>
                {dexAbstractionEnabled ? (
                  <>
                    HIP-3 dex abstraction is <b>ON</b>. Orders on any deployer dex
                    pull margin from your main account — no per-dex deposits
                    needed.
                  </>
                ) : (
                  <>
                    HIP-3 markets run on permissionless deployer dexes — each has
                    its own clearinghouse. Enable HIP-3 dex abstraction to let
                    orders here pull margin directly from your main account.
                  </>
                )}
              </span>
              {isConnected && !dexAbstractionEnabled && (
                <button
                  className="btn"
                  onClick={enableDexAbstraction}
                  disabled={enabling || !walletClient}
                  style={{ fontSize: 10, padding: '1px 8px' }}
                  title="One-time wallet signature. Account must have no open positions or open orders."
                >
                  {enabling ? 'Enabling…' : 'Enable abstraction'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {enableError && (
        <Dialog
          icon="error"
          title="Enable abstraction failed"
          body={
            <div style={{ fontSize: 11 }}>
              {enableError}
              <div style={{ marginTop: 6, color: '#808080', fontSize: 10 }}>
                Hyperliquid rejects this call when the account has open positions
                or resting orders. Close everything first and try again.
              </div>
            </div>
          }
          buttons={[{ label: 'OK', onClick: () => setEnableError(null), primary: true, autoFocus: true }]}
          onClose={() => setEnableError(null)}
        />
      )}
    </div>
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
