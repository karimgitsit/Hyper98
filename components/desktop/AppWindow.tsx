'use client';

import { Rnd } from 'react-rnd';
import { useWindowStore, type WindowState } from '@/stores/windowStore';
import { AppIcon } from '@/components/ui/Icons';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/components/ui/useContextMenu';
import React from 'react';

interface AppWindowProps {
  window: WindowState;
  children: React.ReactNode;
  menuBar?: React.ReactNode;
}

export function AppWindow({ window: w, children, menuBar }: AppWindowProps) {
  const focus = useWindowStore((s) => s.focus);
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const restore = useWindowStore((s) => s.restore);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const move = useWindowStore((s) => s.move);
  const resize = useWindowStore((s) => s.resize);
  // Subscribe to a primitive (own zIndex) instead of the whole zOrder array.
  // Reordering one window only re-renders the windows whose index changed.
  const zIndex = useWindowStore((s) => s.zOrder.indexOf(w.id) + 100);
  const isFocused = useWindowStore((s) => s.focusedId === w.id);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  if (w.minimized) return null;

  return (
    <Rnd
      size={{ width: w.width, height: w.height }}
      position={{ x: w.x, y: w.y }}
      onDragStart={() => focus(w.id)}
      onDragStop={(_, d) => move(w.id, d.x, d.y)}
      onResizeStart={() => focus(w.id)}
      onResizeStop={(_, __, ref, ___, pos) => {
        resize(w.id, ref.offsetWidth, ref.offsetHeight, pos.x, pos.y);
      }}
      minWidth={w.minWidth}
      minHeight={w.minHeight}
      bounds="parent"
      dragHandleClassName="titlebar"
      disableDragging={w.maximized}
      enableResizing={!w.maximized}
      style={{ zIndex }}
      className="window"
      // Allow dragging titlebar but not the buttons
      cancel=".titlebar-btn"
    >
      <div
        className="window-inner"
        onMouseDown={() => focus(w.id)}
      >
        <div
          className={`titlebar ${isFocused ? '' : 'inactive'}`}
          onContextMenu={(e) => {
            focus(w.id);
            openMenu(e, [
              {
                label: '&Restore',
                disabled: !w.maximized && !w.minimized,
                onClick: () => {
                  if (w.minimized) restore(w.id);
                  else if (w.maximized) toggleMaximize(w.id);
                },
              },
              { label: '&Move', disabled: true },
              { label: '&Size', disabled: true },
              { label: 'Mi&nimize', disabled: w.minimized, onClick: () => minimize(w.id) },
              { label: 'Ma&ximize', disabled: w.maximized, onClick: () => toggleMaximize(w.id) },
              { separator: true, label: '' },
              { label: '&Close  Alt+F4', onClick: () => close(w.id) },
            ]);
          }}
        >
          <AppIcon type={w.type} size={14} className="titlebar-icon" />
          <span className="titlebar-text">{w.title}</span>
          <div className="titlebar-buttons">
            <button
              className="titlebar-btn"
              onClick={(e) => {
                e.stopPropagation();
                minimize(w.id);
              }}
              title="Minimize"
            >
              _
            </button>
            <button
              className="titlebar-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleMaximize(w.id);
              }}
              title={w.maximized ? 'Restore' : 'Maximize'}
            >
              {w.maximized ? '❐' : '□'}
            </button>
            <button
              className="titlebar-btn"
              onClick={(e) => {
                e.stopPropagation();
                close(w.id);
              }}
              title="Close"
              style={{ fontWeight: 'bold' }}
            >
              ×
            </button>
          </div>
        </div>
        {menuBar}
        <div className="window-body">{children}</div>
      </div>
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </Rnd>
  );
}
