'use client';

/**
 * Paint — hosted JS Paint (https://jspaint.app) embedded via iframe.
 *
 * JS Paint is MIT-licensed and explicitly supports iframe embedding. It's
 * the most faithful MS Paint recreation on the web. For self-hosting,
 * drop a jspaint build into `public/jspaint/` and change the src below
 * to `/jspaint/index.html`.
 */
export function PaintApp(_props: { windowId: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', background: '#000' }}>
      <iframe
        src="https://jspaint.app"
        title="Paint"
        style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
