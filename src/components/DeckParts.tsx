// Parti dell'editor del mazzo condivise dalle schede Carte / Statistiche / Info.

import { FormEvent, useEffect, useState } from "react";
import { autoCover, Board, BOARD_LABEL, BOARDS, deckCardToInfo, useDecks } from "../decks";
import type { DeckCard, SavedDeck } from "../decks";
import { CardInfo } from "../types";
import { resolveIdentifiers, searchCards } from "../scryfall";
import { deckTokens } from "../deckStats";
import { formatPrice } from "../prices";
import { useCollection } from "../collection";
import { ManaCost } from "./ManaSymbol";
import { CardDetail } from "./CardDetail";

export const BOARD_TITLE: Record<Board, string> = {
  main: "Main",
  side: "Sideboard",
  maybe: "Maybeboard",
};

// --- Ricerca e aggiunta di carte singole -------------------------------------

export function AddCardSearch({ deckId, onClose }: { deckId: string; onClose?: () => void }) {
  const decks = useDecks();
  const deck = decks.get(deckId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [opened, setOpened] = useState<CardInfo | null>(null);
  function closeSearch() {
    setQuery("");
    setResults(null);
    setError(null);
    setLastAdded(null);
    onClose?.();
  }

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      setResults((await searchCards(q)).slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function add(c: CardInfo, b: Board) {
    decks.addCard(deckId, c, b);
    setLastAdded(`${c.printedName ?? c.name} → ${BOARD_TITLE[b]}`);
  }

  const inDeck = (name: string, b: Board) =>
    (deck?.cards ?? [])
      .filter((c) => c.board === b && c.name === name)
      .reduce((s, c) => s + c.qty, 0);

  return (
    <>
      <strong style={{ fontSize: 14 }}>🔍 Aggiungi carta</strong>
      <form className="row add-card-form" style={{ marginTop: 8 }} onSubmit={doSearch}>
        <input
          autoFocus
          type="search"
          className="deck-name-input"
          style={{ margin: 0 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome della carta, anche in italiano…"
          aria-label="Cerca una carta da aggiungere al mazzo"
        />
        <button className="primary" type="submit" disabled={searching || !query.trim()}>
          {searching ? "Cerco…" : "Cerca"}
        </button>
        {(results || query || onClose) && (
          <button
            type="button"
            className="ghost search-close"
            onClick={closeSearch}
            aria-label="Chiudi la ricerca"
            title="Chiudi la ricerca"
          >
            ✕ Chiudi
          </button>
        )}
      </form>
      {results && (
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          <strong>+Main</strong>, <strong>+Side</strong> o <strong>+Maybe</strong> aggiungono
          una copia al mazzo. Tocca la carta per
          vederla e sceglierne l'edizione.
        </p>
      )}
      {error && <div className="status-line error" style={{ marginTop: 8 }}>{error}</div>}
      {lastAdded && <div className="add-card-ok small">✓ Aggiunta: {lastAdded}</div>}
      {results && results.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>
          Nessuna carta trovata.
        </div>
      )}
      {results && results.length > 0 && (
        <div className="add-card-results">
          {results.map((c) => {
            const counts = BOARDS.map((b) => [b, inDeck(c.name, b)] as const).filter(
              ([, n]) => n > 0,
            );
            return (
              <div key={c.scryfallId ?? c.name} className="add-card-row deck-add-row">
                <button type="button" className="acr-open" onClick={() => setOpened(c)}>
                  {c.imageSmallUrl ? (
                    <img src={c.imageSmallUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="acr-noimg" />
                  )}
                  <span className="acr-main">
                    <span className="acr-name">
                      {c.printedName ?? c.name}{" "}
                      {c.manaCost && <ManaCost cost={c.manaCost} size={13} />}
                    </span>
                    <span className="muted small">
                      {c.printedName ? `${c.name} · ` : ""}
                      {(c.setCode ?? "").toUpperCase()} · {formatPrice(c)}
                      {counts.length > 0 &&
                        ` · nel mazzo: ${counts.map(([b, n]) => `${n} ${BOARD_LABEL[b]}`).join(", ")}`}
                    </span>
                  </span>
                </button>
                <span className="dar-btns">
                  {BOARDS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`ghost${b === "main" ? " dar-main" : ""}`}
                      onClick={() => add(c, b)}
                      title={`Aggiungi a ${BOARD_TITLE[b]}`}
                    >
                      +{BOARD_LABEL[b]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {opened && <CardDetail card={opened} deckId={deckId} onClose={() => setOpened(null)} />}
    </>
  );
}

// --- Pedine -----------------------------------------------------------------

// Immagini delle pedine già scaricate (in memoria, per tutta la sessione).
const tokenImages = new Map<string, string | null>();

export function TokenList({
  tokens,
  loading,
}: {
  tokens: ReturnType<typeof deckTokens>;
  loading: boolean;
}) {
  const [, force] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    const todo = tokens.filter((t) => !tokenImages.has(t.id));
    if (todo.length === 0) return;
    todo.forEach((t) => tokenImages.set(t.id, null));
    resolveIdentifiers(todo.map((t) => ({ id: t.id })))
      .then((cards) => {
        for (const c of cards)
          if (c.scryfallId) tokenImages.set(c.scryfallId, c.imageUrl ?? c.imageSmallUrl ?? null);
        force((n) => n + 1);
      })
      .catch(() => undefined);
  }, [tokens]);

  if (tokens.length === 0)
    return (
      <div className="muted small">
        {loading ? "Controllo le pedine delle carte…" : "Nessuna carta del mazzo crea pedine."}
      </div>
    );
  return (
    <>
      <div className="token-grid">
        {tokens.map((t) => {
          const img = tokenImages.get(t.id);
          return (
            <button
              type="button"
              key={t.id}
              className={`token-item${t.inMain ? "" : " side-only"}`}
              onClick={() => img && setZoom(img)}
              title={`Creata da: ${t.from.join(", ")}`}
            >
              {img ? <img src={img} alt={t.name} loading="lazy" /> : <span className="token-noimg">{t.name}</span>}
              <span className="token-name">{t.name}</span>
              <span className="token-from muted">
                da {t.from.join(", ")}
                {!t.inMain && " (side)"}
              </span>
            </button>
          );
        })}
      </div>
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <img className="token-zoom" src={zoom} alt="" />
        </div>
      )}
    </>
  );
}

// --- Copertina ---------------------------------------------------------------

export function CoverPicker({ deck, onClose }: { deck: SavedDeck; onClose: () => void }) {
  const decks = useDecks();
  const auto = autoCover(deck);
  // Una sola opzione per carta (stessa illustrazione in main e side).
  const seen = new Set<string>();
  const options: { url: string; name: string }[] = [];
  for (const c of [...deck.cards].sort((a, b) => Number(a.isLand) - Number(b.isLand) || b.cmc - a.cmc)) {
    const url = c.artCropUrl ?? c.imageUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    options.push({ url, name: c.name });
  }
  const pick = (url: string | undefined) => {
    decks.setCover(deck.id, url);
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cover-picker" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h2 style={{ margin: "0 0 4px" }}>Immagine del mazzo</h2>
        <p className="muted small" style={{ margin: "0 0 10px" }}>
          Scegli l'illustrazione di una carta del mazzo. Per un'altra illustrazione
          della stessa carta, aprila e cambia edizione.
        </p>
        <div className="cover-grid">
          <button
            type="button"
            className={`cover-opt${!deck.coverImageUrl ? " active" : ""}`}
            onClick={() => pick(undefined)}
          >
            <span
              className="cover-img"
              style={auto ? { backgroundImage: `url(${auto})` } : undefined}
            />
            <span className="cover-name">Automatica</span>
          </button>
          {options.map((o) => (
            <button
              key={o.url}
              type="button"
              className={`cover-opt${deck.coverImageUrl === o.url ? " active" : ""}`}
              onClick={() => pick(o.url)}
            >
              <span className="cover-img" style={{ backgroundImage: `url(${o.url})` }} />
              <span className="cover-name">{o.name}</span>
            </button>
          ))}
        </div>
        {options.length === 0 && (
          <div className="muted small">Aggiungi qualche carta al mazzo per scegliere l'immagine.</div>
        )}
      </div>
    </div>
  );
}

// --- Possesso delle carte rispetto alla collezione ---------------------------

export const isBasicLand = (c: DeckCard) => /\bBasic\b/.test(c.typeLine);

/** Copie richieste per nome, sommando main e sideboard (non la maybeboard). */
export function neededByName(deck: SavedDeck): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of deck.cards) {
    if (c.board === "maybe") continue;
    const k = c.name.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + c.qty);
  }
  return m;
}

/** Copie che mancano in collezione (terre base escluse) e il loro costo stimato. */
export function missingCards(deck: SavedDeck, owned: Map<string, number>) {
  let copies = 0;
  let valueEur = 0;
  const list: { card: DeckCard; lack: number }[] = [];
  for (const [k, n] of neededByName(deck)) {
    const card = deck.cards.find((c) => c.name.toLowerCase() === k && c.board !== "maybe")!;
    if (isBasicLand(card)) continue;
    const lack = Math.max(0, n - (owned.get(k) ?? 0));
    if (lack > 0) list.push({ card, lack });
    copies += lack;
    valueEur += lack * (card.prices?.eur ?? card.prices?.usd ?? 0);
  }
  return { copies, valueEur, list };
}

/** Possesso in collezione; toccandolo aggiunge una copia di questa stampa alla collezione. */
export function OwnBadge({ card, have, need }: { card: DeckCard; have: number; need: number }) {
  const collection = useCollection();
  if (isBasicLand(card)) return null;
  const info = deckCardToInfo(card);
  const add = () => info && collection.add(info, { foil: false });
  const ok = have >= need;
  return (
    <button
      type="button"
      className={`dl-own dl-own-btn ${ok ? "ok" : "miss"}`}
      onClick={add}
      disabled={!info}
      title={`Nella collezione: ${have}${ok ? "" : ` su ${need}`}. Tocca per aggiungerne una copia.`}
      aria-label={`Aggiungi ${card.name} alla collezione (ne hai ${have})`}
    >
      {ok ? "✓" : `manca ${need - have}`} <span className="dl-own-plus">＋</span>
    </button>
  );
}
