'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

interface DialogProps {
  title: string;
  body: React.ReactNode;
  buttons: DialogButton[];
  onClose?: () => void;
  icon?: 'error' | 'info' | 'warn' | null;
}

function DialogIcon({ icon }: { icon: NonNullable<DialogProps['icon']> }) {
  if (icon === 'error') {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: '#cc0000', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 700, flexShrink: 0,
      }}>
        ×
      </div>
    );
  }
  if (icon === 'warn') {
    return (
      <svg
        width={32}
        height={32}
        viewBox="0 0 32 32"
        style={{ display: 'block', flexShrink: 0 }}
        aria-hidden
      >
        <polygon
          points="16,3 30,28 2,28"
          fill="#ffcc00"
          stroke="#000"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect x="14.5" y="11" width="3" height="9" rx="0.5" fill="#000" />
        <rect x="14.5" y="22" width="3" height="3" rx="0.5" fill="#000" />
      </svg>
    );
  }
  if (icon === 'info') {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: '#0055cc', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, flexShrink: 0, fontStyle: 'italic',
      }}>
        i
      </div>
    );
  }
  return null;
}

function AutoFocusButton({ btn }: { btn: DialogButton }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (btn.autoFocus) ref.current?.focus();
  }, [btn.autoFocus]);
  return (
    <button
      ref={ref}
      className={`btn${btn.primary ? ' primary' : ''}`}
      onClick={btn.onClick}
      disabled={btn.disabled}
      style={{ minWidth: 72, opacity: btn.disabled ? 0.6 : 1 }}
    >
      {btn.label}
    </button>
  );
}

export function Dialog({ title, body, buttons, onClose, icon }: DialogProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const content = (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="titlebar">
          <span className="titlebar-text">{title}</span>
          {onClose && (
            <div className="titlebar-buttons">
              <button
                className="titlebar-btn"
                onClick={onClose}
                style={{ fontWeight: 'bold' }}
                title="Close"
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div className="dialog-body">
          {icon && <DialogIcon icon={icon} />}
          <div style={{ flex: 1 }}>{body}</div>
        </div>
        <div className="dialog-buttons">
          {buttons.map((btn, i) => (
            <AutoFocusButton key={i} btn={btn} />
          ))}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
