import { NextResponse } from 'next/server';
import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { IS_TESTNET } from '@/lib/hyperliquid/constants';
import { getRevenueSnapshot } from '@/lib/hyperliquid/revenue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const transport = new HttpTransport({ isTestnet: IS_TESTNET });
    const info = new InfoClient({ transport });
    const snapshot = await getRevenueSnapshot(info);
    return NextResponse.json(snapshot, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'revenue_fetch_failed', message },
      { status: 502 }
    );
  }
}
