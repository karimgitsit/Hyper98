'use client';

import { useEffect, useState } from 'react';

type Op = '+' | '-' | '*' | '/';

const OPS: Record<Op, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? NaN : a / b),
};

const MAX_LEN = 16;

function format(n: number): string {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 'Error';
  // Trim long decimals; keep integer form when possible.
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e16 || abs < 1e-10)) {
    return n.toExponential(8);
  }
  const s = String(n);
  if (s.length <= MAX_LEN) return s;
  // Round to fit.
  const intDigits = Math.floor(Math.log10(abs >= 1 ? abs : 1)) + 1;
  const decimals = Math.max(0, MAX_LEN - intDigits - 2);
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

export function CalculatorApp() {
  const [display, setDisplay] = useState('0');
  const [accum, setAccum] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Op | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [memory, setMemory] = useState(0);
  const error = display === 'Error';

  const inputDigit = (d: string) => {
    if (error) return;
    if (justEvaluated) {
      setDisplay(d);
      setJustEvaluated(false);
      return;
    }
    if (display === '0') setDisplay(d);
    else if (display.length < MAX_LEN) setDisplay(display + d);
  };

  const inputDot = () => {
    if (error) return;
    if (justEvaluated) {
      setDisplay('0.');
      setJustEvaluated(false);
      return;
    }
    if (!display.includes('.')) setDisplay(display + '.');
  };

  const clearAll = () => {
    setDisplay('0');
    setAccum(null);
    setPendingOp(null);
    setJustEvaluated(false);
  };

  const clearEntry = () => {
    if (error) {
      clearAll();
      return;
    }
    setDisplay('0');
  };

  const backspace = () => {
    if (error || justEvaluated) return;
    if (display.length <= 1 || (display.length === 2 && display.startsWith('-'))) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const toggleSign = () => {
    if (error || display === '0') return;
    setDisplay(display.startsWith('-') ? display.slice(1) : '-' + display);
  };

  const applyOp = (op: Op) => {
    if (error) return;
    const current = parseFloat(display);
    if (accum !== null && pendingOp && !justEvaluated) {
      const result = OPS[pendingOp](accum, current);
      const formatted = format(result);
      setDisplay(formatted);
      setAccum(formatted === 'Error' ? null : result);
    } else {
      setAccum(current);
    }
    setPendingOp(op);
    setJustEvaluated(true);
  };

  const equals = () => {
    if (error || pendingOp === null || accum === null) return;
    const current = parseFloat(display);
    const result = OPS[pendingOp](accum, current);
    setDisplay(format(result));
    setAccum(null);
    setPendingOp(null);
    setJustEvaluated(true);
  };

  const sqrt = () => {
    if (error) return;
    const v = parseFloat(display);
    setDisplay(v < 0 ? 'Error' : format(Math.sqrt(v)));
    setJustEvaluated(true);
  };

  const percent = () => {
    if (error) return;
    const v = parseFloat(display);
    if (accum !== null) {
      setDisplay(format((accum * v) / 100));
    } else {
      setDisplay(format(v / 100));
    }
    setJustEvaluated(true);
  };

  const reciprocal = () => {
    if (error) return;
    const v = parseFloat(display);
    setDisplay(v === 0 ? 'Error' : format(1 / v));
    setJustEvaluated(true);
  };

  // Memory
  const memClear = () => setMemory(0);
  const memRecall = () => {
    setDisplay(format(memory));
    setJustEvaluated(true);
  };
  const memStore = () => {
    if (!error) setMemory(parseFloat(display));
  };
  const memAdd = () => {
    if (!error) setMemory(memory + parseFloat(display));
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) {
        inputDigit(k);
      } else if (k === '.') {
        inputDot();
      } else if (k === '+' || k === '-' || k === '*' || k === '/') {
        applyOp(k);
      } else if (k === 'Enter' || k === '=') {
        e.preventDefault();
        equals();
      } else if (k === 'Backspace') {
        backspace();
      } else if (k === 'Escape') {
        clearAll();
      } else if (k === '%') {
        percent();
      } else {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, accum, pendingOp, justEvaluated, memory]);

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--w98-bg)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Display */}
      <div
        style={{
          background: '#fff',
          border: '2px solid',
          borderColor: '#808080 #fff #fff #808080',
          padding: '4px 6px',
          textAlign: 'right',
          fontFamily: 'var(--w98-font-mono)',
          fontSize: 14,
          minHeight: 22,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </div>

      {/* Memory row */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 1fr', gap: 4 }}>
        <div
          style={{
            border: '2px solid',
            borderColor: '#808080 #fff #fff #808080',
            background: '#fff',
            fontSize: 10,
            textAlign: 'center',
            color: 'var(--w98-red)',
            padding: 2,
          }}
        >
          {memory !== 0 ? 'M' : ''}
        </div>
        <CalcBtn label="MC" small color="red" onClick={memClear} />
        <CalcBtn label="MR" small color="red" onClick={memRecall} />
        <CalcBtn label="MS" small color="red" onClick={memStore} />
        <CalcBtn label="M+" small color="red" onClick={memAdd} />
        <CalcBtn label="" small disabled />
      </div>

      {/* Top utility row */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 1fr', gap: 4 }}>
        <div />
        <CalcBtn label="Back" color="red" onClick={backspace} />
        <CalcBtn label="CE" color="red" onClick={clearEntry} />
        <CalcBtn label="C" color="red" onClick={clearAll} />
        <CalcBtn label="±" onClick={toggleSign} />
        <CalcBtn label="√" onClick={sqrt} />
      </div>

      {/* Number pad + ops */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 1fr', gap: 4, flex: 1 }}>
        <div />
        <CalcBtn label="7" color="blue" onClick={() => inputDigit('7')} />
        <CalcBtn label="8" color="blue" onClick={() => inputDigit('8')} />
        <CalcBtn label="9" color="blue" onClick={() => inputDigit('9')} />
        <CalcBtn label="/" color="red" onClick={() => applyOp('/')} />
        <CalcBtn label="%" onClick={percent} />

        <div />
        <CalcBtn label="4" color="blue" onClick={() => inputDigit('4')} />
        <CalcBtn label="5" color="blue" onClick={() => inputDigit('5')} />
        <CalcBtn label="6" color="blue" onClick={() => inputDigit('6')} />
        <CalcBtn label="*" color="red" onClick={() => applyOp('*')} />
        <CalcBtn label="1/x" onClick={reciprocal} />

        <div />
        <CalcBtn label="1" color="blue" onClick={() => inputDigit('1')} />
        <CalcBtn label="2" color="blue" onClick={() => inputDigit('2')} />
        <CalcBtn label="3" color="blue" onClick={() => inputDigit('3')} />
        <CalcBtn label="-" color="red" onClick={() => applyOp('-')} />
        <CalcBtn label="=" color="red" onClick={equals} rowSpan={2} />

        <div />
        <CalcBtn label="0" color="blue" onClick={() => inputDigit('0')} colSpan={2} />
        <CalcBtn label="." color="blue" onClick={inputDot} />
        <CalcBtn label="+" color="red" onClick={() => applyOp('+')} />
      </div>
    </div>
  );
}

function CalcBtn({
  label,
  onClick,
  color,
  small,
  disabled,
  colSpan,
  rowSpan,
}: {
  label: string;
  onClick?: () => void;
  color?: 'blue' | 'red';
  small?: boolean;
  disabled?: boolean;
  colSpan?: number;
  rowSpan?: number;
}) {
  const fg = color === 'blue' ? '#0000a0' : color === 'red' ? '#a80000' : '#000';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'var(--w98-bg)',
        border: '2px solid',
        borderColor: '#fff #808080 #808080 #fff',
        boxShadow: 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #404040',
        fontFamily: 'inherit',
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        color: disabled ? '#808080' : fg,
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        minHeight: small ? 18 : 24,
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : undefined,
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        const el = e.currentTarget;
        el.style.borderColor = '#404040 #fff #fff #404040';
        el.style.boxShadow = 'inset 1px 1px 0 #808080, inset -1px -1px 0 #dfdfdf';
      }}
      onMouseUp={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '#fff #808080 #808080 #fff';
        el.style.boxShadow = 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #404040';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '#fff #808080 #808080 #fff';
        el.style.boxShadow = 'inset 1px 1px 0 #dfdfdf, inset -1px -1px 0 #404040';
      }}
    >
      {label}
    </button>
  );
}
