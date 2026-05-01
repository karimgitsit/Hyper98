/**
 * Order placement for Hyperliquid via @nktkas/hyperliquid SDK.
 *
 * All order placement goes through this module — every order must include
 * the builder attribution (`builder: { b: BUILDER_ADDRESS, f: BUILDER_FEE }`).
 * Do not call `exchangeClient.order()` directly from components.
 */

import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { WalletClient } from 'viem';
import { BUILDER_ADDRESS, BUILDER_FEE, IS_TESTNET } from './constants';
import { buildAgentExchangeClient } from './agent';
import { useCrashStore } from '@/stores/crashStore';

/**
 * Decide whether a thrown error is "fatal" enough to trigger BSOD.
 * User-rejection errors (wallet popup dismissed, cancelled signature) are
 * expected UX — they should bubble to the caller as-is with no crash screen.
 */
function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number | string; name?: string; message?: string };
  if (e.code === 4001 || e.code === 'ACTION_REJECTED') return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request');
}

/**
 * Hyperliquid surfaces per-order business errors (builder not approved,
 * insufficient margin, tick-size violations, etc.) via the SDK by throwing
 * with an "Order N: <msg>" prefix. These are *expected* failures the UI
 * should handle — they must NOT trigger the BSOD crash overlay.
 */
function isRecoverableOrderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = ((err as { message?: string }).message ?? '').toLowerCase();
  if (/^order \d+:/.test(msg)) return true;
  if (msg.includes('builder')) return true;
  if (msg.includes('insufficient margin')) return true;
  if (msg.includes('reduce only')) return true;
  if (msg.includes('must divide')) return true;
  if (msg.includes('tick')) return true;
  if (msg.includes('price too')) return true;
  if (msg.includes('size too')) return true;
  return false;
}

function unwrapErrorMessage(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(' ← ') || String(err);
}

function bsodFatal(err: unknown, context: string): never {
  if (!isUserRejection(err) && !isRecoverableOrderError(err)) {
    const msg = unwrapErrorMessage(err);
    if (typeof console !== 'undefined') {
      console.error(`[hyper98] ${context} failed`, err);
    }
    useCrashStore.getState().trigger(
      `${context} failed`,
      `VXD device HYPERLIQUID.VXD reports: ${msg.slice(0, 220)}`
    );
  }
  throw err;
}

// The SDK's `AbstractWallet` type is a union of viem/ethers wallet shapes. wagmi's
// `WalletClient` implements the JSON-RPC account shape at runtime but the types
// diverge (stricter `signTypedData` signature). We cast at the boundary here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkWallet = any;

export type Tif = 'Gtc' | 'Ioc' | 'Alo';

/**
 * Grouping strategy for an order action. Mirrors Hyperliquid's request
 * field — see `@nktkas/hyperliquid` `OrderParameters.grouping`:
 *
 * - `na` — standard, unlinked orders.
 * - `normalTpsl` — TP/SL bracket at fixed size, does not adjust with the
 *   underlying position size.
 * - `positionTpsl` — TP/SL bracket scales with the position size.
 *
 * Hyperliquid's own UI uses `positionTpsl` for both "attach TP/SL on
 * entry" and "set TP/SL on existing position", so this module defaults
 * to that whenever a `triggerOrders` payload is present.
 */
export type OrderGrouping = 'na' | 'normalTpsl' | 'positionTpsl';

/**
 * One leg of a TP/SL bracket. The trigger fires when mark crosses
 * `triggerPx`; the resulting fill is taken at `limitPx` (post-trigger
 * limit) when supplied, otherwise the trigger price doubles as the
 * limit. `isMarket: true` (the default) tells HL to send a
 * FrontendMarket-style aggressive close on trigger.
 */
export interface TriggerSpec {
  /** Trigger price as a string (respect tick size). */
  triggerPx: string;
  /** Default true. */
  isMarket?: boolean;
  /** Optional post-trigger limit price. Defaults to `triggerPx`. */
  limitPx?: string;
}

