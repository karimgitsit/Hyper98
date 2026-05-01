'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useWindowStore } from '@/stores/windowStore';

/**
 * Minesweeper — Win98 with three difficulty levels.
 *
 * Logic is a from-scratch port of the standard Minesweeper algorithm
 * (first-click safe, flood-fill reveal on zeros, right-click flags).
 * Styled with hyper98 design tokens — no styled-components.
 */

type CellState = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

type DifficultyKey = 'beginner' | 'intermediate' | 'expert';

interface Difficulty {
  rows: number;
  cols: number;
  mines: number;
  /** Desired window width/height so the board fits. */
  width: number;
  height: number;
}

const DIFFICULTIES: Record<DifficultyKey, Difficulty> = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, width: 164, height: 252 },
  intermediate: { rows: 16, cols: 16, mines: 40, width: 276, height: 364 },
  expert:       { rows: 16, cols: 30, mines: 99, width: 500, height: 364 },
};

const NUM_COLORS = [
  '',          // 0 — never rendered
  '#0000ff',   // 1 blue
  '#008000',   // 2 green
  '#ff0000',   // 3 red
  '#000080',   // 4 navy
  '#800000',   // 5 maroon
  '#008080',   // 6 teal
  '#000000',   // 7 black
  '#808080',   // 8 grey
];

/** 12x12 pixel-art mine: 8-spike black bomb with a white highlight. */
function MineGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ imageRendering: 'pixelated', display: 'block' }}
      aria-hidden
    >
      {/* Body */}
      <rect x="3" y="3" width="6" height="6" fill="#000" />
      {/* Cardinal spikes */}
      <rect x="5" y="1" width="2" height="2" fill="#000" />
      <rect x="5" y="9" width="2" height="2" fill="#000" />
      <rect x="1" y="5" width="2" height="2" fill="#000" />
      <rect x="9" y="5" width="2" height="2" fill="#000" />
      {/* Diagonal spikes */}
      <rect x="2" y="2" width="1" height="1" fill="#000" />
      <rect x="9" y="2" width="1" height="1" fill="#000" />
      <rect x="2" y="9" width="1" height="1" fill="#000" />
      <rect x="9" y="9" width="1" height="1" fill="#000" />
      {/* Highlight */}
      <rect x="4" y="4" width="1" height="1" fill="#fff" />
    </svg>
  );
}

/** 12x12 pixel-art flag: red stepped pennant on a black pole with a base. */
function FlagGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ imageRendering: 'pixelated', display: 'block' }}
      aria-hidden
    >
      {/* Flag (stepped triangle pointing left) */}
      <rect x="5" y="2" width="3" height="1" fill="#ff0000" />
      <rect x="4" y="3" width="4" height="1" fill="#ff0000" />
      <rect x="3" y="4" width="5" height="1" fill="#ff0000" />
      <rect x="2" y="5" width="6" height="1" fill="#ff0000" />
      <rect x="3" y="6" width="5" height="1" fill="#ff0000" />
      <rect x="4" y="7" width="4" height="1" fill="#ff0000" />
      <rect x="5" y="8" width="3" height="1" fill="#ff0000" />
      {/* Pole */}
      <rect x="7" y="2" width="1" height="8" fill="#000" />
      {/* Base */}
      <rect x="5" y="10" width="4" height="1" fill="#000" />
      <rect x="3" y="11" width="8" height="1" fill="#000" />
    </svg>
  );
}

function emptyBoard(rows: number, cols: number): CellState[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );
}

/** Place mines AFTER first click so the first click is always safe. */
function plantMines(
  board: CellState[][],
  mines: number,
  safeR: number,
  safeC: number,
): CellState[][] {
  const rows = board.length;
  const cols = board[0].length;
  const next = board.map((row) => row.map((c) => ({ ...c })));
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if ((r === safeR && c === safeC) || next[r][c].mine) continue;
    next[r][c].mine = true;
    placed++;
  }
  // Compute adjacency
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && next[nr][nc].mine) count++;
        }
      }
      next[r][c].adjacent = count;
    }
  }
  return next;
}

/** Flood-fill reveal starting from (r,c). */
function revealFrom(board: CellState[][], r: number, c: number): CellState[][] {
  const rows = board.length;
  const cols = board[0].length;
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = next[cr][cc];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.mine || cell.adjacent > 0) continue;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = cr + dr;
        const nc = cc + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) stack.push([nr, nc]);
      }
    }
  }
  return next;
}

function checkWin(b: CellState[][]): boolean {
  for (let r = 0; r < b.length; r++) {
    for (let c = 0; c < b[0].length; c++) {
      const cell = b[r][c];
      if (!cell.mine && !cell.revealed) return false;
    }
  }
  return true;
}

function formatLed(n: number): string {
  const clamped = Math.max(-99, Math.min(999, n));
  if (clamped < 0) return '-' + String(Math.abs(clamped)).padStart(2, '0');
  return String(clamped).padStart(3, '0');
}

