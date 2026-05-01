'use client';

/**
 * MOCKUP — Magic 8-Ball variants. Static visuals only, nothing animates,
 * nothing is wired up. Pick a direction before building for real.
 *
 * Visit /mockup/magic-8ball
 */

const ANSWERS_CLASSIC = [
  'It is certain.',
  'Without a doubt.',
  'Yes definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

const ANSWERS_TRADER = [
  'Long it. Send.',
  'Reply hazy, check funding.',
  'Bearish af.',
  'Outlook: rugpull imminent.',
  'You may rely on it. (DYOR)',
  'Liquidation likely.',
  'Concentrate and ask again.',
  'Yes — but use a stop.',
];

// Window-chrome styles ripped from existing apps so the mockup matches.
const WIN: React.CSSProperties = {
  background: 'var(--w98-bg)',
  border: '2px solid',
  borderColor: '#fff #000 #000 #fff',
  boxShadow: 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #808080',
  display: 'inline-block',
};
const TITLEBAR: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--w98-titlebar-active-start), var(--w98-titlebar-active-end))',
  color: '#fff',
  fontWeight: 700,
  fontSize: 11,
  padding: '2px 4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 18,
};
const TITLEBAR_BTNS: React.CSSProperties = {
  display: 'flex',
  gap: 2,
};
const TITLEBAR_BTN: React.CSSProperties = {
  width: 16,
  height: 14,
  background: 'var(--w98-bg)',
  border: '1px solid',
  borderColor: '#fff #000 #000 #fff',
  fontSize: 9,
  fontWeight: 700,
  color: '#000',
  textAlign: 'center',
  lineHeight: '12px',
};
const MENUBAR: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '2px 6px',
  fontSize: 11,
  borderBottom: '1px solid var(--bevel-dark-1)',
};
const BTN: React.CSSProperties = {
  background: 'var(--w98-bg)',
  border: '2px solid',
  borderColor: '#fff #808080 #808080 #fff',
  boxShadow: 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #404040',
  padding: '4px 14px',
  fontFamily: 'inherit',
  fontSize: 11,
  cursor: 'pointer',
};
const BTN_PRESSED: React.CSSProperties = {
  ...BTN,
  borderColor: '#404040 #fff #fff #404040',
  boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #dfdfdf',
};

