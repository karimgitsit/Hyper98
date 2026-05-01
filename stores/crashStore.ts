import { create } from 'zustand';

interface CrashStore {
  crashed: boolean;
  reason: string;
  hint?: string;
  trigger: (reason: string, hint?: string) => void;
  dismiss: () => void;
}

/**
 * BSOD state. Kept separate from windowStore so the crash overlay
 * doesn't have to participate in window persistence. Any fatal error
 * (unexpected wallet disconnect, order-placement exception) calls
 * `trigger()`; the BSOD overlay reads `crashed` and renders fullscreen.
 */
export const useCrashStore = create<CrashStore>((set) => ({
  crashed: false,
  reason: '',
  hint: undefined,
  trigger: (reason, hint) => set({ crashed: true, reason, hint }),
  dismiss: () => set({ crashed: false, reason: '', hint: undefined }),
}));