export interface PlaceOrderInput {
  /** Asset index (universe position). For perps, this is the index into meta.universe. */
  asset: number;
  /** true = buy/long, false = sell/short */
  isBuy: boolean;
  /** Price as a string (respect tick size). For market orders, pass the slippage-protected limit price. */
  price: string;
  /** Size in base units as a string. */
  size: string;
  /** true = reduce-only */
  reduceOnly?: boolean;
  /** 'limit' uses Gtc by default; 'market' uses IoC with FrontendMarket tag. */
  orderType: 'limit' | 'market';
  /** Time-in-force override. Ignored for market orders. */
  tif?: Tif;
  /**
   * Optional TP/SL bracket. When present, both legs are appended to the
   * same signed action as the entry — one wallet/agent signature, one
   * builder attribution. TP/SL legs are always reduce-only on the
   * opposite side of the entry, matching the entry size.
   */
  triggerOrders?: { tp?: TriggerSpec; sl?: TriggerSpec };
  /**
   * Override the grouping strategy. Defaults to `na` for plain orders
   * and `positionTpsl` when `triggerOrders` is set (matches HL's UI).
   */
  grouping?: OrderGrouping;
}

/**
 * SDK order-array element. Mirrors `@nktkas/hyperliquid`'s per-order
 * union — `t` is either a limit envelope or a trigger envelope. Loose
 * `string | number` for the numeric fields matches the SDK's
 * `InferInput` shape so we don't need to coerce.
 *
 * Exported as `OrderEntry` — the M2.4 (set TP/SL on existing position)
 * and M2.5 (Close All batch) flows compose `orders[]` directly via
 * `placeOrders` / `placeOrdersViaAgent` instead of going through the
 * single-order `PlaceOrderInput` shape.
 */
export type OrderEntry =
  | {
      a: number;
      b: boolean;
      p: string;
      s: string;
      r: boolean;
      t: { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket' } };
    }
  | {
      a: number;
      b: boolean;
      p: string;
      s: string;
      r: boolean;
      t: { trigger: { isMarket: boolean; triggerPx: string; tpsl: 'tp' | 'sl' } };
    };

type SdkOrderEntry = OrderEntry;

/**
 * Build the `orders[]` array sent to HL: entry first, then TP, then SL.
 * Brackets are always reduce-only on the opposite side at the entry
 * size — `positionTpsl` grouping then scales them with the position so
 * partial fills don't leave orphan triggers.
 */
function buildOrdersArray(input: PlaceOrderInput): SdkOrderEntry[] {
  const tif: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket' =
    input.orderType === 'market' ? 'FrontendMarket' : (input.tif ?? 'Gtc');

  const entry: SdkOrderEntry = {
    a: input.asset,
    b: input.isBuy,
    p: input.price,
    s: input.size,
    r: input.reduceOnly ?? false,
    t: { limit: { tif } },
  };
  const orders: SdkOrderEntry[] = [entry];

  const tp = input.triggerOrders?.tp;
  if (tp) {
    orders.push({
      a: input.asset,
      b: !input.isBuy,
      p: tp.limitPx ?? tp.triggerPx,
      s: input.size,
      r: true,
      t: { trigger: { isMarket: tp.isMarket ?? true, triggerPx: tp.triggerPx, tpsl: 'tp' } },
    });
  }

  const sl = input.triggerOrders?.sl;
  if (sl) {
    orders.push({
      a: input.asset,
      b: !input.isBuy,
      p: sl.limitPx ?? sl.triggerPx,
      s: input.size,
      r: true,
      t: { trigger: { isMarket: sl.isMarket ?? true, triggerPx: sl.triggerPx, tpsl: 'sl' } },
    });
  }

  return orders;
}

function effectiveGrouping(input: PlaceOrderInput): OrderGrouping {
  if (input.grouping) return input.grouping;
  const hasTrigger = !!(input.triggerOrders?.tp || input.triggerOrders?.sl);
  return hasTrigger ? 'positionTpsl' : 'na';
}

function assertBuilderConfigured(): void {
  if (
    !BUILDER_ADDRESS ||
    BUILDER_ADDRESS.toLowerCase() === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      'Builder address is not configured. Set BUILDER_ADDRESS in lib/hyperliquid/constants.ts before placing live orders.'
    );
  }
}