export default function Magic8BallMockups() {
  return (
    <div
      style={{
        background: '#008080',
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'var(--w98-font)',
        fontSize: 12,
        color: '#000',
      }}
    >
      <h1 style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>Magic 8-Ball Mockups</h1>
      <p style={{ color: '#fff', opacity: 0.85, fontSize: 12, marginBottom: 24, maxWidth: 720 }}>
        Four directions. Pick one (or mix). Nothing is wired up — these are static
        screenshots-as-components so we can lock the look before building.
      </p>

      <Grid>
        <Section
          title="Variant A — Classic 8-Ball"
          notes={
            <>
              The toy as you remember it. Big black sphere, white circle, blue triangle showing the answer.
              Question lives in a Win98 input above. <strong>Shake</strong> button below.
              <br />
              <em>Pros:</em> instantly readable, nostalgic, photo-real fits the retro vibe.
              <br />
              <em>Cons:</em> the round ball clashes a bit with the boxy desktop.
            </>
          }
        >
          <FakeWindow title="Magic 8-Ball" width={260}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <input
                readOnly
                value="Should I long ETH?"
                style={{
                  width: '100%',
                  padding: '3px 5px',
                  border: '2px solid',
                  borderColor: '#808080 #fff #fff #808080',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  background: '#fff',
                }}
              />
              <ClassicBall answer="Outlook good." />
              <button style={BTN}>Shake</button>
            </div>
          </FakeWindow>
        </Section>

        <Section
          title="Variant B — CRT Terminal"
          notes={
            <>
              No ball. Green-on-black DOS terminal. Type a question, hit Enter, an answer
              clatters out one char at a time. Cursor blinks at the bottom.
              <br />
              <em>Pros:</em> dirt cheap to build, fits the Bloomberg-Terminal-&apos;98 aesthetic
              we joked about, scrollable history of past questions.
              <br />
              <em>Cons:</em> doesn&apos;t feel like an 8-ball — feels like a Magic 8 oracle.
            </>
          }
        >
          <FakeWindow title="ORACLE.EXE" width={320}>
            <div
              style={{
                background: '#000',
                color: '#33ff33',
                fontFamily: 'var(--w98-font-mono)',
                fontSize: 12,
                padding: 10,
                height: 200,
                overflow: 'hidden',
                lineHeight: 1.4,
              }}
            >
              <div style={{ color: '#888' }}>HYPER98 ORACLE v1.0 (c) 1998</div>
              <div style={{ color: '#888', marginBottom: 8 }}>Type a question. Press Enter.</div>
              <div>&gt; will btc hit 100k this week?</div>
              <div style={{ color: '#ffff66' }}>  &gt;&gt; My sources say no.</div>
              <div>&gt; should i close my short?</div>
              <div style={{ color: '#ffff66' }}>  &gt;&gt; Reply hazy, try again.</div>
              <div>&gt; <span style={{ background: '#33ff33', color: '#000' }}>_</span></div>
            </div>
          </FakeWindow>
        </Section>

        <Section
          title="Variant C — Boxy Desk Toy"
          notes={
            <>
              The ball, but rendered with chunky pixel-art bevels so it slots into the OS.
              Answer triangle is a beige inset panel. Question + answer history docked on the right.
              <br />
              <em>Pros:</em> matches the desktop chrome perfectly, history is a nice extra.
              <br />
              <em>Cons:</em> wider footprint, less iconic than the round ball.
            </>
          }
        >
          <FakeWindow title="Magic 8-Ball" width={420}>
            <div style={{ display: 'flex' }}>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1 }}>
                <PixelBall answer="Yes definitely." />
                <input
                  readOnly
                  value="Buy the dip?"
                  style={{
                    width: '100%',
                    padding: '3px 5px',
                    border: '2px solid',
                    borderColor: '#808080 #fff #fff #808080',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    background: '#fff',
                  }}
                />
                <button style={BTN}>Ask</button>
              </div>
              <div
                style={{
                  width: 160,
                  borderLeft: '1px solid var(--bevel-dark-1)',
                  padding: 8,
                  fontSize: 10,
                  background: 'var(--w98-bg-light)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>History</div>
                <HistoryRow q="long sol?" a="Yes." good />
                <HistoryRow q="rug imminent?" a="Very doubtful." good />
                <HistoryRow q="close short?" a="Don't count on it." bad />
                <HistoryRow q="ape into pepe?" a="Outlook not so good." bad />
              </div>
            </div>
          </FakeWindow>
        </Section>

        <Section
          title="Variant D — Trader Mode"
          notes={
            <>
              Same UI as A, but answers are degenerate trader-flavored. Toggle in the title-bar
              menu to switch between <strong>Classic</strong> and <strong>Trader</strong> answer pools.
              Optional: a cursed coin under the ball so you can&apos;t shake more than once / 30s.
              <br />
              <em>Pros:</em> on-brand for a trading desktop, very memeable.
              <br />
              <em>Cons:</em> joke fades after the 5th use. Mitigated by classic-mode toggle.
            </>
          }
        >
          <FakeWindow title="Magic 8-Ball" width={260} menu={['File', 'Mode ▾', 'Help']}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <input
                readOnly
                value="Should I 50x leverage?"
                style={{
                  width: '100%',
                  padding: '3px 5px',
                  border: '2px solid',
                  borderColor: '#808080 #fff #fff #808080',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  background: '#fff',
                }}
              />
              <ClassicBall answer="Liquidation likely." trader />
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={BTN}>Shake</button>
                <button style={BTN_PRESSED}>Trader ✓</button>
              </div>
            </div>
          </FakeWindow>
        </Section>
      </Grid>

      <div style={{ marginTop: 32, color: '#fff', fontSize: 12, maxWidth: 720 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Open questions:</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Animation: shake the window? Bounce the triangle in? Fade swap? Or static answer-flip?</li>
          <li>Sound: liquidy &quot;sloshhh&quot; on shake? Off by default, toggle in menu?</li>
          <li>Answer pool: stick with the canonical 20, add Trader mode (D), or both?</li>
          <li>Persistence: keep history across sessions, or wipe on close?</li>
        </ul>
        <div style={{ marginTop: 16 }}>
          Sample trader-mode answers, for reference:
          <div style={{ fontFamily: 'var(--w98-font-mono)', fontSize: 11, marginTop: 4, opacity: 0.85 }}>
            {ANSWERS_TRADER.join(' · ')}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          Classic answers ({ANSWERS_CLASSIC.length}):
          <div style={{ fontFamily: 'var(--w98-font-mono)', fontSize: 11, marginTop: 4, opacity: 0.7 }}>
            {ANSWERS_CLASSIC.join(' · ')}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── helpers ───────────── */

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
        gap: 24,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  notes,
  children,
}: {
  title: string;
  notes: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: 14, margin: '0 0 8px' }}>{title}</h2>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>{children}</div>
      <div
        style={{
          background: 'var(--w98-yellow)',
          border: '1px solid #000',
          padding: 8,
          fontSize: 11,
          lineHeight: 1.5,
          color: '#000',
        }}
      >
        {notes}
      </div>
    </div>
  );
}