export function MinesweeperApp({ windowId }: { windowId: string }) {
  const [difficulty, setDifficulty] = useState<DifficultyKey>('beginner');
  const config = DIFFICULTIES[difficulty];

  const [board, setBoard] = useState<CellState[][]>(() => emptyBoard(config.rows, config.cols));
  const [firstClick, setFirstClick] = useState(true);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [timer, setTimer] = useState(0);
  const [pressed, setPressed] = useState(false); // for scared-smiley during mouse-down
  const startedAt = useRef<number | null>(null);

  // Game menu dropdown
  const gameBtnRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const resizeWindow = useWindowStore((s) => s.resize);

  // Timer ticks while playing
  useEffect(() => {
    if (status !== 'playing' || firstClick) return;
    const id = window.setInterval(() => {
      if (startedAt.current) {
        setTimer(Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000)));
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [status, firstClick]);

  const flagsUsed = useMemo(
    () => board.reduce((sum, row) => sum + row.filter((c) => c.flagged).length, 0),
    [board]
  );

  function resetWith(next: DifficultyKey) {
    const cfg = DIFFICULTIES[next];
    setDifficulty(next);
    setBoard(emptyBoard(cfg.rows, cfg.cols));
    setFirstClick(true);
    setStatus('playing');
    setTimer(0);
    startedAt.current = null;
    resizeWindow(windowId, cfg.width, cfg.height);
  }

  function reset() {
    resetWith(difficulty);
  }

  function handleLeftClick(r: number, c: number) {
    if (status !== 'playing') return;
    if (board[r][c].flagged || board[r][c].revealed) return;

    let next = board;
    if (firstClick) {
      next = plantMines(board, config.mines, r, c);
      setFirstClick(false);
      startedAt.current = Date.now();
    }

    if (next[r][c].mine) {
      // Reveal ALL mines on loss
      next = next.map((row) =>
        row.map((cell) => (cell.mine ? { ...cell, revealed: true } : cell))
      );
      setBoard(next);
      setStatus('lost');
      return;
    }

    next = revealFrom(next, r, c);
    setBoard(next);
    if (checkWin(next)) {
      setStatus('won');
      // Auto-flag remaining mines on win
      setBoard(next.map((row) => row.map((cell) => (cell.mine ? { ...cell, flagged: true } : cell))));
    }
  }

  function handleRightClick(e: React.MouseEvent, r: number, c: number) {
    e.preventDefault();
    if (status !== 'playing' || firstClick) return;
    if (board[r][c].revealed) return;
    const next = board.map((row) => row.map((cell) => ({ ...cell })));
    next[r][c].flagged = !next[r][c].flagged;
    setBoard(next);
  }

  function openGameMenu() {
    const el = gameBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom });
  }

  const gameMenuItems: ContextMenuItem[] = [
    { label: '&New', onClick: () => reset() },
    { separator: true, label: '' },
    {
      label: `${difficulty === 'beginner' ? '✓ ' : '   '}&Beginner`,
      onClick: () => resetWith('beginner'),
    },
    {
      label: `${difficulty === 'intermediate' ? '✓ ' : '   '}&Intermediate`,
      onClick: () => resetWith('intermediate'),
    },
    {
      label: `${difficulty === 'expert' ? '✓ ' : '   '}&Expert`,
      onClick: () => resetWith('expert'),
    },
  ];

  const smiley = status === 'won' ? '😎' : status === 'lost' ? '😵' : pressed ? '😮' : '🙂';
  const minesRemaining = config.mines - flagsUsed;

  return (
    <div className="mines-wrapper">
      <div className="menubar">
        <div
          ref={gameBtnRef}
          className="menubar-item"
          onClick={openGameMenu}
        >
          <u>G</u>ame
        </div>
      </div>
      <div
        className="mines-root"
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
      >
        <div className="mines-header">
          <div className="mines-led">{formatLed(minesRemaining)}</div>
          <button className="mines-smiley" onClick={reset} type="button">
            <span aria-hidden>{smiley}</span>
          </button>
          <div className="mines-led">{formatLed(timer)}</div>
        </div>
        <div className="mines-board">
          {board.map((row, r) => (
            <div key={r} className="mines-row">
              {row.map((cell, c) => {
                const classes = ['mines-cell'];
                if (cell.revealed) classes.push('revealed');
                if (cell.revealed && cell.mine) classes.push('mine');
                return (
                  <div
                    key={c}
                    className={classes.join(' ')}
                    onClick={() => handleLeftClick(r, c)}
                    onContextMenu={(e) => handleRightClick(e, r, c)}
                    style={
                      cell.revealed && !cell.mine && cell.adjacent > 0
                        ? { color: NUM_COLORS[cell.adjacent] }
                        : undefined
                    }
                  >
                    {cell.revealed
                      ? cell.mine
                        ? <MineGlyph />
                        : cell.adjacent > 0
                          ? cell.adjacent
                          : ''
                      : cell.flagged
                        ? <FlagGlyph />
                        : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={gameMenuItems}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
}
