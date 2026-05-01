'use client';

import { useCallback, useState } from 'react';
import type { ContextMenuItem } from './ContextMenu';

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * State hook for a single shared context menu. Returns `menu` (which
 * the host renders as <ContextMenu {...menu} onClose={close}/> if truthy),
 * `open` to show it at an event location, and `close`.
 */
export function useContextMenu(): {
  menu: ContextMenuState | null;
  open: (e: { preventDefault: () => void; clientX: number; clientY: number }, items: ContextMenuItem[]) => void;
  close: () => void;
} {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = useCallback(
    (e: { preventDefault: () => void; clientX: number; clientY: number }, items: ContextMenuItem[]) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    []
  );

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}
