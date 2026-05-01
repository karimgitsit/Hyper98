'use client';

import { useSettingsStore } from '@/stores/settingsStore';
import { SoundManager, type SoundName } from './SoundManager';

/**
 * React wrapper around SoundManager. The `muted` value is read from
 * `settingsStore` (M3.5) so toggles anywhere — Start menu, Settings
 * window, future hotkey — propagate through one selector.
 */
export function useSound(): {
  play: (name: SoundName) => void;
  muted: boolean;
  toggleMute: () => void;
} {
  const muted = useSettingsStore((s) => s.audioMuted);
  const setAudioMuted = useSettingsStore((s) => s.setAudioMuted);

  return {
    play: (name) => SoundManager.play(name),
    muted,
    toggleMute: () => setAudioMuted(!muted),
  };
}
