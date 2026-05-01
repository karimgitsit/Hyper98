'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useBalance, useDisconnect, useWalletClient } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useUserStore, selectIsUnifiedAccount, type AbstractionMode, type Hip3DexState } from '@/stores/userStore';
import { useOrdersStore } from '@/stores/ordersStore';
import { info } from '@/lib/hyperliquid/client';
import {
  BRIDGE_ADDRESS,
  BUILDER_ADDRESS,
  IS_TESTNET,
  MIN_DEPOSIT_USDC,
  USDC_ADDRESS,
} from '@/lib/hyperliquid/constants';
import {
  approveBuilderFee,
  withdrawUsdc,
  spotPerpTransfer,
  perpDexTransfer,
  setAbstractionMode,
} from '@/lib/hyperliquid/orders';
import { depositUsdc } from '@/lib/hyperliquid/bridge';
import {
  getAgentStatus,
  getStoredAgentKey,
  createAndApproveAgent,
  clearStoredAgentKey,
  agentAccountFromKey,
  type AgentStatus,
} from '@/lib/hyperliquid/agent';
import { expectDisconnect } from '@/lib/wallet/disconnectTracker';

function truncateAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function isPlaceholder(): boolean {
  return BUILDER_ADDRESS.toLowerCase() === '0x0000000000000000000000000000000000000000';
}

type Tab = 'account' | 'transfer' | 'withdraw' | 'builder' | 'agent';

