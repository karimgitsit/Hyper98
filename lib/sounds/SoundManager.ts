/**
 * Hyper98 sound manager.
 *
 * Plays real Windows 98 .wav samples from /public/sounds. Samples are
 * lazy-fetched on first use and cached in memory. If a sample is missing
 * the call silently no-ops — we do not synthesize fallbacks, because
 * chiptune oscillators read as "video game", not Win98.
 *
 * AudioContext is lazy-created on first play because browsers require a
 * user gesture before audio can resume.
 *
 * **Mute state lives in `settingsStore.audioMuted`** (M3.5). This module
 * reads it on every `play()` rather than holding its own copy, so a
 * settings flip — wherever it happens — takes effect on the next sound
 * without a separate listener bus.
 */
import { useSettingsStore } from '@/stores/settingsStore';

export type SoundName = 'ding' | 'chord' | 'chimes' | 'tada' | 'recycle';

const SAMPLE_PATH: Record<SoundName, string> = {
  ding: '/sounds/ding.wav',
  chord: '/sounds/chord.wav',
  chimes: '/sounds/chimes.wav',
  tada: '/sounds/tada.wav',
  recycle: '/sounds/recycle.wav',
};

type SampleState = AudioBuffer | 'missing' | 'loading';

class SoundManagerImpl {
  private ctx: AudioContext | null = null;
  private samples = new Map<SoundName, SampleState>();

  isMuted(): boolean {
    return useSettingsStore.getState().audioMuted;
  }

  setMuted(v: boolean): void {
    useSettingsStore.getState().setAudioMuted(v);
  }

  toggleMute(): void {
    this.setMuted(!this.isMuted());
  }

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = W.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  play(name: SoundName): void {
    if (this.isMuted()) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    const cached = this.samples.get(name);
    if (cached instanceof AudioBuffer) {
      this.playBuffer(ctx, cached);
      return;
    }
    if (cached === undefined) {
      void this.loadSample(ctx, name).then((buf) => {
        // Re-check the mute slice at decode time; the user may have
        // muted between the play() call and the wav arriving over the
        // network.
        if (buf && !this.isMuted()) this.playBuffer(ctx, buf);
      });
    }
  }

  private async loadSample(ctx: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
    this.samples.set(name, 'loading');
    try {
      const res = await fetch(SAMPLE_PATH[name]);
      if (!res.ok) {
        this.samples.set(name, 'missing');
        return null;
      }
      const data = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      this.samples.set(name, buf);
      return buf;
    } catch {
      this.samples.set(name, 'missing');
      return null;
    }
  }

  private playBuffer(ctx: AudioContext, buf: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(ctx.currentTime);
  }
}

export const SoundManager = new SoundManagerImpl();

/** Convenience for non-React call-sites (stores, lib). */
export function playSound(name: SoundName): void {
  SoundManager.play(name);
}
