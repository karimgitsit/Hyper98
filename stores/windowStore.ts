import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { playSound } from '@/lib/sounds/SoundManager';
import { useSettingsStore } from './settingsStore';

export type AppType =
  | 'chart'
  | 'orderbook'
  | 'market'
  | 'markets'
  | 'positions'
  | 'orders'
  | 'wallet'
  | 'hip3'
  | 'fills'
  | 'about'
  | 'readme'
  | 'paint'
  | 'minesweeper'
  | 'solitaire'
  | 'magic8ball'
  | 'calculator'
  | 'admin'
  | 'settings';

const KNOWN_APP_TYPES: ReadonlySet<AppType> = new Set<AppType>([
  'chart',
  'orderbook',
  'market',
  'markets',
  'positions',
  'orders',
  'wallet',
  'hip3',
  'fills',
  'about',
  'readme',
  'paint',
  'minesweeper',
  'solitaire',
  'magic8ball',
  'calculator',
  'admin',
  'settings',
]);

export interface WindowState {
  id: string;
  type: AppType;
  title: string;
  icon?: string; // emoji or svg id
  props: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  minimized: boolean;
  maximized: boolean;
  // Pre-maximize dimensions for restore
  prevBounds?: { x: number; y: number; width: number; height: number };
}

interface WindowStore {
  windows: Record<string, WindowState>;
  zOrder: string[]; // front-to-back, last = topmost
  focusedId: string | null;
  nextId: number;

  open: (
    type: AppType,
    opts?: {
      title?: string;
      props?: Record<string, unknown>;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      // If an existing window of this type with matching props exists, focus it instead
      singleton?: boolean;
    }
  ) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, width: number, height: number, x?: number, y?: number) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  updateProps: (id: string, props: Record<string, unknown>) => void;
  setTitle: (id: string, title: string) => void;
  /** Clear all windows and reset counters. Used by desktop "Refresh". */
  reset: () => void;
}

const APP_DEFAULTS: Record<AppType, Partial<WindowState>> = {
  chart: { title: 'Chart.exe', width: 480, height: 340, minWidth: 300, minHeight: 220 },
  orderbook: { title: 'OrderBook.exe', width: 220, height: 360, minWidth: 180, minHeight: 240 },
  market: { title: 'Market.exe', width: 1240, height: 820, minWidth: 700, minHeight: 560 },
  markets: { title: 'Markets.exe', width: 520, height: 380, minWidth: 360, minHeight: 240 },
  positions: { title: 'Positions.exe', width: 800, height: 280, minWidth: 400, minHeight: 180 },
  orders: { title: 'Orders.exe', width: 680, height: 300, minWidth: 520, minHeight: 200 },
  wallet: { title: 'Wallet.exe', width: 380, height: 420, minWidth: 320, minHeight: 320 },
  hip3: { title: 'HIP-3 Markets', width: 520, height: 380, minWidth: 360, minHeight: 240 },
  fills: { title: 'Fills.exe', width: 720, height: 300, minWidth: 520, minHeight: 200 },
  about: { title: 'About hyper98', width: 340, height: 310, minWidth: 280, minHeight: 260 },
  readme: { title: 'readme.txt - Notepad', width: 440, height: 320, minWidth: 280, minHeight: 200 },
  paint: { title: 'untitled - Paint', width: 640, height: 480, minWidth: 360, minHeight: 280 },
  minesweeper: { title: 'Minesweeper', width: 164, height: 230, minWidth: 164, minHeight: 230 },
  solitaire: { title: 'Solitaire', width: 585, height: 440, minWidth: 585, minHeight: 440 },
  magic8ball: { title: 'Magic 8-Ball', width: 240, height: 296, minWidth: 240, minHeight: 296 },
  calculator: { title: 'Calculator', width: 240, height: 280, minWidth: 240, minHeight: 280 },
  admin: { title: 'Admin', width: 480, height: 380, minWidth: 400, minHeight: 320 },
  settings: { title: 'Settings', width: 360, height: 360, minWidth: 320, minHeight: 280 },
};

// Cascade offset — each new window offsets from the last
const CASCADE_STEP = 24;

