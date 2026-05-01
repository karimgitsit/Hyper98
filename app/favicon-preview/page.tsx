const sizes = [16, 24, 32, 48, 64, 128];
const bgs = [
  { name: 'White',       css: '#ffffff', fg: '#333' },
  { name: 'Browser tab', css: '#dfe1e5', fg: '#333' },
  { name: 'Dark',        css: '#1a1a1a', fg: '#ddd' },
  { name: 'Sky',         css: 'linear-gradient(#2f7bc0, #cee2ef)', fg: '#fff' },
];

export default function FaviconPreview() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Favicon</h1>
      <p style={{ color: '#555', marginTop: 0 }}>app/icon.svg rendered at favicon sizes.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {bgs.map(bg => (
          <div key={bg.name} style={{ background: bg.css, padding: 20, borderRadius: 8, border: '1px solid #eee' }}>
            <div style={{ fontSize: 12, color: bg.fg, marginBottom: 12 }}>{bg.name}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              {sizes.map(s => (
                <div key={s} style={{ textAlign: 'center' }}>
                  <img src="/icon.svg" width={s} height={s} alt="" style={{ display: 'block', imageRendering: 'pixelated' }} />
                  <div style={{ fontSize: 10, color: bg.fg, marginTop: 4, opacity: 0.7 }}>{s}px</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
