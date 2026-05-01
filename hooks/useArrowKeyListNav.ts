'use client';

import { useCallback, useRef } from 'react';

// Wires Up/Down/Home/End/Enter into a list with a single-selection model.
// Caller owns selection state and provides a stable id per item. The hook
// hands back an onKeyDown handler (attach to the scroll container that has
// tabIndex set) and a row-ref registrar so the selected row can be scrolled
// into view as it moves.
export function useArrowKeyListNav<T>({
  items,
  getId,
  selectedId,
  setSelectedId,
  onActivate,
}: {
  items: T[];
  getId: (item: T) => string;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onActivate?: (item: T) => void;
}) {
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const setRowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    [],
  );

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
    },
    [setSelectedId],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;
      const idx = selectedId ? items.findIndex((it) => getId(it) === selectedId) : -1;
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = idx < 0 ? 0 : Math.min(items.length - 1, idx + 1);
          select(getId(items[next]));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const next = idx < 0 ? items.length - 1 : Math.max(0, idx - 1);
          select(getId(items[next]));
          break;
        }
        case 'Home': {
          e.preventDefault();
          select(getId(items[0]));
          break;
        }
        case 'End': {
          e.preventDefault();
          select(getId(items[items.length - 1]));
          break;
        }
        case 'Enter': {
          if (onActivate && idx >= 0) {
            e.preventDefault();
            onActivate(items[idx]);
          }
          break;
        }
      }
    },
    [items, selectedId, getId, onActivate, select],
  );

  return { onKeyDown, setRowRef };
}
