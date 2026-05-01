'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useWindowStore } from '@/stores/windowStore';
import { DesktopIcons } from '@/components/desktop/DesktopIcons';
import { BSOD } from '@/components/desktop/BSOD';
import { BootSequence } from '@/components/desktop/BootSequence';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/components/ui/useContextMenu';
import { useCrashStore } from '@/stores/crashStore';
import { useSettingsStore, derivedCssVars } from '@/stores/settingsStore';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';

// Dynamic so wagmi + connectkit + viem + walletconnect land in their own
// chunk, not the initial `/` bundle. Rendered with `ssr: false` because the
// whole tree is client-only anyway (wagmi probes localStorage/indexedDB) and
// this silences the prerender warnings without needing force-dynamic.
const DesktopShell = dynamic(
  () => import('@/components/desktop/DesktopShell').then((m) => m.DesktopShell),
  { ssr: false },
);

export default function Desktop() {
  const reset = useWindowStore((s) => s.reset);
  const open = useWindowStore((s) => s.open);
  const [hydrated, setHydrated] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [quickResume, setQuickResume] = useState(false);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const chromeScale = useSettingsStore((s) => s.chromeScale);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const cursorMode = useSettingsStore((s) => s.cursorMode);

  useGlobalShortcuts();

  useEffect(() => {
    const vars = derivedCssVars({ chromeScale, fontScale, cursorMode });
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [chromeScale, fontScale, cursorMode]);

  // Manually rehydrate persist after mount — skipHydration: true in the store
  // prevents SSR/CSR mismatch, so we do it here on the client only.
  useEffect(() => {
    let cancelled = false;
    const p = useWindowStore.persist?.rehydrate?.();
    Promise.resolve(p).then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Decide whether to play the full boot or a quick "Resuming Windows..." flash.
  // sessionStorage: cleared when the tab closes, so every fresh tab gets the
  // full boot once. Start menu → Shut Down/Restart clears both.
  useEffect(() => {
    if (!hydrated) return;
    const booted = sessionStorage.getItem('hyper98:booted');
    setQuickResume(booted === '1');
  }, [hydrated]);

  const handleBootComplete = () => {
    sessionStorage.setItem('hyper98:booted', '1');
    setBootDone(true);
  };

  // First-load Readme — deferred until boot completes so it doesn't stack
  // behind the login dialog. BootSequence plays the 'tada' chime itself.
  useEffect(() => {
    if (!bootDone) return;
    const state = useWindowStore.getState();
    const settings = useSettingsStore.getState();
    if (!settings.readmeSeen && state.zOrder.length === 0) {
      open('readme', { singleton: true, x: 120, y: 80 });
      settings.setReadmeSeen(true);
    }
  }, [bootDone, open]);

  // Dev trigger: window.__bsod(reason?) pops the blue screen.
  useEffect(() => {
    const trigger = useCrashStore.getState().trigger;
    (window as unknown as { __bsod?: (reason?: string) => void }).__bsod = (reason?: string) =>
      trigger(reason ?? 'Manual test trigger', 'VXD device TEST.VXD invoked from dev console');
    return () => {
      delete (window as unknown as { __bsod?: (reason?: string) => void }).__bsod;
    };
  }, []);

  const handleDesktopContextMenu = (e: React.MouseEvent) => {
    // Only fire for the bare desktop/background — let child handlers win
    const target = e.target as HTMLElement;
    if (target.closest('.window') || target.closest('.desktop-icon')) return;
    openMenu(e, [
      { label: '&New', disabled: true },
      { label: 'Arrange &Icons', disabled: true },
      { separator: true, label: '' },
      {
        label: 'Re&fresh',
        onClick: () => {
          reset();
          localStorage.removeItem('hyper98:visited');
        },
      },
      { separator: true, label: '' },
      { label: 'P&roperties', onClick: () => open('about', { singleton: true }) },
    ]);
  };

  return (
    <>
      <div className="desktop" onContextMenu={handleDesktopContextMenu}>
        <div className="desktop-bg" />
        <DesktopIcons />
        {hydrated && <DesktopShell bootDone={bootDone} />}
      </div>
      <BSOD />
      {hydrated && !bootDone && (
        <BootSequence onComplete={handleBootComplete} quickResume={quickResume} />
      )}
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </>
  );
}
