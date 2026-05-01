'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Solitaire — Klondike (draw 1).
 *
 * Two interaction modes, both fully working:
 *  - Drag-and-drop (HTML5 native): grab a face-up card and drop it onto a
 *    tableau pile, foundation slot, or empty pile. For tableau drags the
 *    cards on top of the grabbed card move with it.
 *  - Click-to-move (legacy): click a card to select, click a destination.
 *    Double-click auto-sends to foundation. Kept as a fallback for users
 *    who prefer it (and because the drag ghost only shows the grabbed
 *    card; click-to-move is sometimes clearer for stack moves).
 *
 * Logic is a from-scratch port of standard Klondike rules (alternating-color
 * descending tableau, same-suit ascending foundations, K-only empty tableau).
 */

type Suit = '♠' | '♥' | '♦' | '♣';
type Color = 'red' | 'black';

interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1-13
  faceUp: boolean;
}

interface GameState {
  stock: Card[];
  waste: Card[];
  tableau: Card[][];   // 7 piles
  foundations: Card[][]; // 4 piles: ♠ ♥ ♦ ♣
}

type Source =
  | { kind: 'waste' }
  | { kind: 'tableau'; pile: number; index: number }
  | { kind: 'foundation'; pile: number };

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

function colorOf(s: Suit): Color {
  return s === '♥' || s === '♦' ? 'red' : 'black';
}

function rankLabel(r: number): string {
  return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r);
}

function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ id: `${s}${r}`, suit: s, rank: r, faceUp: false });
    }
  }
  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal(): GameState {
  const deck = newDeck();
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let pile = 0; pile < 7; pile++) {
    for (let i = pile; i < 7; i++) {
      tableau[i].push(deck[idx++]);
    }
  }
  // Turn top card of each tableau pile face up
  for (let i = 0; i < 7; i++) {
    tableau[i][tableau[i].length - 1].faceUp = true;
  }
  const stock = deck.slice(idx).map((c) => ({ ...c, faceUp: false }));
  return {
    stock,
    waste: [],
    tableau,
    foundations: [[], [], [], []],
  };
}

/** Can `card` be placed on a tableau pile whose top is `top` (or empty)? */
function canPlaceTableau(card: Card, top: Card | undefined): boolean {
  if (!top) return card.rank === 13;
  if (!top.faceUp) return false;
  return colorOf(card.suit) !== colorOf(top.suit) && card.rank === top.rank - 1;
}