export function WalletApp({ windowId: _windowId }: { windowId: string }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const marginSummary = useUserStore((s) => s.marginSummary);
  const withdrawable = useUserStore((s) => s.withdrawable);
  const spotBalances = useUserStore((s) => s.spotBalances);
  const positions = useUserStore((s) => s.positions);
  const abstraction = useUserStore((s) => s.abstraction);
  const loading = useUserStore((s) => s.loading);
  const error = useUserStore((s) => s.error);
  const isUnifiedAccount = useUserStore(selectIsUnifiedAccount);
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  const hip3States = useUserStore((s) => s.hip3States);
  const clear = useUserStore((s) => s.clear);
  const openOrders = useOrdersStore((s) => s.openOrders);
  const fetchOpenOrders = useOrdersStore((s) => s.fetchOpenOrders);

  const [tab, setTab] = useState<Tab>('account');
  // When the AccountPanel "Transfer" button on a HIP-3 dex row is clicked
  // we want to jump to the Transfer tab pre-targeted at that dex. Held
  // here so the routing survives the tab switch.
  const [transferPreset, setTransferPreset] = useState<{ from: string; to: string } | null>(null);

  // If the user is on a unified account, the spot<->perp class transfer is
  // irrelevant (balances are merged). Hide the tab, and bounce to Account
  // if the Transfer tab happened to be selected before we learned the mode.
  useEffect(() => {
    if (isUnifiedAccount && tab === 'transfer') {
      setTab('account');
    }
  }, [isUnifiedAccount, tab]);

  useEffect(() => {
    if (!address) {
      clear();
      return;
    }
    fetchUserState(address);
    fetchOpenOrders(address);
    const t = setInterval(() => {
      fetchUserState(address);
      fetchOpenOrders(address);
    }, 15_000);
    return () => clearInterval(t);
  }, [address, fetchUserState, fetchOpenOrders, clear]);

  if (!isConnected) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Wallet.exe</div>
        <div style={{ marginBottom: 16, fontSize: 11, color: '#808080' }}>
          Connect your wallet to view balances and manage your account.
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
      {/* Address bar */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid var(--bevel-dark-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: 'var(--w98-green)', fontSize: 16 }}>{'\u25CF'}</span>
        <span className="mono" style={{ fontSize: 11 }}>{truncateAddr(address!)}</span>
        <button
          className="btn"
          style={{ marginLeft: 'auto', minWidth: 'auto', padding: '2px 8px', fontSize: 10 }}
          onClick={() => {
            expectDisconnect();
            disconnect();
          }}
        >
          Disconnect
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ margin: '4px 4px 0' }}>
        <div className={`tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
          Account
        </div>
        {!isUnifiedAccount && (
          <div className={`tab ${tab === 'transfer' ? 'active' : ''}`} onClick={() => setTab('transfer')}>
            Transfer
          </div>
        )}
        <div className={`tab ${tab === 'withdraw' ? 'active' : ''}`} onClick={() => setTab('withdraw')}>
          Deposit/Withdraw
        </div>
        <div className={`tab ${tab === 'builder' ? 'active' : ''}`} onClick={() => setTab('builder')}>
          Builder Fee
        </div>
        <div className={`tab ${tab === 'agent' ? 'active' : ''}`} onClick={() => setTab('agent')}>
          Agent
        </div>
      </div>

      {error && (
        <div style={{ padding: '4px 8px', color: 'var(--w98-red)', fontSize: 10 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        {tab === 'account' && (
          <AccountPanel
            marginSummary={marginSummary}
            withdrawable={withdrawable}
            spotBalances={spotBalances}
            hip3States={hip3States}
            loading={loading}
            abstraction={abstraction}
            walletAddress={address ?? null}
            walletClient={walletClient ?? null}
            hasPositions={positions.length > 0}
            openOrderCount={openOrders.length}
            onSuccess={() => address && fetchUserState(address, { force: true })}
            onTransferToDex={(dex) => {
              setTransferPreset({ from: '', to: dex });
              setTab('transfer');
            }}
          />
        )}
        {tab === 'transfer' && address && !isUnifiedAccount && (
          <TransferPanel
            walletClient={walletClient ?? null}
            walletAddress={address}
            spotUsdc={spotBalances.find((b) => b.coin === 'USDC')?.total ?? 0}
            perpWithdrawable={withdrawable}
            hip3States={hip3States}
            initialFrom={transferPreset?.from}
            initialTo={transferPreset?.to}
            onConsumePreset={() => setTransferPreset(null)}
            onSuccess={() => fetchUserState(address, { force: true })}
          />
        )}
        {tab === 'withdraw' && address && (
          <>
            <DepositPanel
              walletAddress={address}
              walletClient={walletClient ?? null}
              onSuccess={() => fetchUserState(address)}
            />
            <WithdrawPanel
              walletClient={walletClient ?? null}
              withdrawable={withdrawable}
              onSuccess={() => fetchUserState(address)}
            />
          </>
        )}
        {tab === 'builder' && address && (
          <BuilderPanel
            walletAddress={address}
            walletClient={walletClient ?? null}
          />
        )}
        {tab === 'agent' && address && (
          <AgentPanel
            walletAddress={address}
            walletClient={walletClient ?? null}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '4px 8px',
        borderTop: '1px solid var(--bevel-dark-1)',
        fontSize: 10,
        color: '#808080',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{IS_TESTNET ? 'Testnet' : 'Mainnet'}</span>
        <span>Builder fee: 5 bps</span>
      </div>
    </div>
  );
}

/* ---------- Account panel ---------- */

interface AccountPanelProps {
  marginSummary: { accountValue: number; totalMarginUsed: number } | null;
  withdrawable: number;
  spotBalances: { coin: string; total: number; hold: number }[];
  hip3States: Record<string, Hip3DexState>;
  loading: boolean;
  abstraction: AbstractionMode | null;
  walletAddress: `0x${string}` | null;
  walletClient: import('viem').WalletClient | null;
  hasPositions: boolean;
  openOrderCount: number;
  onSuccess: () => void;
  /** Jump to the Transfer tab pre-targeted to (main perp) \u2192 this dex. */
  onTransferToDex: (dex: string) => void;
}

function AccountPanel({
  marginSummary,
  withdrawable,
  spotBalances,
  hip3States,
  loading,
  abstraction,
  walletAddress,
  walletClient,
  hasPositions,
  openOrderCount,
  onSuccess,
  onTransferToDex,
}: AccountPanelProps) {
  const hip3Entries = Object.entries(hip3States);
  return (
    <div>
      <div className="fieldset">
        <div className="fieldset-legend">Perpetuals Account</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', padding: '4px 0' }}>
          <Label>Account Value</Label>
          <Value>{marginSummary ? '$' + marginSummary.accountValue.toFixed(2) : '\u2014'}</Value>
          <Label>Margin Used</Label>
          <Value>{marginSummary ? '$' + marginSummary.totalMarginUsed.toFixed(2) : '\u2014'}</Value>
          <Label>Withdrawable</Label>
          <Value>{withdrawable > 0 ? '$' + withdrawable.toFixed(2) : '\u2014'}</Value>
        </div>
      </div>

      <AccountModeRow
        abstraction={abstraction}
        walletAddress={walletAddress}
        walletClient={walletClient}
        hasPositions={hasPositions}
        openOrderCount={openOrderCount}
        onSuccess={onSuccess}
      />

      {hip3Entries.length > 0 && (
        <div className="fieldset">
          <div className="fieldset-legend">HIP-3 Dex Balances</div>
          <div className="sunken" style={{ marginTop: 4, maxHeight: 160, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--w98-bg)' }}>
                  <th style={{ textAlign: 'left', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Dex</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Account</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Withdrawable</th>
                  <th style={{ padding: '2px 6px', fontSize: 10, fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {hip3Entries.map(([dex, state]) => (
                  <tr key={dex}>
                    <td style={{ padding: '2px 6px', fontWeight: 700 }} className="mono">{dex}</td>
                    <td className="num" style={{ padding: '2px 6px' }}>${state.marginSummary.accountValue.toFixed(2)}</td>
                    <td className="num" style={{ padding: '2px 6px' }}>${state.withdrawable.toFixed(2)}</td>
                    <td style={{ padding: '2px 6px', textAlign: 'right' }}>
                      <button
                        className="btn"
                        style={{ fontSize: 10, padding: '1px 6px', minWidth: 'auto' }}
                        onClick={() => onTransferToDex(dex)}
                      >
                        Transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: '#808080', padding: '4px 0', lineHeight: 1.4 }}>
            HIP-3 dexes use isolated collateral. Transfer USDC in to trade,
            or back out to free it for main perps or spot.
          </div>
        </div>
      )}

      <div className="fieldset">
        <div className="fieldset-legend">Spot Balances</div>
        <div className="sunken" style={{ marginTop: 4, maxHeight: 160, overflow: 'auto' }}>
          {spotBalances.length === 0 ? (
            <div style={{ padding: 8, color: '#808080', textAlign: 'center' }}>
              {loading ? 'Loading...' : 'No spot balances'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--w98-bg)' }}>
                  <th style={{ textAlign: 'left', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Coin</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>Available</th>
                </tr>
              </thead>
              <tbody>
                {spotBalances.map((b) => (
                  <tr key={b.coin}>
                    <td style={{ padding: '2px 6px', fontWeight: 700 }}>{b.coin}</td>
                    <td className="num" style={{ padding: '2px 6px' }}>{b.total.toFixed(2)}</td>
                    <td className="num" style={{ padding: '2px 6px' }}>{(b.total - b.hold).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Account mode (abstraction) row ---------- */

interface AccountModeRowProps {
  abstraction: AbstractionMode | null;
  walletAddress: `0x${string}` | null;
  walletClient: import('viem').WalletClient | null;
  hasPositions: boolean;
  openOrderCount: number;
  onSuccess: () => void;
}

const ABSTRACTION_LABEL: Record<AbstractionMode, string> = {
  unifiedAccount: 'Unified',
  portfolioMargin: 'Portfolio Margin',
  disabled: 'Classic (disabled)',
  default: 'Default',
  dexAbstraction: 'DEX',
};

function AccountModeRow({
  abstraction,
  walletAddress,
  walletClient,
  hasPositions,
  openOrderCount,
  onSuccess,
}: AccountModeRowProps) {
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const current = abstraction;
  // HL rejects the flip with a non-flat account. Surface the precondition in
  // the UI rather than letting the signed action bounce off the node.
  const flat = !hasPositions && openOrderCount === 0;
  // Offer a flip to whichever mode the user isn't already in. Our primary
  // use case is bouncing users from unified → classic so builder fees work;
  // from classic we offer unified as a reversible action.
  const target: 'disabled' | 'unifiedAccount' =
    current === 'unifiedAccount' ? 'disabled' : 'unifiedAccount';
  const canSubmit = !submitting && flat && !!walletClient && !!walletAddress;

  async function onFlip() {
    if (!walletClient || !walletAddress) return;
    const label = target === 'disabled' ? 'Classic' : 'Unified';
    setSubmitting(true);
    setStatus({ kind: 'info', text: `Switching to ${label} — sign userSetAbstraction in wallet...` });
    try {
      await setAbstractionMode(walletClient, walletAddress, target);
      setStatus({ kind: 'ok', text: `Account mode set to ${label}.` });
      onSuccess();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Mode change failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fieldset">
      <div className="fieldset-legend">Account Mode</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', padding: '4px 0' }}>
        <Label>Current</Label>
        <Value>{current ? ABSTRACTION_LABEL[current] : '\u2014'}</Value>
      </div>
      {!flat && (
        <div style={{ fontSize: 10, color: '#808080', padding: '2px 0', lineHeight: 1.4 }}>
          Close all positions and cancel all open orders to switch modes.
          {hasPositions && ' Positions: open.'}
          {openOrderCount > 0 && ` Open orders: ${openOrderCount}.`}
        </div>
      )}
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
      <button
        className="btn"
        onClick={onFlip}
        disabled={!canSubmit}
        style={{ width: '100%', marginTop: 4, opacity: canSubmit ? 1 : 0.6 }}
      >
        {submitting
          ? 'Submitting...'
          : target === 'disabled'
            ? 'Switch to Classic'
            : 'Switch to Unified'}
      </button>
      <div style={{
        marginTop: 6,
        padding: '6px 8px',
        fontSize: 10,
        background: '#ffffcc',
        border: '1px solid #808080',
        lineHeight: 1.4,
      }}>
        Classic keeps spot and perp balances separate (the traditional
        layout). Unified merges them so spot collateral counts toward perp
        margin. Either mode can trade perps — switch is reversible (requires
        flat positions and no open orders).
      </div>
    </div>
  );
}

/* ---------- Transfer panel (spot, main perp, HIP-3 dexes) ---------- */

interface TransferPanelProps {
  walletClient: import('viem').WalletClient | null;
  walletAddress: `0x${string}`;
  spotUsdc: number;
  perpWithdrawable: number;
  hip3States: Record<string, Hip3DexState>;
  /** Pre-target the From bucket (e.g. from the AccountPanel HIP-3 row). */
  initialFrom?: string;
  /** Pre-target the To bucket. */
  initialTo?: string;
  /** Called once after the panel consumes a preset so it isn't re-applied. */
  onConsumePreset?: () => void;
  onSuccess: () => void;
}

/**
 * Transfer bucket key. Same convention as HL's `sendAsset`:
 *   - `""`     → main USDC perp dex
 *   - `"spot"` → spot balance
 *   - any other string → HIP-3 dex name
 */
type Bucket = string;

function bucketLabel(b: Bucket): string {
  if (b === '') return 'Perp (main)';
  if (b === 'spot') return 'Spot';
  return `HIP-3: ${b}`;
}

function TransferPanel({
  walletClient,
  walletAddress,
  spotUsdc,
  perpWithdrawable,
  hip3States,
  initialFrom,
  initialTo,
  onConsumePreset,
  onSuccess,
}: TransferPanelProps) {
  // Bucket list grows with HIP-3 dexes the user holds collateral on. We
  // always include spot + main perp regardless so users can pre-fund a
  // dex from spot before they hold any balance there.
  const dexNames = Object.keys(hip3States);
  const buckets: Bucket[] = ['spot', '', ...dexNames];

  const [from, setFrom] = useState<Bucket>('spot');
  const [to, setTo] = useState<Bucket>('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  // Apply a preset once (e.g. "transfer to HIP-3 dex foo" from AccountPanel).
  // We intentionally don't re-apply on prop change — the preset is a
  // one-shot navigation hint, not a controlled mode.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current) return;
    if (initialFrom !== undefined) setFrom(initialFrom);
    if (initialTo !== undefined) setTo(initialTo);
    if (initialFrom !== undefined || initialTo !== undefined) {
      presetApplied.current = true;
      onConsumePreset?.();
    }
  }, [initialFrom, initialTo, onConsumePreset]);

  function bucketAvailable(b: Bucket): number {
    if (b === 'spot') return spotUsdc;
    if (b === '') return perpWithdrawable;
    return hip3States[b]?.withdrawable ?? 0;
  }

  const available = bucketAvailable(from);
  const amountNum = parseFloat(amount) || 0;
  const sameBucket = from === to;
  const canSubmit =
    !submitting && !sameBucket && amountNum > 0 && amountNum <= available && !!walletClient;

  function isSpotPerp(a: Bucket, b: Bucket): boolean {
    return (a === 'spot' && b === '') || (a === '' && b === 'spot');
  }

  async function onSubmit() {
    if (!walletClient) return;
    setSubmitting(true);
    setStatus({ kind: 'info', text: 'Sign transfer in wallet...' });
    try {
      if (isSpotPerp(from, to)) {
        // Optimisation: spot ↔ main perp is the ergonomic
        // `usdClassTransfer` on HL. `sendAsset` would also work but
        // `usdClassTransfer` is the canonical action and what every
        // wallet UI shows in the signing prompt.
        await spotPerpTransfer(walletClient, amountNum.toString(), to === '');
      } else {
        // Anything involving a HIP-3 dex (or even spot ↔ HIP-3 in one
        // hop) goes through `sendAsset`. Self-transfer — destination is
        // the user's own wallet.
        await perpDexTransfer(walletClient, {
          amount: amountNum.toString(),
          sourceDex: from,
          destinationDex: to,
          walletAddress,
        });
      }
      setStatus({
        kind: 'ok',
        text: `Transferred $${amountNum.toFixed(2)} ${bucketLabel(from)} → ${bucketLabel(to)}.`,
      });
      setAmount('');
      onSuccess();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Transfer failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="fieldset">
        <div className="fieldset-legend">From → To</div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '4px 8px', padding: '4px 0', alignItems: 'center' }}>
          <Label>From</Label>
          <select
            className="input mono"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ fontSize: 11 }}
          >
            {buckets.map((b) => (
              <option key={'from-' + b} value={b}>
                {bucketLabel(b)} (${bucketAvailable(b).toFixed(2)})
              </option>
            ))}
          </select>
          <Label>To</Label>
          <select
            className="input mono"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ fontSize: 11 }}
          >
            {buckets.map((b) => (
              <option key={'to-' + b} value={b}>
                {bucketLabel(b)}
              </option>
            ))}
          </select>
        </div>
        {sameBucket && (
          <div style={{ fontSize: 10, color: 'var(--w98-red)', padding: '2px 0' }}>
            Source and destination must differ.
          </div>
        )}
      </div>

      <div className="fieldset">
        <div className="fieldset-legend">Amount</div>
        <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#808080' }}>
            Available in {bucketLabel(from)}:{' '}
            <b className="mono">${available.toFixed(2)}</b>
          </div>
          <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', alignItems: 'center', gap: 6 }}>
            <span>Amount (USDC)</span>
            <input
              className="input mono"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              className="btn"
              style={{ fontSize: 10, padding: '2px 6px', minWidth: 'auto' }}
              onClick={() => setAmount(available > 0 ? available.toFixed(2) : '')}
              disabled={available <= 0}
            >
              Max
            </button>
          </label>
          {status && (
            <div
              style={{
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
          <button
            className="btn primary"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.6 }}
          >
            {submitting
              ? 'Transferring...'
              : `Transfer $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
          </button>
        </div>
      </div>

      <div style={{
        marginTop: 4,
        padding: '6px 8px',
        fontSize: 10,
        background: '#ffffcc',
        border: '1px solid #808080',
        lineHeight: 1.4,
      }}>
        Bridge deposits land in spot USDC. Move to Perp (main) to trade
        normal perps; move into a HIP-3 dex to trade builder-deployed
        markets like cash:GOOGL. Transfers are instant and free but
        require a main-wallet signature (agents can&apos;t class-transfer).
      </div>
    </div>
  );
}

