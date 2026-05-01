'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MarginMode = 'cross' | 'isolated';

interface MarginModeDialogProps {
  coin: string;
  current: MarginMode;
  /**
   * When true the dialog shows a second confirm step after the user picks a
   * different mode — matches Hyperliquid's "you have an open position on
   * {coin}, this will recalc margin" prompt.
   */
  hasOpenPosition: boolean;
  /** Presentation-only — caller issues the updateLeverage(isCross=…) action. */
  onConfirm: (mode: MarginMode) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Win98 Cross/Isolated margin-mode picker. Two-step confirm when switching
 * modes on a coin where the user already has an open position, otherwise
 * a single Confirm button.
 */
export function MarginModeDialog({ coin, current, hasOpenPosition, onConfirm, onClose }: MarginModeDialogProps) {
  const [selected, setSelected] = useState<MarginMode>(current);
  const [stage, setStage] = useState<'pick' | 'confirm'>('pick');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const changed = selected !== current;

  async function doConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Margin mode update failed');
      setSubmitting(false);
    }
  }

  function handlePrimary() {
    if (!changed) {
      onClose();
      return;
    }
    if (hasOpenPosition && stage === 'pick') {
      setStage('confirm');
      return;
    }
    doConfirm();
  }

  const title = stage === 'confirm' ? `Confirm margin change — ${coin}` : `Margin Mode — ${coin}`;
  const primaryLabel = submitting
    ? 'Saving…'
    : !changed
    ? 'OK'
    : hasOpenPosition && stage === 'pick'
    ? 'Continue'
    : 'Confirm';

  const content = (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} style={{ minWidth: 340 }}>
        <div className="titlebar">
          <span className="titlebar-text">{title}</span>
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

        {stage === 'pick' && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
            <div style={{ color: '#808080' }}>Select how margin is allocated for {coin}.</div>

            <RadioRow
              checked={selected === 'cross'}
              onChange={() => setSelected('cross')}
              label="Cross"
              hint="Uses your full perp balance as collateral. Losses on one position can liquidate others."
              disabled={submitting}
            />
            <RadioRow
              checked={selected === 'isolated'}
              onChange={() => setSelected('isolated')}
              label="Isolated"
              hint="Locks a fixed amount of margin to this position. Losses capped at the assigned margin."
              disabled={submitting}
            />

            {error && <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>{error}</div>}
          </div>
        )}

        {stage === 'confirm' && (
          <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 11 }}>
            <svg width={36} height={32} viewBox="0 0 36 32" style={{ flexShrink: 0, marginTop: 2 }}>
              <polygon points="18,2 34,30 2,30" fill="#ffcc00" stroke="#888" strokeWidth="1" />
              <text x="18" y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="#333">!</text>
            </svg>
            <div style={{ lineHeight: 1.4 }}>
              You have an open position on <b>{coin}</b>. Switching to{' '}
              <b>{selected === 'cross' ? 'Cross' : 'Isolated'}</b> will recalculate the margin and
              liquidation price on that position.
              <div style={{ marginTop: 8, color: '#808080' }}>Continue?</div>
              {error && (
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--w98-red)' }}>{error}</div>
              )}
            </div>
          </div>
        )}

        <div className="dialog-buttons">
          {stage === 'confirm' ? (
            <button
              className="btn"
              onClick={() => setStage('pick')}
              disabled={submitting}
              style={{ minWidth: 72 }}
            >
              Back
            </button>
          ) : (
            <button className="btn" onClick={onClose} disabled={submitting} style={{ minWidth: 72 }}>
              Cancel
            </button>
          )}
          <button
            ref={primaryRef}
            className="btn primary"
            onClick={handlePrimary}
            disabled={submitting}
            style={{ minWidth: 72 }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

function RadioRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ marginTop: 2 }}
      />
      <div>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 10, color: '#808080', lineHeight: 1.35 }}>{hint}</div>
      </div>
    </label>
  );
}
