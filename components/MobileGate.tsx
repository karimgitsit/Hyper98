'use client';

import { useEffect, useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const BYPASS_KEY = 'hyper98:mobile-bypass';

export function MobileGate() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [bypassed, setBypassed] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBypassed(localStorage.getItem(BYPASS_KEY) === '1');
  }, []);

  if (isMobile !== true || bypassed !== false) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // ignore — older browsers / non-secure contexts
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleBypass = (e: React.MouseEvent) => {
    e.preventDefault();
    localStorage.setItem(BYPASS_KEY, '1');
    setBypassed(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--w98-font)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          background: 'rgba(0, 0, 0, 0.5)',
        }}
      />
      <div
        className="window"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 320,
        }}
      >
        <div className="window-inner">
          <div className="titlebar">
            <span className="titlebar-text">Hyper98 — Desktop Required</span>
          </div>
          <div
            style={{
              padding: '20px 18px 16px',
              background: 'var(--w98-bg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
              🖥️
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                textAlign: 'center',
                color: 'var(--w98-black)',
              }}
            >
              Open on desktop
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                lineHeight: 1.45,
                textAlign: 'center',
                color: 'var(--w98-black)',
              }}
            >
              Hyper98 is a windowed trading desk that needs a bigger screen.
              Send this link to yourself and open it on your computer.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={handleCopy}
              style={{ width: '100%', marginTop: 8, padding: '6px 10px' }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <a
              href="#"
              onClick={handleBypass}
              style={{
                marginTop: 4,
                fontSize: 11,
                color: 'var(--w98-link)',
                textDecoration: 'underline',
              }}
            >
              Continue anyway
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
