'use client';

import { useEffect } from 'react';
import { useCrashStore } from '@/stores/crashStore';
import { playSound } from '@/lib/sounds/SoundManager';

export function BSOD() {
  const crashed = useCrashStore((s) => s.crashed);
  const reason = useCrashStore((s) => s.reason);
  const hint = useCrashStore((s) => s.hint);
  const dismiss = useCrashStore((s) => s.dismiss);

  useEffect(() => {
    if (!crashed) return;
    playSound('chord');

    const handleDismiss = () => {
      playSound('tada');
      dismiss();
      // Give the tada a moment to start before reload
      setTimeout(() => window.location.reload(), 150);
    };

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      handleDismiss();
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      handleDismiss();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [crashed, dismiss]);

  if (!crashed) return null;

  return (
    <div className="bsod">
      <div className="bsod-inner">
        <div className="bsod-banner">&nbsp;Windows&nbsp;</div>
        <p>
          A fatal exception 0x0000HL has occurred at 0028:0xDEADBEEF in
          HYPERLIQUID.DLL — {reason || 'connection lost to trading core'}.
          The current application will be terminated.
        </p>
        {hint && <p className="bsod-hint">{hint}</p>}
        <p>
          *&nbsp;&nbsp;Press any key to terminate the current application.
          <br />
          *&nbsp;&nbsp;Press CTRL+ALT+DEL again to restart your computer.
          &nbsp;&nbsp;You will lose any unsaved
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;information in all applications.
        </p>
        <p className="bsod-prompt">
          Press any key to continue&nbsp;<span className="bsod-caret">_</span>
        </p>
      </div>
    </div>
  );
}
