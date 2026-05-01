'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useWindowStore, type AppType } from '@/stores/windowStore';
import { AppIcon, ShutdownIcon } from '@/components/ui/Icons';
import { useSound } from '@/lib/sounds/useSound';

function adminAllowlist(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^0x[0-9a-f]{40}$/.test(s))
  );
}

interface StartMenuProps {
  open: boolean;
  onClose: () => void;
}

const MENU_APPS: { type: AppType; label: string; singleton?: boolean }[] = [
  { type: 'markets', label: 'Markets', singleton: true },
  { type: 'chart', label: 'Chart' },
  { type: 'orderbook', label: 'Order Book' },
  { type: 'positions', label: 'Positions', singleton: true },
  { type: 'orders', label: 'Open Orders', singleton: true },
  { type: 'fills', label: 'Fill History', singleton: true },
  { type: 'hip3', label: 'HIP-3 Markets', singleton: true },
  { type: 'wallet', label: 'Wallet', singleton: true },
];

const FUN_APPS: { type: AppType; label: string; singleton?: boolean }[] = [
  { type: 'paint', label: 'Paint' },
  { type: 'minesweeper', label: 'Minesweeper' },
  { type: 'solitaire', label: 'Solitaire' },
  { type: 'magic8ball', label: 'Magic 8-Ball', singleton: true },
  { type: 'calculator', label: 'Calculator', singleton: true },
];

export function StartMenu({ open, onClose }: StartMenuProps) {
  const openWindow = useWindowStore((s) => s.open);
  const menuRef = useRef<HTMLDivElement>(null);
  const { muted, toggleMute } = useSound();
  const { address } = useAccount();
  const allowlist = useMemo(() => adminAllowlist(), []);
  const isAdmin = !!address && allowlist.has(address.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Check if click is on start button — let the button handle toggling
        const target = e.target as HTMLElement;
        if (target.closest('.start-btn')) return;
        onClose();
      }
    };
    // Delay binding so the click that opened it doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="start-menu" ref={menuRef}>
      <div className="start-menu-sidebar">
        hyper<span>98</span>
      </div>
      <div className="start-menu-items">
        {MENU_APPS.map((app) => (
          <div
            key={app.type + app.label}
            className="start-menu-item"
            onClick={() => {
              openWindow(app.type, { singleton: app.singleton });
              onClose();
            }}
          >
            <AppIcon type={app.type} size={20} className="start-menu-item-icon" />
            <span>{app.label}</span>
          </div>
        ))}
        <div className="start-menu-divider" />
        {FUN_APPS.map((app) => (
          <div
            key={app.type + app.label}
            className="start-menu-item"
            onClick={() => {
              openWindow(app.type, { singleton: app.singleton });
              onClose();
            }}
          >
            <AppIcon type={app.type} size={20} className="start-menu-item-icon" />
            <span>{app.label}</span>
          </div>
        ))}
        <div className="start-menu-divider" />
        <div
          className="start-menu-item"
          onClick={() => {
            openWindow('readme', { singleton: true });
            onClose();
          }}
        >
          <AppIcon type="readme" size={20} className="start-menu-item-icon" />
          <span>Read Me</span>
        </div>
        <div
          className="start-menu-item"
          onClick={() => {
            openWindow('settings', { singleton: true });
            onClose();
          }}
        >
          <AppIcon type="settings" size={20} className="start-menu-item-icon" />
          <span>Settings</span>
        </div>
        <div
          className="start-menu-item"
          onClick={() => {
            openWindow('about', { singleton: true });
            onClose();
          }}
        >
          <AppIcon type="about" size={20} className="start-menu-item-icon" />
          <span>About hyper98...</span>
        </div>
        {isAdmin && (
          <>
            <div className="start-menu-divider" />
            <div
              className="start-menu-item"
              onClick={() => {
                openWindow('admin', { singleton: true });
                onClose();
              }}
            >
              <AppIcon type="admin" size={20} className="start-menu-item-icon" />
              <span>Admin</span>
            </div>
          </>
        )}
        <div className="start-menu-divider" />
        <div
          className="start-menu-item"
          onClick={() => {
            toggleMute();
          }}
        >
          <AppIcon type="about" size={20} className="start-menu-item-icon" />
          <span>Sound: {muted ? 'Off' : 'On'}</span>
        </div>
        <div className="start-menu-divider" />
        <div
          className="start-menu-item"
          onClick={() => {
            sessionStorage.removeItem('hyper98:booted');
            sessionStorage.removeItem('hyper98:login:dismissed');
            window.location.reload();
            onClose();
          }}
        >
          <ShutdownIcon size={20} className="start-menu-item-icon" />
          <span>Restart</span>
        </div>
        <div
          className="start-menu-item"
          onClick={() => {
            if (confirm('Are you sure you want to shut down hyper98?\n\nYou will be disconnected from Hyperliquid.')) {
              window.location.reload();
            }
            onClose();
          }}
        >
          <ShutdownIcon size={20} className="start-menu-item-icon" />
          <span>Shut Down...</span>
        </div>
      </div>
    </div>
  );
}
