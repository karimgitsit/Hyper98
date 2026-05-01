'use client';

import { useState } from 'react';

const ANSWERS = [
  'It is certain.',
  'Without a doubt.',
  'Yes definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
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

const SHAKE_MS = 600;

function pickAnswer(prev: string | null): string {
  if (ANSWERS.length < 2) return ANSWERS[0];
  let next = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  while (next === prev) {
    next = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  }
  return next;
}

export function Magic8BallApp() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  const ask = () => {
    if (shaking) return;
    setShaking(true);
    setAnswer(null);
    window.setTimeout(() => {
      setAnswer(pickAnswer(answer));
      setShaking(false);
    }, SHAKE_MS);
  };

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--w98-bg)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes m8b-shake {
          0%   { transform: translate(0, 0) rotate(0deg); }
          15%  { transform: translate(-6px, 2px) rotate(-4deg); }
          30%  { transform: translate(5px, -3px) rotate(5deg); }
          45%  { transform: translate(-4px, 4px) rotate(-3deg); }
          60%  { transform: translate(6px, 1px) rotate(4deg); }
          75%  { transform: translate(-3px, -2px) rotate(-2deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes m8b-fade-in {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ask();
        }}
        placeholder="Ask a yes/no question..."
        maxLength={120}
        style={{
          width: '100%',
          padding: '3px 5px',
          border: '2px solid',
          borderColor: '#808080 #fff #fff #808080',
          fontFamily: 'inherit',
          fontSize: 11,
          background: '#fff',
          outline: 'none',
        }}
      />

      <Ball answer={answer} shaking={shaking} />

      <button
        onClick={ask}
        disabled={shaking}
        style={{
          background: 'var(--w98-bg)',
          border: '2px solid',
          borderColor: '#fff #808080 #808080 #fff',
          boxShadow: 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #404040',
          padding: '4px 18px',
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: shaking ? 'default' : 'pointer',
          minWidth: 80,
        }}
      >
        Shake
      </button>
    </div>
  );
}

function Ball({ answer, shaking }: { answer: string | null; shaking: boolean }) {
  return (
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #5a5a5a 0%, #1a1a1a 55%, #000 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset -8px -10px 24px rgba(0,0,0,0.7), 2px 2px 0 #000',
        animation: shaking ? `m8b-shake ${SHAKE_MS}ms ease-in-out` : undefined,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: '50%',
          background: '#0a1438',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 0 14px rgba(0,0,0,0.8)',
          position: 'relative',
        }}
      >
        {!shaking && answer && (
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '42px solid transparent',
              borderRight: '42px solid transparent',
              borderBottom: '72px solid #2a4ab0',
              position: 'relative',
              animation: 'm8b-fade-in 220ms ease-out',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 30,
                left: -38,
                width: 76,
                textAlign: 'center',
                color: '#fff',
                fontFamily: 'var(--w98-font)',
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1.15,
                textShadow: '0 0 2px #2a4ab0',
              }}
            >
              {answer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
