'use client';

/**
 * Shared TP/SL row used by both M1.6's "Add TP/SL on entry" UX in TradeApp
 * and M2.4's "Set TP/SL on existing position" dialog in PositionsApp. Two
 * inputs side-by-side: trigger price ↔ ROE % (Gain or Loss). The host owns
 * the conversion math (`lib/hyperliquid/tpsl`) — this component is purely
 * presentational so the price/pct stay in sync via the host's effects.
 *
 * Tinted red background flag (`bg`) signals "trigger sits on the wrong
 * side of entry" — host disables submit in that case.
 */
export function TpslRow({
  label,
  priceLabel,
  pctLabel,
  priceValue,
  pctValue,
  bg,
  onPriceChange,
  onPctChange,
}: {
  label: string;
  priceLabel: string;
  pctLabel: string;
  priceValue: string;
  pctValue: string;
  bg?: string;
  onPriceChange: (v: string) => void;
  onPctChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#808080', fontSize: 11 }}>{label}</span>
      <input
        className="input mono"
        value={priceValue}
        onChange={(e) => onPriceChange(e.target.value)}
        placeholder={priceLabel}
        style={{ width: '100%', boxSizing: 'border-box', background: bg }}
      />
      <input
        className="input mono"
        value={pctValue}
        onChange={(e) => onPctChange(e.target.value)}
        placeholder={pctLabel}
        style={{ width: '100%', boxSizing: 'border-box', background: bg }}
      />
    </div>
  );
}