/* ---------- Deposit panel ---------- */

interface DepositPanelProps {
  walletAddress: `0x${string}`;
  walletClient: import('viem').WalletClient | null;
  onSuccess: () => void;
}

function DepositPanel({ walletAddress, walletClient, onSuccess }: DepositPanelProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  // Read the user's USDC balance on the bridge's home chain. The wagmi
  // config restricts chains to arbitrum/arbitrumSepolia, so this resolves
  // against the right network without us pinning a chainId here.
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: walletAddress,
    token: USDC_ADDRESS,
  });
  const balance = balanceData ? Number(balanceData.formatted) : 0;

  const amountNum = parseFloat(amount) || 0;
  const belowMin = amountNum > 0 && amountNum < MIN_DEPOSIT_USDC;
  const overBalance = amountNum > balance;
  const canSubmit =
    !submitting && amountNum >= MIN_DEPOSIT_USDC && !overBalance && !!walletClient;

  async function onSubmit() {
    if (!walletClient) return;
    setSubmitting(true);
    setStatus({ kind: 'info', text: 'Sign transfer in wallet...' });
    try {
      const txHash = await depositUsdc(walletClient, amountNum.toString());
      setStatus({
        kind: 'ok',
        text: `Deposit sent (${txHash.slice(0, 10)}...). Will credit your spot balance shortly.`,
      });
      setAmount('');
      void refetchBalance();
      onSuccess();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Deposit failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fieldset">
      <div className="fieldset-legend">Deposit USDC</div>
      <div style={{ padding: '4px 0', fontSize: 11, lineHeight: 1.4 }}>
        Sends USDC on{' '}
        <b>{IS_TESTNET ? 'Arbitrum Sepolia' : 'Arbitrum'}</b> to the
        Hyperliquid bridge. Credits your spot balance in under a minute.
      </div>
      <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: '#808080' }}>Bridge contract</div>
        <div
          className="sunken"
          style={{
            padding: '4px 6px',
            fontFamily: 'var(--w98-font-mono)',
            fontSize: 10,
            userSelect: 'text',
            wordBreak: 'break-all',
          }}
        >
          {BRIDGE_ADDRESS}
        </div>
        <div style={{ fontSize: 10, color: '#808080' }}>
          Your wallet USDC: <b className="mono">${balance.toFixed(2)}</b>
        </div>
        <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', alignItems: 'center', gap: 6 }}>
          <span>Amount (USDC)</span>
          <input
            className="input mono"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            className="btn"
            style={{ fontSize: 10, padding: '2px 6px', minWidth: 'auto' }}
            onClick={() => setAmount(balance > 0 ? balance.toFixed(2) : '')}
            disabled={balance <= 0}
          >
            Max
          </button>
        </label>
        {belowMin && (
          <div
            style={{
              padding: '4px 6px',
              fontSize: 10,
              background: '#ffd0d0',
              border: '1px solid #808080',
              lineHeight: 1.4,
            }}
          >
            Minimum deposit is {MIN_DEPOSIT_USDC} USDC. The HL bridge does not
            credit smaller amounts — they are lost forever.
          </div>
        )}
        {status && (
          <div
            style={{
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
        <button
          className="btn primary"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ opacity: canSubmit ? 1 : 0.6 }}
        >
          {submitting ? 'Submitting...' : `Deposit $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
        </button>
      </div>
    </div>
  );
}

/* ---------- Withdraw panel ---------- */

interface WithdrawPanelProps {
  walletClient: import('viem').WalletClient | null;
  withdrawable: number;
  onSuccess: () => void;
}

function WithdrawPanel({ walletClient, withdrawable, onSuccess }: WithdrawPanelProps) {
  const [destination, setDestination] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const validDest = /^0x[a-fA-F0-9]{40}$/.test(destination);
  const canSubmit = !submitting && validDest && amountNum > 0 && amountNum <= withdrawable && !!walletClient;

  async function onSubmit() {
    if (!walletClient) return;
    setSubmitting(true);
    setStatus({ kind: 'info', text: 'Sign withdrawal in wallet...' });
    try {
      await withdrawUsdc(walletClient, destination as `0x${string}`, amountNum.toString());
      setStatus({ kind: 'ok', text: 'Withdrawal initiated. Funds will arrive on Arbitrum shortly.' });
      setAmount('');
      onSuccess();
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Withdrawal failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="fieldset">
        <div className="fieldset-legend">Withdraw USDC</div>
        <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#808080' }}>
            Available: <b className="mono">${withdrawable.toFixed(2)}</b>
          </div>
          <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 6 }}>
            <span>Destination</span>
            <input
              className="input mono"
              placeholder="0x..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              style={{ fontSize: 10 }}
            />
          </label>
          <label style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', alignItems: 'center', gap: 6 }}>
            <span>Amount (USDC)</span>
            <input
              className="input mono"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              className="btn"
              style={{ fontSize: 10, padding: '2px 6px', minWidth: 'auto' }}
              onClick={() => setAmount(withdrawable > 0 ? withdrawable.toFixed(2) : '')}
              disabled={withdrawable <= 0}
            >
              Max
            </button>
          </label>
          {status && (
            <div
              style={{
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
          <button
            className="btn primary"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.6 }}
          >
            {submitting ? 'Submitting...' : `Withdraw $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Builder fee panel ---------- */

interface BuilderPanelProps {
  walletAddress: `0x${string}`;
  walletClient: import('viem').WalletClient | null;
}

function BuilderPanel({ walletAddress, walletClient }: BuilderPanelProps) {
  // maxBuilderFee returns 0.1bps units (same as `f` in order). e.g. 50 = 5 bps.
  const [approvedUnits, setApprovedUnits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (isPlaceholder()) return;
    setLoading(true);
    info
      .maxBuilderFee({ user: walletAddress, builder: BUILDER_ADDRESS as `0x${string}` })
      .then((v) => setApprovedUnits(v))
      .catch(() => setApprovedUnits(null))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  async function onApprove() {
    if (!walletClient) return;
    setStatus({ kind: 'info', text: 'Sign approval in wallet...' });
    try {
      await approveBuilderFee(walletClient, '0.05%');
      setStatus({ kind: 'ok', text: 'Builder fee approved at 0.05% (5 bps).' });
      // Refresh
      const v = await info.maxBuilderFee({
        user: walletAddress,
        builder: BUILDER_ADDRESS as `0x${string}`,
      });
      setApprovedUnits(v);
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Approval failed' });
    }
  }

  const approvedPct = approvedUnits !== null ? (approvedUnits / 10).toFixed(2) + ' bps' : null;

  return (
    <div>
      <div className="fieldset">
        <div className="fieldset-legend">hyper98 Builder</div>
        <div style={{ padding: '4px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11 }}>
          <Label>Address</Label>
          <Value>
            {isPlaceholder()
              ? <span style={{ color: 'var(--w98-red)' }}>NOT CONFIGURED</span>
              : <span className="mono">{truncateAddr(BUILDER_ADDRESS)}</span>}
          </Value>
          <Label>Fee rate</Label>
          <Value>5 bps (0.05%)</Value>
          <Label>Your approval</Label>
          <Value>
            {isPlaceholder() ? '—'
              : loading ? 'loading...'
              : approvedUnits === null ? 'not approved'
              : approvedPct}
          </Value>
        </div>
      </div>

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

      <button
        className="btn"
        onClick={onApprove}
        disabled={isPlaceholder() || !walletClient}
        style={{ width: '100%', marginTop: 4 }}
      >
        {approvedUnits && approvedUnits >= 50 ? 'Re-approve @ 5 bps' : 'Approve builder fee @ 5 bps'}
      </button>

      <div style={{
        marginTop: 8,
        padding: '6px 8px',
        fontSize: 10,
        background: '#ffffcc',
        border: '1px solid #808080',
        lineHeight: 1.4,
      }}>
        Approval is one-time per builder. You can approve on first trade
        instead — Trade.exe will detect and prompt. Approving here is
        optional but lets you skip the interruption mid-trade.
      </div>
    </div>
  );
}

/* ---------- Agent panel ---------- */

interface AgentPanelProps {
  walletAddress: `0x${string}`;
  walletClient: import('viem').WalletClient | null;
}

function AgentPanel({ walletAddress, walletClient }: AgentPanelProps) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [localAddr, setLocalAddr] = useState<`0x${string}` | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setStatusLoading(true);
    try {
      const s = await getAgentStatus(walletAddress);
      setStatus(s);
      const key = getStoredAgentKey(walletAddress);
      setLocalAddr(key ? agentAccountFromKey(key).address : null);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load agent status' });
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  async function onApprove() {
    if (!walletClient) return;
    setSubmitting(true);
    setMsg({ kind: 'info', text: 'Sign approveAgent in wallet...' });
    try {
      const { address } = await createAndApproveAgent(walletClient, walletAddress);
      setMsg({
        kind: 'ok',
        text: `Agent approved: ${address.slice(0, 6)}...${address.slice(-4)}. Orders will no longer prompt your wallet.`,
      });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Approval failed' });
    } finally {
      setSubmitting(false);
    }
  }

  function onForgetLocal() {
    clearStoredAgentKey(walletAddress);
    setLocalAddr(null);
    setStatus({ approved: false });
    setMsg({ kind: 'info', text: 'Local agent key cleared.' });
  }

  const hasLocal = !!localAddr;
  const approvedForLocal = status?.approved && hasLocal;

  return (
    <div>
      <div className="fieldset">
        <div className="fieldset-legend">Session Agent</div>
        <div style={{ padding: '4px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11 }}>
          <Label>Local key</Label>
          <Value>
            {hasLocal ? <span className="mono">{truncateAddr(localAddr!)}</span> : 'none'}
          </Value>
          <Label>On-chain status</Label>
          <Value>
            {statusLoading
              ? 'loading...'
              : approvedForLocal
                ? <span style={{ color: 'var(--w98-green)' }}>APPROVED</span>
                : hasLocal
                  ? <span style={{ color: 'var(--w98-red)' }}>NOT APPROVED</span>
                  : '\u2014'}
          </Value>
          {approvedForLocal && status?.validUntil && (
            <>
              <Label>Valid until</Label>
              <Value>
                <span className="mono">
                  {new Date(status.validUntil).toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              </Value>
            </>
          )}
          {status?.name && (
            <>
              <Label>Name</Label>
              <Value>{status.name}</Value>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div
          style={{
            margin: '4px 0',
            padding: '4px 6px',
            fontSize: 10,
            background:
              msg.kind === 'err' ? '#ffd0d0'
              : msg.kind === 'ok' ? '#d0ffd0'
              : '#ffffcc',
            border: '1px solid #808080',
            wordBreak: 'break-word',
          }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          className="btn primary"
          onClick={onApprove}
          disabled={submitting || !walletClient}
          style={{ flex: 1 }}
        >
          {submitting
            ? 'Approving...'
            : approvedForLocal
              ? 'Rotate agent'
              : 'Approve agent'}
        </button>
        {hasLocal && (
          <button
            className="btn"
            onClick={onForgetLocal}
            disabled={submitting}
            style={{ minWidth: 'auto', padding: '2px 10px' }}
          >
            Forget
          </button>
        )}
      </div>

      <div style={{
        marginTop: 8,
        padding: '6px 8px',
        fontSize: 10,
        background: '#ffffcc',
        border: '1px solid #808080',
        lineHeight: 1.4,
      }}>
        The agent is a locally-generated key that Hyperliquid lets sign
        orders and cancels on your behalf. It <b>cannot</b> withdraw. Once
        approved, placing a trade stops prompting your wallet. The key is
        stored in this browser only; clearing site data or "Forget" here
        removes it.
      </div>
    </div>
  );
}

/* ---------- shared ---------- */

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#808080' }}>{children}</span>;
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{children}</span>;
}