// Drop-in Storage that swallows writes. Used when rememberLayout is off so
// the persist middleware doesn't serialize the full windows record on every
// focus/move/resize. getItem returns null so the merge step skips hydration.
const NOOP_STORAGE: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const useWindowStore = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: {},
      zOrder: [],
      focusedId: null,
      nextId: 1,

      open: (type, opts = {}) => {
        const state = get();

        // Singleton check — if a window of this type is open, focus it
        if (opts.singleton) {
          const existing = Object.values(state.windows).find((w) => w.type === type);
          if (existing) {
            get().focus(existing.id);
            if (existing.minimized) get().restore(existing.id);
            return existing.id;
          }
        }

        const id = `w${state.nextId}`;
        const defaults = APP_DEFAULTS[type];
        const openCount = state.zOrder.length;

        const width = opts.width ?? (defaults.width as number);
        const height = opts.height ?? (defaults.height as number);

        // Cascade position if not specified
        const x = opts.x ?? 80 + (openCount * CASCADE_STEP) % 240;
        const y = opts.y ?? 40 + (openCount * CASCADE_STEP) % 160;

        const newWindow: WindowState = {
          id,
          type,
          title: opts.title ?? (defaults.title as string),
          props: opts.props ?? {},
          x,
          y,
          width,
          height,
          minWidth: defaults.minWidth as number,
          minHeight: defaults.minHeight as number,
          minimized: false,
          maximized: false,
        };

        set({
          windows: { ...state.windows, [id]: newWindow },
          zOrder: [...state.zOrder, id],
          focusedId: id,
          nextId: state.nextId + 1,
        });
        playSound('ding');
        return id;
      },

      close: (id) => {
        const state = get();
        if (!state.windows[id]) return;
        const { [id]: _removed, ...rest } = state.windows;
        const zOrder = state.zOrder.filter((w) => w !== id);
        const focusedId = state.focusedId === id ? zOrder[zOrder.length - 1] ?? null : state.focusedId;
        set({ windows: rest, zOrder, focusedId });
      },

      focus: (id) => {
        const state = get();
        if (!state.windows[id]) return;
        if (state.focusedId === id && state.zOrder[state.zOrder.length - 1] === id) return;
        const zOrder = [...state.zOrder.filter((w) => w !== id), id];
        set({ zOrder, focusedId: id });
      },

      move: (id, x, y) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        set({ windows: { ...state.windows, [id]: { ...w, x, y } } });
      },

      resize: (id, width, height, x, y) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        set({
          windows: {
            ...state.windows,
            [id]: { ...w, width, height, x: x ?? w.x, y: y ?? w.y },
          },
        });
      },

      minimize: (id) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        // Focus next non-minimized window
        const remaining = state.zOrder.filter((wid) => wid !== id && !state.windows[wid]?.minimized);
        const focusedId = remaining[remaining.length - 1] ?? null;
        set({
          windows: { ...state.windows, [id]: { ...w, minimized: true } },
          focusedId,
        });
      },

      restore: (id) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        set({
          windows: { ...state.windows, [id]: { ...w, minimized: false } },
        });
        get().focus(id);
      },

      toggleMaximize: (id) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        if (w.maximized && w.prevBounds) {
          set({
            windows: {
              ...state.windows,
              [id]: { ...w, ...w.prevBounds, maximized: false, prevBounds: undefined },
            },
          });
        } else {
          // Maximize — leave room for taskbar (28px)
          set({
            windows: {
              ...state.windows,
              [id]: {
                ...w,
                prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
                x: 0,
                y: 0,
                width: window.innerWidth,
                height: window.innerHeight - 28,
                maximized: true,
              },
            },
          });
        }
      },

      updateProps: (id, props) => {
        const state = get();
        const w = state.windows[id];
        if (!w) return;
        set({
          windows: { ...state.windows, [id]: { ...w, props: { ...w.props, ...props } } },
        });
      },

      setTitle: (id, title) => {
        const state = get();
        const w = state.windows[id];
        if (!w || w.title === title) return;
        set({
          windows: { ...state.windows, [id]: { ...w, title } },
        });
      },

      reset: () => {
        set({ windows: {}, zOrder: [], focusedId: null, nextId: 1 });
      },
    }),
    {
      name: 'hyper98:windows',
      // No-op storage when rememberLayout is off. Without this, every focus
      // (which mutates zOrder) JSON-stringifies the full windows record into
      // localStorage on the synchronous interaction path — a free perf tax
      // when the user has explicitly opted out of layout persistence.
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') return localStorage;
        if (useSettingsStore.getState().rememberLayout) return localStorage;
        return NOOP_STORAGE;
      }),
      // Only persist window geometry + id counter. focusedId is recomputed
      // by `merge` on rehydrate (line below), so persisting it just causes
      // an extra localStorage write per focus for no benefit.
      partialize: (state) => ({
        windows: state.windows,
        zOrder: state.zOrder,
        nextId: state.nextId,
      }),
      // SSR + Next.js hydration: defer rehydration until the client mounts.
      skipHydration: true,
      // Drop unknown AppType entries and clamp geometry into viewport on reload.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        const p = persisted as Partial<Pick<WindowStore, 'windows' | 'zOrder' | 'nextId'>>;
        const cleanWindows: Record<string, WindowState> = {};
        const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const viewportH = typeof window !== 'undefined' ? window.innerHeight - 28 : 800;
        for (const [id, w] of Object.entries(p.windows ?? {})) {
          if (!w || !KNOWN_APP_TYPES.has(w.type)) continue;
          // Clamp x/y so windows that were saved off-screen reappear on-screen
          const x = Math.max(0, Math.min(w.x, Math.max(0, viewportW - Math.min(w.width, 120))));
          const y = Math.max(0, Math.min(w.y, Math.max(0, viewportH - 28)));
          cleanWindows[id] = { ...w, x, y, minimized: false, maximized: false, prevBounds: undefined };
        }
        const cleanZ = (p.zOrder ?? []).filter((id) => cleanWindows[id]);
        return {
          ...current,
          windows: cleanWindows,
          zOrder: cleanZ,
          focusedId: cleanZ[cleanZ.length - 1] ?? null,
          nextId: p.nextId ?? 1,
        };
      },
    }
  )
);

/**
 * Call this to conditionally rehydrate persisted window layout.
 * Agent D calls this from app/page.tsx after mount.
 */
export function hydrateWindowsIfEnabled(): void {
  if (useSettingsStore.getState().rememberLayout) {
    useWindowStore.persist.rehydrate();
  } else {
    useWindowStore.persist.clearStorage();
  }
}

// On the client, run once at module load (after a microtask so all stores are
// initialised). Rehydrates if rememberLayout is on; otherwise clears stale data.
if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    if (useSettingsStore.getState().rememberLayout) {
      useWindowStore.persist.rehydrate();
    } else {
      // Clear any stale persisted state so the user isn't surprised.
      useWindowStore.persist.clearStorage();
    }
  });
}
