'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWindowStore } from '@/stores/windowStore';
import { AppIcon, StartLogo } from '@/components/ui/Icons';
import { StartMenu } from './StartMenu';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/components/ui/useContextMenu';

function truncateAddr(addr: string): string {
  return addr.slice(0, 4) + '..' + addr.slice(-3);
}

export function Taskbar() {
  const [startOpen, setStartOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const { address, isConnected } = useAccount();
  const windows = useWindowStore((s) => s.windows);
  const zOrder = useWindowStore((s) => s.zOrder);
  const focusedId = useWindowStore((s) => s.focusedId);
  const open = useWindowStore((s) => s.open);
  const focus = useWindowStore((s) => s.focus);
  const minimize = useWindowStore((s) => s.minimize);
  const restore = useWindowStore((s) => s.restore);
  const close = useWindowStore((s) => s.close);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const tasksRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // Overflow: shrink task buttons when there are too many windows
  const windowCount = Object.keys(windows).length;
  useEffect(() => {
    setOverflow(windowCount > 6);
  }, [windowCount]);

  useEffect(() => {
    const onToggle = () => setStartOpen((o) => !o);
    window.addEventListener('hyper98:toggle-start', onToggle);
    return () => window.removeEventListener('hyper98:toggle-start', onToggle);
  }, []);

  // Clock — client-only to avoid SSR/client locale mismatch
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);

  const timeStr = now
    ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '\u00A0';

  // Show tasks in the order they were opened, not z-order
  const taskIds = Object.keys(windows).sort((a, b) => {
    const na = parseInt(a.slice(1));
    const nb = parseInt(b.slice(1));
    return na - nb;
  });

  const handleTaskClick = (id: string) => {
    const w = windows[id];
    if (!w) return;
    if (w.minimized) {
      restore(id);
    } else if (focusedId === id) {
      minimize(id);
    } else {
      focus(id);
    }
  };

  return (
    <>
      <StartMenu open={startOpen} onClose={() => setStartOpen(false)} />
      <div className="taskbar">
        <button
          className={`start-btn ${startOpen ? 'pressed' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setStartOpen((o) => !o);
          }}
        >
          <StartLogo size={16} className="start-logo" />
          Start
        </button>
        <div className="taskbar-sep" />
        <div ref={tasksRef} className={`taskbar-tasks${overflow ? ' overflow' : ''}`}>
          {taskIds.map((id) => {
            const w = windows[id];
            if (!w) return null;
            const pressed = !w.minimized && focusedId === id;
            return (
              <button
                key={id}
                className={`task-btn ${pressed ? 'pressed' : ''}`}
                onClick={() => handleTaskClick(id)}
                onContextMenu={(e) =>
                  openMenu(e, [
                    {
                      label: '&Restore',
                      disabled: !w.minimized && !w.maximized,
                      onClick: () => {
                        if (w.minimized) restore(id);
                        else if (w.maximized) toggleMaximize(id);
                      },
                    },
                    { label: 'Mi&nimize', disabled: w.minimized, onClick: () => minimize(id) },
                    { label: 'Ma&ximize', disabled: w.maximized, onClick: () => toggleMaximize(id) },
                    { separator: true, label: '' },
                    { label: '&Close', onClick: () => close(id) },
                  ])
                }
              >
                <AppIcon type={w.type} size={14} className="task-btn-icon" />
                <span className="task-btn-label">{w.title}</span>
              </button>
            );
          })}
        </div>
        <div className="taskbar-tray">
          <button
            title="Deposit / Withdraw"
            onClick={() => open('wallet', { singleton: true, props: { tab: 'withdraw' } })}
            style={{
              background: 'none',
              border: '1px solid',
              borderColor: 'var(--bevel-light) var(--bevel-dark-2) var(--bevel-dark-2) var(--bevel-light)',
              width: 18,
              height: 18,
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'var(--w98-font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--w98-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            $
          </button>
          {isConnected ? (
            <span style={{ color: 'var(--w98-green)' }} title={address}>
              {'\u25CF'} {truncateAddr(address!)}
            </span>
          ) : (
            <span style={{ color: '#808080' }} title="Not connected">{'\u25CF'}</span>
          )}
          <span className="tray-clock">{timeStr}</span>
        </div>
      </div>
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </>
  );
}
