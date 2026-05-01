import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ChromeScale = 'compact' | 'normal' | 'large';
export type FontScale = 1.0 | 1.125 | 1.25 | 1.5;
export type CursorMode = 'default' | 'pointer';

interface SettingsState {
  chromeScale: ChromeScale;
  fontScale: FontScale;
  cursorMode: CursorMode;
  rememberLayout: boolean;
  readmeSeen: boolean;
  // M3.5 — single source of truth for the global mute toggle. The
  // SoundManager singleton reads this on every `play()` rather than
  // holding its own copy, so any settings UI that flips the slice
  // takes effect on the next sound without a separate listener bus.
  audioMuted: boolean;
  setChromeScale: (v: ChromeScale) => void;
  setFontScale: (v: FontScale) => void;
  setCursorMode: (v: CursorMode) => void;
  setRememberLayout: (v: boolean) => void;
  setReadmeSeen: (v: boolean) => void;
  setAudioMuted: (v: boolean) => void;
}

const CHROME_BASE: Record<ChromeScale, {
  fontSize: number;
  titlebarH: number;
  titlebarBtnW: number;
  titlebarBtnH: number;
  btnPadY: number;
  btnPadX: number;
}> = {
  compact: { fontSize: 10, titlebarH: 16, titlebarBtnW: 14, titlebarBtnH: 12, btnPadY: 2, btnPadX: 8 },
  normal:  { fontSize: 11, titlebarH: 18, titlebarBtnW: 16, titlebarBtnH: 14, btnPadY: 3, btnPadX: 10 },
  large:   { fontSize: 13, titlebarH: 22, titlebarBtnW: 20, titlebarBtnH: 18, btnPadY: 4, btnPadX: 12 },
};

export function derivedCssVars(state: Pick<SettingsState, 'chromeScale' | 'fontScale' | 'cursorMode'>): Record<string, string> {
  const base = CHROME_BASE[state.chromeScale];
  const scaledFont = Math.round(base.fontSize * state.fontScale);
  return {
    '--font-size-base': `${scaledFont}px`,
    '--titlebar-h': `${base.titlebarH}px`,
    '--titlebar-btn-w': `${base.titlebarBtnW}px`,
    '--titlebar-btn-h': `${base.titlebarBtnH}px`,
    '--btn-pad-y': `${base.btnPadY}px`,
    '--btn-pad-x': `${base.btnPadX}px`,
    '--click-cursor': state.cursorMode,
  };
}

/**
 * Pre-zustand mute key the SoundManager used to manage on its own. We
 * read it once at initial-state build time so users who muted under
 * the old code keep their preference after the M3.5 migration. The
 * key is then deleted to avoid drift if the user later flips the
 * audioMuted slice.
 */
const LEGACY_MUTE_KEY = 'hyper98:sounds:muted';

function readLegacyMute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(LEGACY_MUTE_KEY);
    if (raw === null) return false;
    window.localStorage.removeItem(LEGACY_MUTE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      chromeScale: 'normal',
      fontScale: 1.0,
      cursorMode: 'default',
      rememberLayout: false,
      readmeSeen: false,
      audioMuted: readLegacyMute(),
      setChromeScale: (v) => set({ chromeScale: v }),
      setFontScale: (v) => set({ fontScale: v }),
      setCursorMode: (v) => set({ cursorMode: v }),
      setRememberLayout: (v) => set({ rememberLayout: v }),
      setReadmeSeen: (v) => set({ readmeSeen: v }),
      setAudioMuted: (v) => set({ audioMuted: v }),
    }),
    {
      name: 'hyper98:settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