/** Can `card` be placed on a foundation pile whose top is `top` (or empty)? Same suit, ascending. */
function canPlaceFoundation(card: Card, top: Card | undefined): boolean {
  if (!top) return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function SolitaireApp(_props: { windowId: string }) {
  const [game, setGame] = useState<GameState>(() => deal());
  const [selected, setSelected] = useState<Source | null>(null);
  /**
   * Active drag source. Held in a ref because drag/drop event ordering is
   * synchronous within a single user gesture, and putting it in state would
   * race the dragend cleanup against the drop handler.
   */
  const dragSrcRef = useRef<Source | null>(null);

  const won = useMemo(() => game.foundations.every((f) => f.length === 13), [game.foundations]);

  function reset() {
    setGame(deal());
    setSelected(null);
    dragSrcRef.current = null;
  }

  /** Returns the stack of cards starting at source (for tableau, cards from index to end). */
  function extractMoving(state: GameState, src: Source): Card[] {
    if (src.kind === 'waste') {
      const c = state.waste[state.waste.length - 1];
      return c ? [c] : [];
    }
    if (src.kind === 'foundation') {
      const c = state.foundations[src.pile][state.foundations[src.pile].length - 1];
      return c ? [c] : [];
    }
    return state.tableau[src.pile].slice(src.index);
  }

  /** Remove the moving cards from source. */
  function removeFromSource(state: GameState, src: Source): GameState {
    const next: GameState = {
      stock: state.stock,
      waste: [...state.waste],
      tableau: state.tableau.map((p) => [...p]),
      foundations: state.foundations.map((p) => [...p]),
    };
    if (src.kind === 'waste') {
      next.waste.pop();
    } else if (src.kind === 'foundation') {
      next.foundations[src.pile].pop();
    } else {
      next.tableau[src.pile] = next.tableau[src.pile].slice(0, src.index);
      // Flip new top if face-down
      const pile = next.tableau[src.pile];
      if (pile.length && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1] = { ...pile[pile.length - 1], faceUp: true };
      }
    }
    return next;
  }

  function placeOnTableau(state: GameState, cards: Card[], pile: number): GameState | null {
    const top = state.tableau[pile][state.tableau[pile].length - 1];
    if (!canPlaceTableau(cards[0], top)) return null;
    const next = { ...state, tableau: state.tableau.map((p) => [...p]) };
    next.tableau[pile] = [...next.tableau[pile], ...cards];
    return next;
  }

  function placeOnFoundation(state: GameState, card: Card, pile: number): GameState | null {
    const top = state.foundations[pile][state.foundations[pile].length - 1];
    if (!canPlaceFoundation(card, top)) return null;
    const next = { ...state, foundations: state.foundations.map((p) => [...p]) };
    next.foundations[pile] = [...next.foundations[pile], card];
    return next;
  }

  /**
   * Apply a move from `src` to `dest` if legal. Returns whether the move
   * landed. Used by both click-to-move and drag-and-drop.
   */
  function performMove(src: Source, dest: Source): boolean {
    const moving = extractMoving(game, src);
    if (!moving.length) return false;
    const afterRemove = removeFromSource(game, src);
    let afterPlace: GameState | null = null;
    if (dest.kind === 'tableau') {
      afterPlace = placeOnTableau(afterRemove, moving, dest.pile);
    } else if (dest.kind === 'foundation') {
      if (moving.length === 1) {
        afterPlace = placeOnFoundation(afterRemove, moving[0], dest.pile);
      }
    }
    if (afterPlace) {
      setGame(afterPlace);
      setSelected(null);
      return true;
    }
    return false;
  }

  /** Click-to-move: try moving the current selection to `dest`. */
  function tryMove(dest: Source) {
    if (!selected) return;
    if (!performMove(selected, dest)) {
      setSelected(null);
    }
  }

  function handleCardClick(src: Source) {
    // Only face-up cards selectable
    const movingCheck = extractMoving(game, src);
    if (!movingCheck.length || !movingCheck[0].faceUp) return;

    if (!selected) {
      setSelected(src);
      return;
    }
    // If clicking the same card, deselect
    if (
      selected.kind === src.kind &&
      (selected as { pile?: number }).pile === (src as { pile?: number }).pile &&
      (selected as { index?: number }).index === (src as { index?: number }).index
    ) {
      setSelected(null);
      return;
    }
    // If dest is a tableau or foundation pile click, try to move there (but moving to foundation only if single card)
    if (src.kind === 'tableau' || src.kind === 'foundation') {
      tryMove(src);
      return;
    }
    setSelected(src);
  }

  /** Click empty tableau pile = destination only. */
  function handleEmptyPileClick(pile: number) {
    if (selected) tryMove({ kind: 'tableau', pile, index: 0 });
  }

  function handleEmptyFoundationClick(pile: number) {
    if (selected) tryMove({ kind: 'foundation', pile });
  }

  function handleStockClick() {
    if (selected) { setSelected(null); return; }
    if (game.stock.length === 0) {
      // Recycle waste → stock (reversed, face down)
      const recycled = [...game.waste].reverse().map((c) => ({ ...c, faceUp: false }));
      setGame({ ...game, stock: recycled, waste: [] });
    } else {
      const drawn = { ...game.stock[game.stock.length - 1], faceUp: true };
      setGame({
        ...game,
        stock: game.stock.slice(0, -1),
        waste: [...game.waste, drawn],
      });
    }
  }

  /** Double-click auto-sends to foundation if possible. */
  function handleDoubleClick(src: Source) {
    const moving = extractMoving(game, src);
    if (moving.length !== 1 || !moving[0].faceUp) return;
    const card = moving[0];
    for (let i = 0; i < 4; i++) {
      const top = game.foundations[i][game.foundations[i].length - 1];
      if (canPlaceFoundation(card, top)) {
        const afterRemove = removeFromSource(game, src);
        const afterPlace = placeOnFoundation(afterRemove, card, i);
        if (afterPlace) {
          setGame(afterPlace);
          setSelected(null);
          return;
        }
      }
    }
  }

  function isSelected(src: Source): boolean {
    if (!selected) return false;
    if (selected.kind !== src.kind) return false;
    if (selected.kind === 'waste') return true;
    if (selected.kind === 'foundation') return (selected as { pile: number }).pile === (src as { pile: number }).pile;
    // tableau
    const s = selected as { pile: number; index: number };
    const d = src as { pile: number; index: number };
    return s.pile === d.pile && d.index >= s.index;
  }

  /* ------------------------- Drag-and-drop wiring ------------------------- */

  function handleDragStart(src: Source, e: React.DragEvent) {
    const moving = extractMoving(game, src);
    if (!moving.length || !moving[0].faceUp) {
      e.preventDefault();
      return;
    }
    dragSrcRef.current = src;
    // dataTransfer.setData is required for drag to actually start in some browsers (Firefox).
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', moving[0].id);
  }

  function handleDragEnd() {
    dragSrcRef.current = null;
  }

  function allowDrop(e: React.DragEvent) {
    if (!dragSrcRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(dest: Source, e: React.DragEvent) {
    e.preventDefault();
    const src = dragSrcRef.current;
    dragSrcRef.current = null;
    if (!src) return;
    // Don't try to drop onto the same source location
    if (
      src.kind === dest.kind &&
      (src as { pile?: number }).pile === (dest as { pile?: number }).pile &&
      (src as { index?: number }).index === (dest as { index?: number }).index
    ) {
      return;
    }
    performMove(src, dest);
  }

  return (
    <div className="sol-root">
      <div className="sol-top">
        {/* Stock */}
        <div className="sol-slot" onClick={handleStockClick}>
          {game.stock.length > 0 ? (
            <div className="sol-card facedown" />
          ) : (
            <div className="sol-empty" title="Recycle" />
          )}
        </div>

        {/* Waste */}
        <div className="sol-slot">
          {game.waste.length > 0 ? (
            (() => {
              const top = game.waste[game.waste.length - 1];
              return (
                <SolCard
                  card={top}
                  selected={isSelected({ kind: 'waste' })}
                  draggable
                  onDragStart={(e) => handleDragStart({ kind: 'waste' }, e)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCardClick({ kind: 'waste' })}
                  onDoubleClick={() => handleDoubleClick({ kind: 'waste' })}
                />
              );
            })()
          ) : (
            <div className="sol-empty" />
          )}
        </div>

        <div className="sol-spacer" />

        {/* Foundations */}
        {[0, 1, 2, 3].map((i) => {
          const pile = game.foundations[i];
          const top = pile[pile.length - 1];
          return (
            <div
              key={i}
              className="sol-slot"
              onClick={() => {
                if (top) handleCardClick({ kind: 'foundation', pile: i });
                else handleEmptyFoundationClick(i);
              }}
              onDragOver={allowDrop}
              onDrop={(e) => handleDrop({ kind: 'foundation', pile: i }, e)}
            >
              {top ? (
                <SolCard
                  card={top}
                  selected={isSelected({ kind: 'foundation', pile: i })}
                  draggable
                  onDragStart={(e) => handleDragStart({ kind: 'foundation', pile: i }, e)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCardClick({ kind: 'foundation', pile: i })}
                  onDoubleClick={() => {}}
                />
              ) : (
                <div className="sol-empty sol-foundation-empty">{SUITS[i]}</div>
              )}
            </div>
          );
        })}

        <button className="btn sol-deal" onClick={reset} type="button">Deal</button>
      </div>

      <div className="sol-tableau">
        {game.tableau.map((pile, i) => (
          <div
            key={i}
            className="sol-pile"
            onClick={() => {
              if (pile.length === 0) handleEmptyPileClick(i);
            }}
            onDragOver={allowDrop}
            onDrop={(e) => handleDrop({ kind: 'tableau', pile: i, index: pile.length }, e)}
          >
            {pile.length === 0 ? (
              <div className="sol-empty" />
            ) : (
              pile.map((card, idx) => (
                <div key={card.id} className="sol-pile-card" style={{ top: idx * 16 }}>
                  {card.faceUp ? (
                    <SolCard
                      card={card}
                      selected={isSelected({ kind: 'tableau', pile: i, index: idx })}
                      draggable
                      onDragStart={(e) =>
                        handleDragStart({ kind: 'tableau', pile: i, index: idx }, e)
                      }
                      onDragEnd={handleDragEnd}
                      onClick={() => handleCardClick({ kind: 'tableau', pile: i, index: idx })}
                      onDoubleClick={() =>
                        idx === pile.length - 1 &&
                        handleDoubleClick({ kind: 'tableau', pile: i, index: idx })
                      }
                    />
                  ) : (
                    <div className="sol-card facedown" />
                  )}
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {won && (
        <div className="sol-win">
          <div>You won!</div>
          <button className="btn" onClick={reset} type="button">Deal again</button>
        </div>
      )}
    </div>
  );
}

interface SolCardProps {
  card: Card;
  selected: boolean;
  draggable?: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

function SolCard({
  card,
  selected,
  draggable,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragEnd,
}: SolCardProps) {
  const color = colorOf(card.suit) === 'red' ? '#a80000' : '#000000';
  return (
    <div
      className={`sol-card faceup${selected ? ' selected' : ''}`}
      style={{ color }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      <div className="sol-card-tl">
        <div>{rankLabel(card.rank)}</div>
        <div>{card.suit}</div>
      </div>
      <div className="sol-card-center">{card.suit}</div>
    </div>
  );
}