function buildClient(wallet: WalletClient): ExchangeClient {
  const transport = new HttpTransport({ isTestnet: IS_TESTNET });
  return new ExchangeClient({
    transport,
    wallet: wallet as SdkWallet,
    isTestnet: IS_TESTNET,
  });
}

/**
 * Place a single order with builder attribution. Returns the SDK response;
 * callers should inspect `response.response.data.statuses` to determine
 * fill / resting / error.
 */
export async function placeOrder(wallet: WalletClient, input: PlaceOrderInput) {
  assertBuilderConfigured();
  const exchange = buildClient(wallet);

  try {
    return await exchange.order({
      orders: buildOrdersArray(input),
      grouping: effectiveGrouping(input),
      builder: { b: BUILDER_ADDRESS as `0x${string}`, f: BUILDER_FEE },
    });
  } catch (err) {
    bsodFatal(err, 'Order placement');
  }
}

/**
 * Place a single order signed by an agent (session) key. No main-wallet
 * prompt. The agent must have been previously approved via
 * `agent.createAndApproveAgent`. Otherwise HL will reject the order.
 */
export async function placeOrderViaAgent(
  agentKey: `0x${string}`,
  input: PlaceOrderInput
) {
  assertBuilderConfigured();
  const exchange = buildAgentExchangeClient(agentKey);

  try {
    return await exchange.order({
      orders: buildOrdersArray(input),
      grouping: effectiveGrouping(input),
      builder: { b: BUILDER_ADDRESS as `0x${string}`, f: BUILDER_FEE },
    });
  } catch (err) {
    bsodFatal(err, 'Order placement');
  }
}

/**
 * Approve the hyper98 builder fee at a given max rate. Called on first
 * trade attempt, not on wallet connect.
 *
 * The SDK's `approveBuilderFee` is typed `Promise<SuccessResponse>` and its
 * internal `assertSuccessResponse` throws `ApiRequestError` on err shapes.
 * We still validate the returned shape defensively so a future SDK
 * regression doesn't leave the UI stuck on "Submitting..." waiting for a
 * throw that never comes. A real HL success returns `{status:'ok',response:...}`.
 */
