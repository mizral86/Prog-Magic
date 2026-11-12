// Scheda di una carta DENTRO un mazzo: quantità, spostamento tra main, side e
// maybeboard, cambio edizione, copertina del mazzo e carte simili.

import { useEffect, useState } from "react";
import { Board, BOARD_LABEL, BOARDS, isScryfallId, useDecks } from "../decks";
import { CardInfo } from "../types";
import { cardById, cardByFuzzyName, getPrintings } from "../scryfall";
import { bestPrice, formatMoney, formatPrice } from "../prices";
import { findSimilar, SimilarResult } from "../similar";
import { ManaCost } from "./ManaSymbol";
import { CardDetail } from "./CardDetail";

export function DeckCardSheet({
  deckId,
  cardId,
  board,
  onMoved,
  onClose,
}: {
  deckId: string;
  cardId: string;
  board: Board;
  /** La voce ha cambiato id o sezione (spostata tutta, nuova edizione). */
  onMoved: (cardId: string, board: Board) => void;
  onClose: () => void;
}) {
  const decks = useDecks();
  const deck = decks.get(deckId);
  const entry = deck?.cards.find((c) => c.id === cardId && c.board === board);
  const [full, setFull] = useState<CardInfo | null>(null);
  const [printings, setPrintings] = useState<CardInfo[] | null>(null);
  const [similar, setSimilar] = useState<SimilarResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simErr, setSimErr] = useState<string | null>(null);
  const [opened, setOpened] = useState<CardInfo | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const name = entry?.name;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Dati completi della stampa (testo regole per le carte simili).
  useEffect(() => {
    if (!name) return;
    let off = false;
    setFull(null);
    (isScryfallId(cardId) ? cardById(cardId) : cardByFuzzyName(name))
      .then((c) => !off && setFull(c))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [cardId, name]);

  useEffect(() => {
    if (!name) return;
    let off = false;
    setPrintings(null);
    getPrintings(name)
      .then((p) => !off && setPrintings(p))
      .catch(() => !off && setPrintings([]));
    return () => {
      off = true;
    };
  }, [name]);

  // Ultima copia tolta: la scheda si chiude.
  const gone = !deck || !entry;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (!deck || !entry) return null;

  const qtyIn = (b: Board) =>
    deck.cards.filter((c) => c.board === b && c.name === entry.name).reduce((s, c) => s + c.qty, 0);
  const art = entry.artCropUrl ?? entry.imageUrl;
  const isCover = !!art && deck.coverImageUrl === art;

  function move(to: Board, all: boolean) {
    if (!entry) return;
    decks.moveCard(deckId, entry.id, board, to, all ? entry.qty : 1);
    if (all || entry.qty <= 1) onMoved(entry.id, to);
  }

  async function loadSimilar() {
    const base = full;
    if (!base) return;
    setSimBusy(true);
    setSimErr(null);
    try {
      setSimilar(await findSimilar(base));
    } catch (err) {
      setSimErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSimBusy(false);
    }
  }

  function addSimilar(c: CardInfo, b: Board) {
    decks.addCard(deckId, c, b);
    setAdded(`✓ ${c.printedName ?? c.name} → ${BOARD_LABEL[b]}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal deck-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <div className="detail">
          <div className="detail-img">
            {entry.imageUrl ? (
              <img src={entry.imageUrl} alt={entry.name} />
            ) : (
              <div className="no-img">{entry.name}</div>
            )}
          </div>
          <div className="detail-body">
            <h2 style={{ margin: "0 0 2px" }}>{entry.name}</h2>
            {entry.printedName && <div className="muted small">{entry.printedName}</div>}
            <div className="muted small">
              {entry.manaCost && (
                <>
                  <ManaCost cost={entry.manaCost} size={16} /> ·{" "}
                </>
              )}
              {entry.typeLine}
            </div>
            <div className="muted small" style={{ marginTop: 2 }}>
              {entry.setName ?? (entry.setCode ?? "").toUpperCase()}
              {entry.collectorNumber ? ` #${entry.collectorNumber}` : ""}
              {" · "}
              {formatPrice({ prices: entry.prices } as CardInfo)}
            </div>

            {/* Quantità e spostamento */}
            <div className="collect-box">
              <div className="collect-status">
                In <strong>{BOARD_LABEL[board]}</strong>:
                <span className="stepper" style={{ marginLeft: 8 }}>
                  <button
                    type="button"
                    aria-label="Una copia in meno"
                    onClick={() => decks.setQty(deckId, entry.id, board, entry.qty - 1)}
                  >
                    −
                  </button>
                  <span className="stepper-val">{entry.qty}</span>
                  <button
                    type="button"
                    aria-label="Una copia in più"
                    onClick={() => decks.setQty(deckId, entry.id, board, entry.qty + 1)}
                  >
                    +
                  </button>
                </span>
              </div>
              <div className="sheet-moves">
                {BOARDS.filter((b) => b !== board).map((b) => (
                  <div key={b} className="sheet-move">
                    <span className="muted small">
                      Sposta in {BOARD_LABEL[b]}
                      {qtyIn(b) > 0 && ` (ne ha ${qtyIn(b)})`}
                    </span>
                    <button type="button" className="ghost" onClick={() => move(b, false)}>
                      1 copia
                    </button>
                    {entry.qty > 1 && (
                      <button type="button" className="ghost" onClick={() => move(b, true)}>
                        Tutte ({entry.qty})
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="collect-actions">
                <button
                  type="button"
                  className={`ghost${isCover ? " active" : ""}`}
                  disabled={!art}
                  onClick={() => decks.setCover(deckId, isCover ? undefined : art)}
                >
                  {isCover ? "★ Copertina del mazzo" : "☆ Usa come copertina"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    decks.removeCard(deckId, entry.id, board);
                    onClose();
                  }}
                >
                  ✕ Togli dal mazzo
                </button>
              </div>
            </div>

            {/* Carte simili */}
            <h3 className="mini-title">Carte simili</h3>
            {!similar && (
              <button
                type="button"
                className="ghost similar-btn"
                onClick={loadSimilar}
                disabled={simBusy || !full}
              >
                {simBusy
                  ? "Cerco…"
                  : full
                    ? "💡 Suggerisci carte che fanno la stessa cosa"
                    : "Carico il testo della carta…"}
              </button>
            )}
            {simErr && <div className="status-line error">{simErr}</div>}
            {similar && (
              <div className="similar">
                <div className="muted small">
                  {similar.reasons.length
                    ? `Cercate in tutti i colori: ${similar.reasons.join(" + ")}.`
                    : "Non riesco a capire cosa fa questa carta dal suo testo."}
                  {similar.reasons.length > 0 && similar.cards.length === 0 && " Nessuna carta trovata."}
                </div>
                {added && <div className="add-card-ok small">{added}</div>}
                <div className="sim-add-list">
                  {similar.cards.map((c) => (
                    <div key={c.scryfallId ?? c.name} className="sim-add-row">
                      <button type="button" className="sim-open" onClick={() => setOpened(c)}>
                        {c.imageSmallUrl ? (
                          <img src={c.imageSmallUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="acr-noimg" />
                        )}
                        <span className="sim-main">
                          <span className="sr-top">
                            <span className="sr-name">{c.printedName ?? c.name}</span>
                            {c.manaCost && <ManaCost cost={c.manaCost} size={13} />}
                          </span>
                          <span className="muted small">
                            {c.typeLine} · {formatPrice(c)}
                          </span>
                        </span>
                      </button>
                      <span className="sim-btns">
                        {BOARDS.map((b) => (
                          <button
                            key={b}
                            type="button"
                            className="ghost"
                            onClick={() => addSimilar(c, b)}
                            title={`Aggiungi a ${BOARD_LABEL[b]}`}
                          >
                            +{BOARD_LABEL[b]}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edizione */}
            <h3 className="mini-title">Edizione nel mazzo</h3>
            <p className="muted small" style={{ margin: "0 0 6px" }}>
              Tocca un'edizione per usarla in questo mazzo (cambia immagine e prezzo).
            </p>
            {!printings && <div className="muted small">Carico le stampe…</div>}
            {printings && printings.length > 0 && (
              <div className="print-pick">
                {printings.map((pr) => {
                  const p = bestPrice(pr);
                  const active = pr.scryfallId === entry.id;
                  return (
                    <button
                      key={pr.scryfallId}
                      type="button"
                      className={`print-opt${active ? " active" : ""}`}
                      title={pr.setName}
                      onClick={() => {
                        if (active || !pr.scryfallId) return;
                        decks.changePrinting(deckId, entry.id, board, pr);
                        onMoved(pr.scryfallId, board);
                      }}
                    >
                      {pr.imageSmallUrl ? (
                        <img src={pr.imageSmallUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="acr-noimg" />
                      )}
                      <span className="po-set">
                        {(pr.setCode ?? "").toUpperCase()} #{pr.collectorNumber}
                      </span>
                      <span className="po-price">{p ? formatMoney(p.value, p.currency) : "—"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {printings && printings.length === 0 && (
              <div className="muted small">Nessuna stampa trovata.</div>
            )}
          </div>
        </div>
      </div>
      {opened && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardDetail card={opened} deckId={deckId} onClose={() => setOpened(null)} />
        </div>
      )}
    </div>
  );
}
