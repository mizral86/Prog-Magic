// Riquadro "Aggiungi a un mazzo" nella scheda carta: scegli il mazzo e la
// sezione (main, side, maybeboard). Aggiunge la stampa mostrata.

import { useEffect, useState } from "react";
import { Board, BOARD_LABEL, BOARDS, useDecks } from "../decks";
import { CardInfo } from "../types";

export function AddToDeckBox({
  card,
  deckId,
}: {
  card: CardInfo;
  /** Mazzo proposto (es. quello aperto nell'editor). */
  deckId?: string;
}) {
  const decks = useDecks();
  const [target, setTarget] = useState<string>(deckId ?? decks.decks[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMsg(null), [card]);

  if (decks.decks.length === 0) return null;
  const deck = decks.get(target) ?? decks.decks[0];
  const inDeck = (b: Board) =>
    deck.cards
      .filter((c) => c.board === b && c.name === card.name)
      .reduce((s, c) => s + c.qty, 0);

  function add(b: Board) {
    decks.addCard(deck.id, card, b);
    setMsg(`✓ Aggiunta a ${deck.name} (${BOARD_LABEL[b]})`);
  }

  return (
    <div className="collect-box add-to-deck">
      <div className="collect-status">
        Aggiungi al mazzo{" "}
        {deckId && decks.decks.length === 1 ? (
          <strong>{deck.name}</strong>
        ) : (
          <select
            className="atd-select"
            value={deck.id}
            onChange={(e) => {
              setTarget(e.target.value);
              setMsg(null);
            }}
            aria-label="Mazzo"
          >
            {decks.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="collect-actions">
        {BOARDS.map((b) => {
          const n = inDeck(b);
          return (
            <button key={b} type="button" className="ghost" onClick={() => add(b)}>
              + {BOARD_LABEL[b]}
              {n > 0 && <span className="muted"> ({n})</span>}
            </button>
          );
        })}
      </div>
      {msg && <div className="add-card-ok small">{msg}</div>}
    </div>
  );
}
