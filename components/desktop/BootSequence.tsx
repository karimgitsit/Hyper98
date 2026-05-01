'use client';

import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/lib/sounds/SoundManager';

type Phase = 'bios' | 'splash' | 'done';

interface BootLine {
  text: string;
  delay: number;
  highlight?: 'ok' | 'warn';
}

const BIOS_HEADER = [
  'HYPER98 BIOS v4.1.24 (C) 1998-2026 Hyper Industries, Inc.',
  'Main Processor : Hyperliquid L1 @ 0.2s block time',
  'Memory Testing : 655360 OK',
  '',
];

function buildBiosScript(hasWallet: boolean, walletName: string): BootLine[] {
  const lines: BootLine[] = [];
  let t = 200;
  BIOS_HEADER.forEach((text) => {
    t += text === '' ? 80 : 160;
    lines.push({ text, delay: t });
  });
  const steps: [string, number, BootLine['highlight']?][] = [
    ['Detecting Primary IDE Master  ... HYPERLIQUID-SPOT', 200],
    ['Detecting Primary IDE Slave   ... HYPERLIQUID-PERP', 200],
    ['Detecting Secondary IDE Master ... HIP-3 MARKETS',   220],
    ['Detecting USB Device           ... ' + (hasWallet ? walletName.toUpperCase() : 'NONE FOUND'),
      260, hasWallet ? 'ok' : 'warn'],
    ['Verifying builder code 0x0b1d…f4ee ... [ OK ]', 260, 'ok'],
    ['Checking Hyperliquid WebSocket  ... [ OK ]', 220, 'ok'],
    ['', 80],
    ['Press DEL to enter SETUP, ESC to skip', 60],
    ['Booting from HYPERLIQUID-PERP ...', 300],
  ];
  steps.forEach(([text, d, hl]) => {
    t += d;
    lines.push({ text, delay: t, highlight: hl });
  });
  return lines;
}

interface BootSequenceProps {
  onComplete: () => void;
  quickResume?: boolean;
}

export function BootSequence({ onComplete, quickResume = false }: BootSequenceProps) {
  const [phase, setPhase] = useState<Phase>(quickResume ? 'splash' : 'bios');
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const hasWallet = typeof window !== 'undefined' &&
    Boolean((window as unknown as { ethereum?: unknown }).ethereum);
  const walletName = (() => {
    if (typeof window === 'undefined') return 'wallet';
    const eth = (window as unknown as {
      ethereum?: { isMetaMask?: boolean; isPhantom?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean };
    }).ethereum;
    if (!eth) return 'wallet';
    if (eth.isMetaMask) return 'MetaMask';
    if (eth.isPhantom) return 'Phantom';
    if (eth.isRabby) return 'Rabby';
    if (eth.isCoinbaseWallet) return 'Coinbase';
    return 'Wallet';
  })();

  const biosLines = useRef(buildBiosScript(hasWallet, walletName));

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    onComplete();
  };

  const handleRootClick = () => {
    if (doneRef.current) return;
    if (phase === 'bios') {
      setPhase('splash');
    } else {
      finish();
    }
  };

  useEffect(() => {
    if (phase !== 'bios') return;
    const timers: number[] = [];
    biosLines.current.forEach((line, i) => {
      const id = window.setTimeout(() => setVisibleLines(i + 1), line.delay);
      timers.push(id);
    });
    const lastDelay = biosLines.current[biosLines.current.length - 1]?.delay ?? 1800;
    const advance = window.setTimeout(() => setPhase('splash'), lastDelay + 400);
    timers.push(advance);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase]);

  useEffect(() => {
    if (phase !== 'splash') return;
    playSound('tada');
    const total = quickResume ? 1400 : 2800;
    const start = Date.now();
    const iv = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / total);
      setProgress(p);
      if (p >= 1) {
        window.clearInterval(iv);
        setReady(true);
      }
    }, 40);
    return () => window.clearInterval(iv);
  }, [phase, quickResume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (doneRef.current) return;
      if (e.key === 'Escape') {
        finish();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'bios') setPhase('splash');
        else if (ready) finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (phase === 'done') return null;

  return (
    <div className="boot-root" onClick={handleRootClick} role="presentation">
      {phase === 'bios' && (
        <div className="boot-bios">
          <pre className="boot-bios-pre">
            {biosLines.current.slice(0, visibleLines).map((line, i) => (
              <div key={i} className={line.highlight ? `boot-bios-line boot-bios-${line.highlight}` : 'boot-bios-line'}>
                {line.text || '\u00A0'}
              </div>
            ))}
            <span className="boot-bios-caret">_</span>
          </pre>
          <div className="boot-bios-hint">Click or press ESC to skip</div>
        </div>
      )}

      {phase === 'splash' && (
        <div className="boot-splash">
          <div className="boot-splash-inner">
            <div className="boot-splash-logo">
              <span className="boot-splash-logo-main">hyper</span>
              <span className="boot-splash-logo-98">98</span>
            </div>
            <div className="boot-splash-tag">
              {ready ? 'Ready.' : 'Starting hyper98...'}
            </div>
            <div className="boot-splash-bar">
              <div className="boot-splash-bar-inner" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="boot-splash-copy">Trade Hyperliquid like it&apos;s 1998.</div>
            <div className="boot-splash-enter-slot">
              {ready && (
                <button
                  className="btn primary boot-splash-enter"
                  onClick={(e) => {
                    e.stopPropagation();
                    finish();
                  }}
                  autoFocus
                >
                  Click here to enter &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
