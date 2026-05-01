'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface LeverageDialogProps {
  coin: string;
  maxLeverage: number;
  current: number;
  /** Presentation-only: caller performs the actual updateLeverage call. */
  onConfirm: (leverage: number) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Win98 Adjust-Leverage modal. Slider 1→maxLev with a numeric mirror input
 * and a yellow-triangle liq-risk warning when the chosen leverage is within
 * 20% of the asset cap. Presentation-only — the caller is responsible for
 * issuing the HL `updateLeverage` action.
 */
export function LeverageDialog({ coin, maxLeverage, current, onConfirm, onClose }: LeverageDialogProps) {
  const [selected, setSelected] = useState<number>(clamp(current, 1, maxLeverage));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const riskThreshold = Math.max(1, Math.floor(maxLeverage * 0.8));
  const highRisk = selected >= riskThreshold;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Leverage update failed');
      setSubmitting(false);
    }
  }

  const content = (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} style={{ minWidth: 340 }}>
        <div className="titlebar">
          <span className="titlebar-text">Adjust Leverage — {coin}</span>
          <div className="titlebar-buttons">
            <button
              className="titlebar-btn"
              onClick={onClose}
              disabled={submitting}
              style={{ fontWeight: 'bold' }}
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#808080' }}>Leverage</span>
            <input
              className="input mono"
              type="number"
              min={1}
              max={maxLeverage}
              step={1}
              value={selected}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setSelected(clamp(n, 1, maxLeverage));
              }}
              style={{ width: 60, textAlign: 'right' }}
              disabled={submitting}
            />
            <span style={{ fontWeight: 700 }}>x</span>
            <span style={{ marginLeft: 'auto', color: '#808080', fontSize: 10 }}>
              Max {maxLeverage}x
            </span>
          </div>

          <div>
            <input
              type="range"
              className="trackbar"
              min={1}
              max={maxLeverage}
              step={1}
              value={selected}
              onChange={(e) => setSelected(parseInt(e.target.value, 10))}
              disabled={submitting}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: '#808080',
                padding: '0 2px',
                marginTop: 2,
              }}
              className="mono"
            >
              <span>1x</span>
              <span>{Math.max(2, Math.ceil(maxLeverage / 2))}x</span>
              <span>{maxLeverage}x</span>
            </div>
          </div>

          {highRisk && (
            <div
              className="sunken"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: 8,
                background: '#fff8c4',
              }}
            >
              <svg width={28} height={24} viewBox="0 0 36 32" style={{ flexShrink: 0 }}>
                <polygon points="18,2 34,30 2,30" fill="#ffcc00" stroke="#888" strokeWidth="1" />
                <text x="18" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#333">!</text>
              </svg>
              <div style={{ fontSize: 10, lineHeight: 1.35 }}>
                High leverage — small adverse moves may trigger liquidation. Liq. price on any new
                position will sit very close to entry.
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>{error}</div>
          )}
        </div>

        <div className="dialog-buttons">
          <button className="btn" onClick={onClose} disabled={submitting} style={{ minWidth: 72 }}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className="btn primary"
            onClick={handleConfirm}
            disabled={submitting}
            style={{ minWidth: 72 }}
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
