'use client';

import { useState } from 'react';
import { useWindowStore, type AppType } from '@/stores/windowStore';
import { AppIcon } from '@/components/ui/Icons';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/components/ui/useContextMenu';

interface DesktopIconDef {
  type: AppType;
  label: string;
  singleton?: boolean;
}

const ICONS: DesktopIconDef[] = [
  { type: 'readme', label: 'Read Me.txt', singleton: true },
  { type: 'wallet', label: 'My Wallet', singleton: true },
  { type: 'positions', label: 'My Positions', singleton: true },
  { type: 'markets', label: 'Markets', singleton: true },
  { type: 'hip3', label: 'HIP-3 Markets', singleton: true },
  { type: 'settings', label: 'Settings', singleton: true },
  { type: 'minesweeper', label: 'Minesweeper', singleton: true },
  { type: 'solitaire', label: 'Solitaire', singleton: true },
  { type: 'paint', label: 'Paint', singleton: true },
  { type: 'magic8ball', label: 'Magic 8-Ball', singleton: true },
  { type: 'calculator', label: 'Calculator', singleton: true },
];

export function DesktopIcons() {
  const [selected, setSelected] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  return (
    <div
      className="desktop-icons"
      onClick={(e) => {
        // Click on empty desktop area deselects
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      {ICONS.map((icon) => (
        <div
          key={icon.type + icon.label}
          className={`desktop-icon ${selected === icon.label ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(icon.label);
          }}
          onDoubleClick={() => {
            open(icon.type, { singleton: icon.singleton });
            setSelected(null);
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            setSelected(icon.label);
            openMenu(e, [
              {
                label: '&Open',
                onClick: () => open(icon.type, { singleton: icon.singleton }),
              },
              { separator: true, label: '' },
              { label: 'Re&name', disabled: true },
              { label: 'P&roperties', disabled: true },
            ]);
          }}
        >
          <AppIcon type={icon.type} size={48} className="desktop-icon-img" />
          <span className="desktop-icon-label">{icon.label}</span>
        </div>
      ))}
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}
