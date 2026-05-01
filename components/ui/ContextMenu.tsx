'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  /**
   * Visible label. An optional ampersand marks the accelerator — e.g.
   * `"&Restore"` underlines R and binds the `r` key while the menu is open.
   * Use `&&` to render a literal ampersand.
   */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

interface ParsedLabel {
  /** Label with the `&` accelerator marker stripped. */
  text: string;
  /** Index into `text` of the underlined character, or -1 if none. */
  accelIndex: number;
  /** Lower-cased accelerator character, or null if none. */
  accel: string | null;
}

function parseLabel(label: string): ParsedLabel {
  let text = '';
  let accelIndex = -1;
  let i = 0;
  while (i < label.length) {
    const ch = label[i];
    if (ch === '&' && i + 1 < label.length) {
      const next = label[i + 1];
      if (next === '&') {
        text += '&';
        i += 2;
        continue;
      }
      if (accelIndex === -1) accelIndex = text.length;
      text += next;
      i += 2;
      continue;
    }
    text += ch;
    i += 1;
  }
  const accel = accelIndex >= 0 ? text[accelIndex].toLowerCase() : null;
  return { text, accelIndex, accel };
}

function renderLabel(parsed: ParsedLabel): React.ReactNode {
  if (parsed.accelIndex < 0) return parsed.text;
  const { text, accelIndex } = parsed;
  return (
    <>
      {text.slice(0, accelIndex)}
      <span style={{ textDecoration: 'underline' }}>{text[accelIndex]}</span>
      {text.slice(accelIndex + 1)}
    </>
  );
}

/**
 * A portalled Win98-style right-click menu. Closes on outside click,
 * Escape, or any item activation. Auto-adjusts position to keep the
 * menu inside the viewport. Supports arrow-key navigation, Home/End,
 * Enter/Space to activate, and accelerator-key shortcuts (underlined
 * characters in item labels).
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);

  // Parse labels once per render — cheap, avoids re-splitting on every keypress.
  const parsed = useMemo(() => items.map((it) => parseLabel(it.label)), [items]);

  const enabledIndexes = useMemo(
    () =>
      items
        .map((it, i) => (it.separator || it.disabled ? -1 : i))
        .filter((i) => i >= 0),
    [items],
  );

  // Adjust position after mount so right/bottom edges don't clip
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > innerWidth - 4) nx = innerWidth - rect.width - 4;
    if (ny + rect.height > innerHeight - 4) ny = innerHeight - rect.height - 4;
    if (nx < 0) nx = 0;
    if (ny < 0) ny = 0;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const activate = (i: number) => {
      const it = items[i];
      if (!it || it.disabled || it.separator) return;
      it.onClick?.();
      onClose();
    };

    const move = (dir: 1 | -1) => {
      if (enabledIndexes.length === 0) return;
      setActive((curr) => {
        const pos = enabledIndexes.indexOf(curr);
        if (pos === -1) {
          return dir === 1
            ? enabledIndexes[0]
            : enabledIndexes[enabledIndexes.length - 1];
        }
        const next = (pos + dir + enabledIndexes.length) % enabledIndexes.length;
        return enabledIndexes[next];
      });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        if (enabledIndexes.length) setActive(enabledIndexes[0]);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        if (enabledIndexes.length) setActive(enabledIndexes[enabledIndexes.length - 1]);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (active >= 0) {
          e.preventDefault();
          activate(active);
        }
        return;
      }
      // Accelerator match: a single printable character, no modifiers.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const hit = items.findIndex(
          (it, i) =>
            !it.disabled && !it.separator && parsed[i].accel === key,
        );
        if (hit >= 0) {
          e.preventDefault();
          activate(hit);
        }
      }
    };

    // Defer one tick — the click that opens the menu would otherwise close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('contextmenu', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('contextmenu', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [items, parsed, enabledIndexes, active, onClose]);

  if (typeof document === 'undefined') return null;

  const node = (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="context-menu-sep" />;
        }
        const classes = ['context-menu-item'];
        if (item.disabled) classes.push('disabled');
        if (i === active) classes.push('active');
        return (
          <div
            key={i}
            className={classes.join(' ')}
            onMouseEnter={() => {
              if (!item.disabled) setActive(i);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              item.onClick?.();
              onClose();
            }}
          >
            {renderLabel(parsed[i])}
          </div>
        );
      })}
    </div>
  );

  return createPortal(node, document.body);
}
