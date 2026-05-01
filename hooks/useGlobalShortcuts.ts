'use client';
import { useEffect } from 'react';
import { useWindowStore } from '@/stores/windowStore';

// Taskbar's StartButton should listen for window 'hyper98:toggle-start' events.

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Meta or Ctrl+Esc → toggle start menu
      if (
        (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'Meta') ||
        (e.ctrlKey && e.key === 'Escape')
      ) {
        e.preventDefault();
        // Dispatch a custom event that the Taskbar's StartButton listens for.
        window.dispatchEvent(new CustomEvent('hyper98:toggle-start'));
        return;
      }

      // Escape → close focused context menu or dialog (delegated — listeners on
      // those components handle it). Nothing to do here for Escape alone;
      // components own their local escape handling.

      // Alt+F4 → close focused window
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        const focused = useWindowStore.getState().focusedId;
        if (focused) useWindowStore.getState().close(focused);
        return;
      }

      // Alt+Tab → cycle focused window forward
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        const { zOrder, focus, focusedId } = useWindowStore.getState();
        if (zOrder.length < 2) return;
        const idx = focusedId ? zOrder.indexOf(focusedId) : -1;
        // zOrder: last is top. "next" = wrap toward top, or bottom if already top.
        const nextIdx = idx <= 0 ? zOrder.length - 1 : idx - 1;
        focus(zOrder[nextIdx]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