export async function approveBuilderFee(
  wallet: WalletClient,
  maxFeeRate: `${string}%` = '0.05%'
) {
  assertBuilderConfigured();
  const exchange = buildClient(wallet);
  const response = await exchange.approveBuilderFee({
    builder: BUILDER_ADDRESS as `0x${string}`,
    maxFeeRate,
  });
  const status = (response as { status?: string } | null)?.status;
  if (status !== 'ok') {
    const detail =
      (response as { response?: unknown } | null)?.response ??
      'approveBuilderFee returned a non-ok response';
    throw new Error(
      `Builder fee approval rejected: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
    );
  }
  return response;
}

/**
 * Place a pre-built `orders[]` array with builder attribution. Used by
 * call-paths that need fine control over the array — TP/SL replacement
 * on an existing position (trigger-only legs, no entry) and Close All
 * (mixed-asset reduce-only batch). Single-order callers should keep
 * using `placeOrder` for ergonomics.
 */
export async function placeOrders(
  wallet: WalletClient,
  orders: OrderEntry[],
  grouping: OrderGrouping = 'na',
) {
  assertBuilderConfigured();
  const exchange = buildClient(wallet);
  try {
    return await exchange.order({
      orders,
      grouping,
      builder: { b: BUILDER_ADDRESS as `0x${string}`, f: BUILDER_FEE },
    });
  } catch (err) {
    bsodFatal(err, 'Order placement');
  }
}

/**
 * Place a pre-built `orders[]` array via an agent (session) key. No
 * main-wallet prompt.
 */
export async function placeOrdersViaAgent(
  agentKey: `0x${string}`,
  orders: OrderEntry[],
  grouping: OrderGrouping = 'na',
) {
  assertBuilderConfigured();
  const exchange = buildAgentExchangeClient(agentKey);
  try {
    return await exchange.order({
      orders,
      grouping,
      builder: { b: BUILDER_ADDRESS as `0x${string}`, f: BUILDER_FEE },
    });
  } catch (err) {
    bsodFatal(err, 'Order placement');
  }
}

/**
 * Build a single trigger-leg `OrderEntry` for a TP or SL. Reduce-only by
 * construction. Used by M2.4's "Set TP/SL on existing position" flow,
 * which omits the entry leg M0's `buildOrdersArray` always emits.
 */
export function buildTriggerEntry(args: {
  asset: number;
  /** true = the trigger fires a buy (closing a short); false = sell (closing a long). */
  isBuy: boolean;
  /** Coin-size string at szDecimals precision. */
  size: string;
  triggerPx: string;
  tpsl: 'tp' | 'sl';
  /** Default true — aggressive market on trigger. */
  isMarket?: boolean;
  /** Optional post-trigger limit price; defaults to triggerPx. */
  limitPx?: string;
}): OrderEntry {
  return {
    a: args.asset,
    b: args.isBuy,
    p: args.limitPx ?? args.triggerPx,
    s: args.size,
    r: true,
    t: {
      trigger: {
        isMarket: args.isMarket ?? true,
        triggerPx: args.triggerPx,
        tpsl: args.tpsl,
      },
    },
  };
}

/**
 * Build a single limit `OrderEntry`. Used by Close All (M2.5) which
 * places a flat aggressive-limit IOC for each open position in one
 * signed action.
 */
export function buildLimitEntry(args: {
  asset: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly: boolean;
  tif?: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket';
}): OrderEntry {
  return {
    a: args.asset,
    b: args.isBuy,
    p: args.price,
    s: args.size,
    r: args.reduceOnly,
    t: { limit: { tif: args.tif ?? 'Gtc' } },
  };
}

/**
 * Cancel an order by oid.
 */
export async function cancelOrder(
  wallet: WalletClient,
  asset: number,
  oid: number
) {
  const exchange = buildClient(wallet);
  return exchange.cancel({
    cancels: [{ a: asset, o: oid }],
  });
}

/**
 * Cancel an order by oid, signed by an agent key. No main-wallet prompt.
 */
export async function cancelOrderViaAgent(
  agentKey: `0x${string}`,
  asset: number,
  oid: number
) {
  const exchange = buildAgentExchangeClient(agentKey);
  return exchange.cancel({
    cancels: [{ a: asset, o: oid }],
  });
}

/**
 * Cancel multiple orders in one signed action. Each entry is `{asset,
 * oid}`. Used by M2.4's "Set TP/SL on existing position" flow when
 * there are existing bracket legs to replace — one signature replaces
 * N legs, regardless of asset count.
 */
export async function cancelOrders(
  wallet: WalletClient,
  cancels: Array<{ asset: number; oid: number }>,
) {
  const exchange = buildClient(wallet);
  return exchange.cancel({
    cancels: cancels.map((c) => ({ a: c.asset, o: c.oid })),
  });
}

export async function cancelOrdersViaAgent(
  agentKey: `0x${string}`,
  cancels: Array<{ asset: number; oid: number }>,
) {
  const exchange = buildAgentExchangeClient(agentKey);
  return exchange.cancel({
    cancels: cancels.map((c) => ({ a: c.asset, o: c.oid })),
  });
}

/**
 * Builder-fee approval retry helper, promoted from `PositionsApp.tsx`'s
 * `submitCloseOrder` so M2.5 (Close All batch) and M2.4 (Set TP/SL)
 * share the same retry shape as M2.1/M2.2.
 *
 * Two-stage retry mirroring `TradeApp.tsx:onSubmit`:
 * 1. Try `buildAndSend()`.
 * 2. If it throws with "builder" in the message, the builder fee isn't
 *    yet approved. Approval *must* be signed by the main wallet (agents
 *    can't approveBuilderFee), so we prompt for that, then retry.
 * 3. If the order succeeds at the network level but any per-order
 *    status carries a "builder" error, run the same retry path.
 *
 * After the retry, surface the first non-recoverable per-order error to
 * the caller as `Error(...)` — so the existing dialog-and-row error
 * paths in PositionsApp keep working unchanged.
 *
 * `walletClient` is required only when a builder-fee approval is
 * actually needed. The happy path through an agent key never touches
 * it.
 */
export type OrderResponseLike = {
  response?: { data?: { statuses?: unknown[] } };
} | undefined;

function statusError(s: unknown): string | null {
  if (s && typeof s === 'object' && 'error' in s) {
    const e = (s as { error?: unknown }).error;
    return e ? String(e) : null;
  }
  return null;
}

function statusIsSuccess(s: unknown): boolean {
  if (!s) return false;
  if (typeof s === 'string') {
    return s === 'waitingForFill' || s === 'waitingForTrigger';
  }
  if (typeof s === 'object') {
    return 'resting' in s || 'filled' in s;
  }
  return false;
}

export async function submitOrderWithBuilderFeeRetry({
  walletClient,
  buildAndSend,
}: {
  walletClient: WalletClient | undefined;
  buildAndSend: () => Promise<OrderResponseLike>;
}): Promise<OrderResponseLike> {
  async function ensureBuilderApproved(): Promise<void> {
    if (!walletClient) {
      throw new Error('Builder fee approval requires the main wallet — reconnect to approve.');
    }
    await approveBuilderFee(walletClient, '0.05%');
  }

  let res: OrderResponseLike;
  try {
    res = await buildAndSend();
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    if (!/builder/i.test(errStr)) throw err;
    await ensureBuilderApproved();
    res = await buildAndSend();
  }

  const statuses = res?.response?.data?.statuses ?? [];

  // Look for a builder-fee error across all legs. Only retry the
  // whole closure if (a) at least one leg has a builder error AND
  // (b) NO leg already succeeded — otherwise re-sending would
  // duplicate the resting/filled legs. In the partial-success case
  // we fall through and surface the builder error to the caller as
  // a regular per-leg error, and the user can retry whatever
  // didn't fill via the row UI.
  const hasBuilderErr = statuses.some(
    (s) => /builder/i.test(statusError(s) ?? ''),
  );
  const hasSuccess = statuses.some(statusIsSuccess);
  if (hasBuilderErr && !hasSuccess) {
    await ensureBuilderApproved();
    res = await buildAndSend();
  }

  // Aggregate every per-leg error to the caller. Close All sends N
  // legs and a "first leg only" message would silently drop info
  // about the others. Caller's try/catch routes it to the row-level
  // Win98 error dialog.
  const finalStatuses = res?.response?.data?.statuses ?? [];
  const errors: string[] = [];
  for (const s of finalStatuses) {
    const e = statusError(s);
    if (e) errors.push(e);
  }
  if (errors.length === 1) {
    throw new Error(errors[0]);
  }
  if (errors.length > 1) {
    const successCount = finalStatuses.filter(statusIsSuccess).length;
    const head = successCount > 0
      ? `${successCount} succeeded, ${errors.length} errored: `
      : `${errors.length} errors: `;
    throw new Error(head + errors.join(' · '));
  }

  return res;
}

/**
 * Withdraw USDC from the Hyperliquid perp account to an external address
 * on Arbitrum. Uses `withdraw3`. Amount is a string — 1 = $1.
 */
export async function withdrawUsdc(
  wallet: WalletClient,
  destination: `0x${string}`,
  amount: string
) {
  const exchange = buildClient(wallet);
  return exchange.withdraw3({
    destination,
    amount,
  });
}

/**
 * Transfer USDC between the Hyperliquid spot and perp accounts for the
 * signer. `toPerp: true` moves spot → perp (needed before trading perps).
 * Amount is a string — 1 = $1. Requires the main wallet signature;
 * agents cannot perform class transfers.
 */
export async function spotPerpTransfer(
  wallet: WalletClient,
  amount: string,
  toPerp: boolean
) {
  const exchange = buildClient(wallet);
  return exchange.usdClassTransfer({ amount, toPerp });
}

/**
 * Transfer USDC between any pair of the user's own balances: main perp dex,
 * spot, or any HIP-3 deployer dex. Powers the Wallet's HIP-3 transfer panel
 * and the inline "Transfer from main perps" action on the HIP-3
 * insufficient-margin dialog.
 *
 * Source/destination conventions match HL's `sendAsset` action:
 *   - `""`     → main USDC perp dex
 *   - `"spot"` → spot balance
 *   - any other string → HIP-3 dex name (e.g. `"cash"`)
 *
 * `walletAddress` is the user's own address; `sendAsset` uses it as the
 * `destination` because we're moving funds between buckets the same wallet
 * owns. Agents cannot sign `sendAsset` — same constraint as other class
 * transfers.
 */
export async function perpDexTransfer(
  wallet: WalletClient,
  args: {
    amount: string;
    sourceDex: string;
    destinationDex: string;
    walletAddress: `0x${string}`;
  },
) {
  const exchange = buildClient(wallet);
  return exchange.sendAsset({
    destination: args.walletAddress,
    sourceDex: args.sourceDex,
    destinationDex: args.destinationDex,
    token: 'USDC',
    amount: args.amount,
    fromSubAccount: '',
  });
}

/**
 * Sweep builder-code referral rewards from `info.referral.unclaimedRewards`
 * into the signer's perp `accountValue`. Must be signed by the builder
 * wallet itself (the address the rewards accrue to) — HL rejects the call
 * from any other signer.
 */
export async function claimRewards(wallet: WalletClient) {
  const exchange = buildClient(wallet);
  return exchange.claimRewards();
}

/**
 * Flip the user's HL account abstraction mode (classic/unified/portfolio/
 * dex). Requires a main-wallet signature. HL rejects the call unless the
 * user has zero open positions and zero open orders, so callers must gate
 * the UI on those preconditions.
 */
export async function setAbstractionMode(
  wallet: WalletClient,
  user: `0x${string}`,
  abstraction: 'disabled' | 'unifiedAccount' | 'portfolioMargin' | 'dexAbstraction',
) {
  const exchange = buildClient(wallet);
  return exchange.userSetAbstraction({ user, abstraction });
}

export async function updateLeverage(
  wallet: WalletClient,
  asset: number,
  leverage: number,
  isCross = true
) {
  const exchange = buildClient(wallet);
  return exchange.updateLeverage({ asset, isCross, leverage });
}

export async function updateLeverageViaAgent(
  agentKey: `0x${string}`,
  asset: number,
  leverage: number,
  isCross = true
) {
  const exchange = buildAgentExchangeClient(agentKey);
  return exchange.updateLeverage({ asset, isCross, leverage });
}

/**
 * Compute a slippage-protected limit price for a "market" order.
 * Hyperliquid requires market orders to be sent as aggressive limit orders.
 * We default to 1% through the book; refine once we have a slippage setting.
 */
export function marketPrice(markPx: number, isBuy: boolean, slippagePct = 0.01): number {
  return isBuy ? markPx * (1 + slippagePct) : markPx * (1 - slippagePct);
}

/**
 * Round a price to the appropriate tick size. Hyperliquid uses 5 sig figs
 * by default for perp prices.
 */
export function roundPrice(px: number, szDecimals: number): string {
  // Perps: max 5 significant figures OR the asset's szDecimals, whichever is tighter.
  // Max decimals for px = 6 - szDecimals (perps) per HL docs.
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const sigFigs = 5;
  const magnitude = Math.floor(Math.log10(Math.abs(px)));
  const decimalsBySig = Math.max(0, sigFigs - magnitude - 1);
  const decimals = Math.min(maxDecimals, decimalsBySig);
  return px.toFixed(decimals);
}

/**
 * Round a size to szDecimals.
 */
export function roundSize(sz: number, szDecimals: number): string {
  return sz.toFixed(szDecimals);
}

/**
 * Compute builder fee for an order in USD. Used for the fee preview.
 * BUILDER_FEE is in 0.1 bps units — 50 = 5 bps = 0.05%.
 */
export function builderFeeUsd(notionalUsd: number): number {
  return notionalUsd * (BUILDER_FEE / 100_000);
}

/**
 * Hyperliquid VIP 0 base fees for preview purposes.
 * Actual fees depend on account VIP tier.
 */
export function baseFeeUsd(notionalUsd: number, isMaker: boolean): number {
  const rate = isMaker ? 0.00015 : 0.00045; // 1.5 bps maker, 4.5 bps taker
  return notionalUsd * rate;
}
