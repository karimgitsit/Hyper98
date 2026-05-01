'use client';

/**
 * Hyperliquid "extra agent" (session key) management.
 *
 * An extra agent is a locally-generated keypair that the user authorizes
 * once (via main-wallet signature) to place and cancel orders on their
 * behalf. It cannot withdraw or transfer funds, so keeping the key in
 * localStorage is acceptable — worst case an attacker with access to the
 * key can trade on the user's account until the agent expires. Refresh
 * requires a new main-wallet signature.
 *
 * The key is stored per-owner so switching wallets gets an independent
 * agent.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Account, WalletClient } from 'viem';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { info } from './client';
import { IS_TESTNET } from './constants';

const AGENT_NAME = 'hyper98';

function storageKey(owner: `0x${string}`): string {
  return `hyper98:agent-key:${owner.toLowerCase()}`;
}

export function getStoredAgentKey(owner: `0x${string}`): `0x${string}` | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(owner));
  return raw && /^0x[0-9a-fA-F]{64}$/.test(raw) ? (raw as `0x${string}`) : null;
}

export function storeAgentKey(owner: `0x${string}`, key: `0x${string}`): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(owner), key);
}

export function clearStoredAgentKey(owner: `0x${string}`): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(owner));
}

export function agentAccountFromKey(key: `0x${string}`): Account {
  return privateKeyToAccount(key);
}

export interface AgentStatus {
  /** A key exists locally and Hyperliquid confirms it's currently approved. */
  approved: boolean;
  /** Local agent address — derived from the stored key. Undefined if no key. */
  address?: `0x${string}`;
  /** Name registered with the agent approval. */
  name?: string;
  /** Expiration (ms since epoch). Undefined when not approved. */
  validUntil?: number;
}

/**
 * Read the server-side approval state for the locally-stored agent.
 * Returns { approved: false } when no key is stored OR the stored key is
 * not on the approved list OR the approval has expired.
 */
export async function getAgentStatus(owner: `0x${string}`): Promise<AgentStatus> {
  const key = getStoredAgentKey(owner);
  if (!key) return { approved: false };
  const account = agentAccountFromKey(key);
  const agents = await info.extraAgents({ user: owner });
  const match = agents.find(
    (a) => a.address.toLowerCase() === account.address.toLowerCase()
  );
  if (!match) return { approved: false, address: account.address };
  return {
    approved: match.validUntil > Date.now(),
    address: match.address,
    name: match.name,
    validUntil: match.validUntil,
  };
}

/**
 * Generate a new session key, have the main wallet sign the on-chain
 * `approveAgent` approval, and store the key locally on success. Rejects
 * if the SDK call throws (user rejected signature, network error, etc.) —
 * nothing is persisted in that case.
 */
export async function createAndApproveAgent(
  mainWallet: WalletClient,
  owner: `0x${string}`
): Promise<{ address: `0x${string}` }> {
  const key = generatePrivateKey();
  const account = agentAccountFromKey(key);
  const transport = new HttpTransport({ isTestnet: IS_TESTNET });
  const exchange = new ExchangeClient({
    transport,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet: mainWallet as any,
    isTestnet: IS_TESTNET,
  });
  await exchange.approveAgent({
    agentAddress: account.address,
    agentName: AGENT_NAME,
  });
  // Persist only after the server accepts the approval.
  storeAgentKey(owner, key);
  return { address: account.address };
}

/**
 * Return a usable agent key for `owner`, creating + approving a new one
 * via the main wallet if none exists locally. Order placement on
 * Hyperliquid MUST go through an agent because L1 action signing uses a
 * `domain.chainId: 1337` phantom-agent envelope (HL protocol convention)
 * that MetaMask refuses to sign — its RPC layer rejects EIP-712 whose
 * domain.chainId differs from the wallet's active chain. The agent
 * approval itself is a normal user-signed action with the actual chainId,
 * which MetaMask happily signs; from then on orders are signed by the
 * in-memory agent key with no wallet popup at all.
 *
 * Note: we don't check `getAgentStatus` server-side here because that
 * adds a second round-trip on every trade. If the local key is stale
 * (expired / revoked) the order request will fail at the network level
 * with a recognizable error, and the caller can `clearStoredAgentKey` +
 * retry — which falls back into this same path.
 */
export async function ensureAgentKey(
  mainWallet: WalletClient,
  owner: `0x${string}`,
): Promise<`0x${string}`> {
  const existing = getStoredAgentKey(owner);
  if (existing) return existing;
  await createAndApproveAgent(mainWallet, owner);
  const fresh = getStoredAgentKey(owner);
  if (!fresh) {
    throw new Error('Agent approval succeeded but key was not persisted.');
  }
  return fresh;
}

/**
 * Build an `ExchangeClient` that signs with the agent key — no main-wallet
 * prompt required. Callers in `orders.ts` use this for `order()` /
 * `cancel()` once an agent is approved.
 */
export function buildAgentExchangeClient(key: `0x${string}`): ExchangeClient {
  const account = agentAccountFromKey(key);
  const transport = new HttpTransport({ isTestnet: IS_TESTNET });
  return new ExchangeClient({
    transport,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet: account as any,
    isTestnet: IS_TESTNET,
  });
}