function FakeWindow({
  title,
  width,
  menu,
  children,
}: {
  title: string;
  width: number;
  menu?: string[];
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...WIN, width }}>
      <div style={TITLEBAR}>
        <span>● {title}</span>
        <div style={TITLEBAR_BTNS}>
          <div style={TITLEBAR_BTN}>_</div>
          <div style={TITLEBAR_BTN}>□</div>
          <div style={TITLEBAR_BTN}>×</div>
        </div>
      </div>
      {menu && (
        <div style={MENUBAR}>
          {menu.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

function ClassicBall({ answer, trader = false }: { answer: string; trader?: boolean }) {
  return (
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #4a4a4a 0%, #000 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset -8px -10px 24px rgba(0,0,0,0.6), 2px 2px 0 #000',
      }}
    >
      <div
        style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: '#0a1a4a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.8)',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '40px solid transparent',
            borderRight: '40px solid transparent',
            borderBottom: '70px solid #1a3a8a',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 28,
              left: -34,
              width: 68,
              textAlign: 'center',
              color: '#fff',
              fontFamily: 'var(--w98-font)',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {answer}
            {trader && <div style={{ fontSize: 7, opacity: 0.7, marginTop: 2 }}>(NFA)</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PixelBall({ answer }: { answer: string }) {
  return (
    <div
      style={{
        width: 160,
        height: 160,
        background: '#000',
        border: '2px solid',
        borderColor: '#404040 #000 #000 #404040',
        boxShadow: 'inset 4px 4px 0 #303030, inset -4px -4px 0 #000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          background: 'var(--w98-bg-light)',
          border: '2px solid',
          borderColor: '#808080 #fff #fff #808080',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: '#000080',
          lineHeight: 1.2,
        }}
      >
        {answer}
      </div>
    </div>
  );
}

function HistoryRow({ q, a, good, bad }: { q: string; a: string; good?: boolean; bad?: boolean }) {
  return (
    <div style={{ marginBottom: 6, paddingBottom: 4, borderBottom: '1px dotted #808080' }}>
      <div style={{ color: '#000080', fontWeight: 700 }}>{q}</div>
      <div style={{ color: good ? 'var(--w98-green)' : bad ? 'var(--w98-red)' : '#000' }}>{a}</div>
    </div>
  );
}
