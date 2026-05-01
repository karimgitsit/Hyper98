'use client';

import { useSettingsStore } from '@/stores/settingsStore';
import type { FontScale, ChromeScale, CursorMode } from '@/stores/settingsStore';

export function SettingsApp({ windowId: _windowId }: { windowId: string }) {
  const chromeScale = useSettingsStore((s) => s.chromeScale);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const cursorMode = useSettingsStore((s) => s.cursorMode);
  const rememberLayout = useSettingsStore((s) => s.rememberLayout);
  const setChromeScale = useSettingsStore((s) => s.setChromeScale);
  const setFontScale = useSettingsStore((s) => s.setFontScale);
  const setCursorMode = useSettingsStore((s) => s.setCursorMode);
  const setRememberLayout = useSettingsStore((s) => s.setRememberLayout);

  function restoreDefaults() {
    setChromeScale('normal');
    setFontScale(1.0 as FontScale);
    setCursorMode('default');
    setRememberLayout(false);
  }

  return (
    <div className="window-body" style={{ padding: '8px', overflowY: 'auto' }}>
      <div className="fieldset">
        <span className="fieldset-legend">Display</span>
        <div style={{ marginBottom: '4px', fontWeight: 700 }}>Font size</div>
        {([
          [1.0, 'Small'],
          [1.125, 'Medium'],
          [1.25, 'Large'],
          [1.5, 'Extra Large'],
        ] as [FontScale, string][]).map(([val, label]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', cursor: 'var(--click-cursor, default)' }}>
            <input
              type="radio"
              name="fontScale"
              checked={fontScale === val}
              onChange={() => setFontScale(val)}
              style={{ cursor: 'var(--click-cursor, default)' }}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="fieldset">
        <span className="fieldset-legend">Windows</span>
        <div style={{ marginBottom: '4px', fontWeight: 700 }}>Chrome size</div>
        {([
          ['compact', 'Compact'],
          ['normal', 'Normal'],
          ['large', 'Large'],
        ] as [ChromeScale, string][]).map(([val, label]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', cursor: 'var(--click-cursor, default)' }}>
            <input
              type="radio"
              name="chromeScale"
              checked={chromeScale === val}
              onChange={() => setChromeScale(val)}
              style={{ cursor: 'var(--click-cursor, default)' }}
            />
            {label}
          </label>
        ))}
        <div style={{ marginTop: '8px', marginBottom: '4px', fontWeight: 700 }}>Cursor</div>
        {([
          ['default', 'Classic'],
          ['pointer', 'Pointer'],
        ] as [CursorMode, string][]).map(([val, label]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', cursor: 'var(--click-cursor, default)' }}>
            <input
              type="radio"
              name="cursorMode"
              checked={cursorMode === val}
              onChange={() => setCursorMode(val)}
              style={{ cursor: 'var(--click-cursor, default)' }}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="fieldset">
        <span className="fieldset-legend">Layout</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'var(--click-cursor, default)' }}>
          <input
            type="checkbox"
            checked={rememberLayout}
            onChange={(e) => setRememberLayout(e.target.checked)}
            style={{ cursor: 'var(--click-cursor, default)' }}
          />
          Remember window positions across refreshes
        </label>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={restoreDefaults}>
          Restore Defaults
        </button>
      </div>
    </div>
  );
}
