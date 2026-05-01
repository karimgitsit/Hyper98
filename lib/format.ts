/**
 * Shared price formatter used by OrderBook, Trade panel, and the chart.
 * Dynamic precision so sub-dollar assets (DOGE, SHIB) don't render as
 * "0.10" but four-figure assets (BTC) don't drown in trailing zeros.
 *
 * Returns a tier object as well so the lightweight-charts series can
 * derive `priceFormat: { precision, minMove }` without re-deriving from
 * the formatted string.
 */

export interface PriceTier {
  precision: number;
  minMove: number;
}

export function priceTier(n: number): PriceTier {
  const abs = Math.abs(n);
  if (abs >= 10000) return { precision: 0, minMove: 1 };
  if (abs >= 100) return { precision: 1, minMove: 0.1 };
  if (abs >= 1) return { precision: 2, minMove: 0.01 };
  if (abs >= 0.01) return { precision: 4, minMove: 0.0001 };
  return { precision: 6, minMove: 0.000001 };
}

export function formatPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(priceTier(n).precision);
}

/**
 * Compact USD formatter for header readouts (24h Vol, Open Interest).
 * Matches the Hyperliquid header style: $73.9M / $1.24B / $912K.
 */
export function formatCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

/**
 * Compact unit formatter for Open Interest (sized in coin, not USD).
 * 1.24M DOGE / 912K DOGE / 12.3 BTC.
 */
export function formatCompactUnit(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/**
 * Signed percent formatter for 24h change. Always renders sign for
 * non-zero values so the readout is unambiguous next to the green/red
 * tint.
 */
export function formatSignedPct(decimal: number, digits = 2): string {
  if (!Number.isFinite(decimal)) return '—';
  const pct = decimal * 100;
  const fixed = pct.toFixed(digits);
  if (parseFloat(fixed) === 0) return `0.${'0'.repeat(digits)}%`;
  return pct > 0 ? `+${fixed}%` : `${fixed}%`;
}

/**
 * Signed absolute change for 24h delta — uses the same dynamic precision
 * as the price tier so the magnitude is readable.
 */
export function formatSignedPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const tier = priceTier(n);
  const fixed = n.toFixed(tier.precision);
  if (parseFloat(fixed) === 0) return `0.${'0'.repeat(tier.precision)}`;
  return n > 0 ? `+${fixed}` : fixed;
}
