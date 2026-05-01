/**
 * Revenue snapshot for the builder address.
 *
 * Reads public Hyperliquid info endpoints (no wallet signature required) and
 * returns a normalized shape the admin dashboard can render.
 *
 * Builder fees accrue to a claimable rewards pool exposed via `info.referral`
 * (`unclaimedRewards` + `claimedRewards`). They do NOT land in the builder
 * wallet's perp `accountValue` — that's just the wallet's deposited balance.
 * `portfolio` gives free day/week/month/allTime time-series.
 */

import type { InfoClient } from '@nktkas/hyperliquid';
import { BUILDER_ADDRESS, HL_NETWORK } from './constants';

export interface RevenueSnapshot {
  builderAddress: string;
  network: 'testnet' | 'mainnet';
  configured: true;
  // Builder fees accrue to a claimable rewards pool, NOT directly to the
  // wallet's perp balance. `totalEarned = unclaimed + claimed` is the real
  // revenue number. Verified against mainnet fills on 2026-04-21 —
  // accountValue did not move; referral.unclaimedRewards matched the fill
  // builderFee sum to the cent.
  rewards: {
    totalEarned: string;
    unclaimed: string;
    claimed: string;
    routedVlm: string;
  };
  account: {
    accountValue: string;
    withdrawable: string;
    totalRawUsd: string;
    totalMarginUsed: string;
    openPositionCount: number;
  };
  fees: {
    userCrossRate: string;
    userAddRate: string;
    last7dUserVlm: string;
    last7dExchangeVlm: string;
  };
  history: {
    day: Array<[number, string]>;
    week: Array<[number, string]>;
    month: Array<[number, string]>;
    allTime: Array<[number, string]>;
  };
  polledAt: string;
}

export interface UnconfiguredSnapshot {
  builderAddress: string;
  network: 'testnet' | 'mainnet';
  configured: false;
  reason: string;
  polledAt: string;
}

function isZeroAddress(addr: string): boolean {
  return /^0x0+$/i.test(addr);
}

function sumVlm(entries: { userCross: string; userAdd: string }[]): string {
  let total = 0;
  for (const e of entries) {
    total += parseFloat(e.userCross) + parseFloat(e.userAdd);
  }
  return total.toFixed(2);
}

function sumExchangeVlm(entries: { exchange: string }[]): string {
  let total = 0;
  for (const e of entries) total += parseFloat(e.exchange);
  return total.toFixed(2);
}

export async function getRevenueSnapshot(
  info: InfoClient
): Promise<RevenueSnapshot | UnconfiguredSnapshot> {
  const network = HL_NETWORK;
  const polledAt = new Date().toISOString();

  if (!BUILDER_ADDRESS || isZeroAddress(BUILDER_ADDRESS)) {
    return {
      builderAddress: BUILDER_ADDRESS,
      network,
      configured: false,
      reason:
        'BUILDER_ADDRESS is the zero address. Update lib/hyperliquid/constants.ts.',
      polledAt,
    };
  }

  const user = BUILDER_ADDRESS as `0x${string}`;

  const [clearing, feesData, portfolio, referral] = await Promise.all([
    info.clearinghouseState({ user }),
    info.userFees({ user }),
    info.portfolio({ user }),
    info.referral({ user }),
  ]);

  const unclaimed = parseFloat(referral.unclaimedRewards);
  const claimed = parseFloat(referral.claimedRewards);
  const totalEarned = (unclaimed + claimed).toFixed(6);

  // portfolio is a tuple of [period, data] pairs. Extract by period name.
  const byPeriod: Record<string, { accountValueHistory: [number, string][] }> = {};
  for (const [period, data] of portfolio) {
    byPeriod[period] = data;
  }

  // last 7 entries of dailyUserVlm for a rough "last week" snapshot
  const last7 = feesData.dailyUserVlm.slice(-7);

  return {
    builderAddress: user,
    network,
    configured: true,
    rewards: {
      totalEarned,
      unclaimed: referral.unclaimedRewards,
      claimed: referral.claimedRewards,
      routedVlm: referral.cumVlm,
    },
    account: {
      accountValue: clearing.marginSummary.accountValue,
      withdrawable: clearing.withdrawable,
      totalRawUsd: clearing.marginSummary.totalRawUsd,
      totalMarginUsed: clearing.marginSummary.totalMarginUsed,
      openPositionCount: clearing.assetPositions.length,
    },
    fees: {
      userCrossRate: feesData.userCrossRate,
      userAddRate: feesData.userAddRate,
      last7dUserVlm: sumVlm(last7),
      last7dExchangeVlm: sumExchangeVlm(last7),
    },
    history: {
      day: byPeriod.day?.accountValueHistory ?? [],
      week: byPeriod.week?.accountValueHistory ?? [],
      month: byPeriod.month?.accountValueHistory ?? [],
      allTime: byPeriod.allTime?.accountValueHistory ?? [],
    },
    polledAt,
  };
}
