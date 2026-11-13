// Editor di un mazzo, in tre schede: Carte (liste e ricerca), Statistiche
// (curva, costi e produzione di mana, tipi, pedine) e Info (valore, note,
// legalità, prova del mazzo, import/export).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Board,
  BOARD_LABEL,
  BOARDS,
  deckCoverUrl,
  Format,
  isScryfallId,
  useDecks,
} from "../decks";
import type { DeckCard, SavedDeck } from "../decks";
import { COLORS } from "../types";
import { CardIdentifier, resolveIdentifiers } from "../scryfall";
import { deckStats, typeLabel } from "../deckStats";
import { formatMoney } from "../prices";
import { ownedByName, useCollection } from "../collection";
import { ManaCost, ManaSymbol } from "./ManaSymbol";
import { DeckCardSheet } from "./DeckCardSheet";
import { AddCardSearch, BOARD_TITLE, CoverPicker, neededByName, OwnBadge } from "./DeckParts";
import { DeckStatsTab } from "./DeckStatsTab";
import { DeckInfoTab } from "./DeckInfoTab";

export const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

type Tab = "cards" | "stats" | "info";
const TAB_KEY = "pm.deckTab";

export function DeckEditor({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const decks = useDecks();
  const deck = decks.get(deckId);
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      return t === "stats" || t === "info" ? t : "cards";
    } catch {
      return "cards";
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignora */
    }
  };
  const [sheet, setSheet] = useState<{ id: string; board: Board } | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const stats = useMemo(() => (deck ? deckStats(deck) : null), [deck]);

  // Mazzi creati con versioni precedenti: si scaricano una volta da Scryfall
  // i dati mancanti (pedine, illustrazione, edizione, mana prodotto).
  const enriching = useRef(new Set<string>());
  const [enrichBusy, setEnrichBusy] = useState(false);
  useEffect(() => {
    if (!deck) return;
    const todo = deck.cards.filter(
      (c) =>
        (c.tokens === undefined || c.drawRamp === undefined || c.producedMana === undefined) &&
        !enriching.current.has(c.id),
    );
    if (todo.length === 0) return;
    todo.forEach((c) => enriching.current.add(c.id));
    const ids: CardIdentifier[] = todo.map((c) =>
      isScryfallId(c.id) ? { id: c.id } : { name: c.name },
    );
    setEnrichBusy(true);
    resolveIdentifiers(ids)
      .then((cards) => decks.refreshCards(deckId, cards))
      .catch(() => undefined)
      .finally(() => setEnrichBusy(false));
  }, [deck, deckId, decks]);

  // Prezzi: una volta al giorno si rileggono da Scryfall. Le stampe senza
  // prezzo in euro (spesso quelle in italiano o promo) prendono il prezzo
  // della stampa inglese più comune della stessa carta.
  const pricing = useRef(false);
  useEffect(() => {
    if (!deck || pricing.current || deck.cards.length === 0) return;
    const stale = !deck.pricesAt || Date.now() - deck.pricesAt > 20 * 3600 * 1000;
    const noEur = deck.cards.some((c) => c.prices?.eur == null && !/\bBasic\b/.test(c.typeLine));
    if (!stale && !noEur) return;
    pricing.current = true;
    refreshDeckPrices(deck)
      .then((m) => decks.updatePrices(deckId, m))
      .catch(() => undefined);
  }, [deck, deckId, decks]);

  if (!deck || !stats) {
    return (
      <div className="page">
        <button className="ghost" onClick={onBack}>
          ← Indietro
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
          Mazzo non trovato.
        </p>
      </div>
    );
  }

  const cover = deckCoverUrl(deck);
  const identity = COLORS.filter((col) =>
    deck.cards.some((c) => c.board !== "maybe" && (c.colorIdentity ?? []).includes(col)),
  );
  const target = deck.format === "commander" ? 100 : 60;

  return (
    <div className="page deck-page">
      <header
        className={`deck-head${cover ? "" : " deck-head--empty"}`}
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      >
        <button type="button" className="deck-head-back" onClick={onBack} aria-label="Tutti i mazzi">
          ←
        </button>
        <div className="deck-head-main">
          <h1 className="deck-head-name">{deck.name}</h1>
          <div className="deck-head-sub">
            {FORMAT_LABEL[deck.format]} · {stats.mainCount}/{target}
            {stats.sideCount > 0 && ` · side ${stats.sideCount}`}
            <span className="deck-head-pips">
              {identity.map((c) => (
                <ManaSymbol key={c} sym={c} size={18} />
              ))}
            </span>
          </div>
        </div>
        <span className="deck-head-price">{formatMoney(stats.totalPriceEur, "EUR")}</span>
        <button
          type="button"
          className="deck-head-cover"
          onClick={() => setCoverOpen(true)}
          aria-label="Cambia immagine del mazzo"
          title="Cambia immagine del mazzo"
        >
          🖼
        </button>
      </header>

      <nav className="deck-tabs" role="tablist">
        {(
          [
            ["cards", "🂠", "Carte"],
            ["stats", "📊", "Statistiche"],
            ["info", "ℹ", "Info"],
          ] as const
        ).map(([t, icon, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`deck-tab${tab === t ? " on" : ""}`}
            onClick={() => setTab(t)}
          >
            <span className="deck-tab-ico" aria-hidden="true">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>

      {tab === "cards" && <CardsTab deck={deck} onOpen={(c) => setSheet({ id: c.id, board: c.board })} />}
      {tab === "stats" && <DeckStatsTab deck={deck} enrichBusy={enrichBusy} />}
      {tab === "info" && (
        <DeckInfoTab deck={deck} onBack={onBack} onCover={() => setCoverOpen(true)} />
      )}

      {sheet && (
        <DeckCardSheet
          deckId={deckId}
          cardId={sheet.id}
          board={sheet.board}
          onMoved={(id, board) => setSheet({ id, board })}
          onClose={() => setSheet(null)}
        />
      )}
      {coverOpen && <CoverPicker deck={deck} onClose={() => setCoverOpen(false)} />}
    </div>
  );
}

/** Prezzi aggiornati per ogni carta del mazzo (id → prezzi). */
async function refreshDeckPrices(deck: SavedDeck): Promise<Map<string, DeckCard["prices"]>> {
  const out = new Map<string, DeckCard["prices"]>();
  const ids = [...new Set(deck.cards.map((c) => c.id).filter(isScryfallId))];
  if (ids.length) {
    for (const c of await resolveIdentifiers(ids.map((id) => ({ id }))))
      if (c.scryfallId) out.set(c.scryfallId, c.prices);
  }
  // Senza euro: prezzo della stampa predefinita (inglese) cercata per nome.
  const missing = deck.cards.filter((c) => (out.get(c.id) ?? c.prices)?.eur == null);
  const names = [...new Set(missing.map((c) => c.name))];
  if (names.length) {
    const byName = new Map<string, DeckCard["prices"]>();
    for (const c of await resolveIdentifiers(names.map((name) => ({ name }))))
      byName.set(c.name.toLowerCase(), c.prices);
    for (const c of missing) {
      const ref = byName.get(c.name.toLowerCase());
      if (ref?.eur != null) out.set(c.id, { ...(out.get(c.id) ?? c.prices), eur: ref.eur });
    }
  }
  return out;
}

// --- Scheda Carte ---------------------------------------------------------------

type SortBy = "type" | "cmc" | "name";
const SORT_KEY = "pm.deckSort";

function CardsTab({ deck, onOpen }: { deck: SavedDeck; onOpen: (c: DeckCard) => void }) {
  const [searchOpen, setSearchOpen] = useState(deck.cards.length === 0);
  const [sort, setSortState] = useState<SortBy>(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      return s === "cmc" || s === "name" ? s : "type";
    } catch {
      return "type";
    }
  });
  const setSort = (s: SortBy) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* ignora */
    }
  };
  const collection = useCollection();
  const owned = useMemo(() => ownedByName(collection.entries), [collection.entries]);
  const need = useMemo(() => neededByName(deck), [deck]);

  return (
    <>
      <div className="deck-toolbar">
        <button
          type="button"
          className={`primary deck-search-btn${searchOpen ? " active" : ""}`}
          onClick={() => setSearchOpen((v) => !v)}
        >
          🔍 Aggiungi carta
        </button>
        <label className="deck-sort">
          <span className="muted small">Ordina</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
            <option value="type">per tipo</option>
            <option value="cmc">per costo</option>
            <option value="name">per nome</option>
          </select>
        </label>
      </div>
      {searchOpen && (
        <div className="panel" style={{ marginTop: 10 }}>
          <AddCardSearch deckId={deck.id} onClose={() => setSearchOpen(false)} />
        </div>
      )}

      {BOARDS.map((b) => (
        <BoardList
          key={b}
          deck={deck}
          board={b}
          sort={sort}
          owned={owned}
          need={need}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

/** Dove spostare con un tocco: dal main al side, dagli altri al main. */
const QUICK_MOVE: Record<Board, Board[]> = {
  main: ["side"],
  side: ["main"],
  maybe: ["main", "side"],
};

const TYPE_KEYS = [
  "creature",
  "planeswalker",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "battle",
  "land",
  "other",
] as const;

function groupCards(cards: DeckCard[], sort: SortBy): { title: string | null; cards: DeckCard[] }[] {
  const byName = (a: DeckCard, b: DeckCard) =>
    (a.printedName ?? a.name).localeCompare(b.printedName ?? b.name);
  if (sort === "name") return [{ title: null, cards: [...cards].sort(byName) }];
  const keyOf = (c: DeckCard) =>
    sort === "cmc"
      ? c.isLand
        ? "Terre"
        : `Costo ${c.cmc >= 7 ? "7+" : Math.floor(c.cmc)}`
      : typeLabel(TYPE_KEYS.find((t) => c.categories.includes(t)) ?? "other");
  const order =
    sort === "cmc"
      ? ["Costo 0", "Costo 1", "Costo 2", "Costo 3", "Costo 4", "Costo 5", "Costo 6", "Costo 7+", "Terre"]
      : TYPE_KEYS.map(typeLabel);
  const m = new Map<string, DeckCard[]>();
  for (const c of cards) {
    const k = keyOf(c);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return order
    .filter((k) => m.has(k))
    .map((k) => ({
      title: k,
      cards: m.get(k)!.sort((a, b) => a.cmc - b.cmc || byName(a, b)),
    }));
}

function BoardList({
  deck,
  board,
  sort,
  owned,
  need,
  onOpen,
}: {
  deck: SavedDeck;
  board: Board;
  sort: SortBy;
  owned: Map<string, number>;
  need: Map<string, number>;
  onOpen: (c: DeckCard) => void;
}) {
  const decks = useDecks();
  const cards = deck.cards.filter((c) => c.board === board);
  const count = cards.reduce((s, c) => s + c.qty, 0);
  const [open, setOpen] = useState(true);
  const groups = groupCards(cards, sort);
  const cover = deck.coverImageUrl;

  return (
    <section className={`deck-board deck-board--${board}`}>
      <button type="button" className="deck-board-head" onClick={() => setOpen((v) => !v)}>
        <span>{BOARD_TITLE[board]}</span>
        <span className="deck-board-count">{count}</span>
        <span className="deck-board-chev" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && cards.length === 0 && (
        <div className="muted small deck-board-empty">
          {board === "main"
            ? "Vuoto: tocca “Aggiungi carta”."
            : board === "side"
              ? "Vuoto. Usa “→ Side” su una carta del main per spostarla qui."
              : "Vuota. Metti qui le carte che stai valutando: non contano nel mazzo."}
        </div>
      )}
      {open &&
        groups.map((g) => (
          <div key={g.title ?? "all"} className="deck-group">
            {g.title && (
              <div className="deck-group-title">
                {g.title} <span className="muted">{g.cards.reduce((s, c) => s + c.qty, 0)}</span>
              </div>
            )}
            {g.cards.map((c) => {
              const art = c.artCropUrl ?? c.imageSmallUrl;
              const isCover = !!cover && [c.artCropUrl, c.imageUrl, c.imageSmallUrl].includes(cover);
              const eur = c.prices?.eur;
              return (
                <div className="dk-row" key={c.id}>
                  <button
                    type="button"
                    className="dk-art"
                    onClick={() => onOpen(c)}
                    aria-label={`Apri ${c.name}`}
                    style={art ? { backgroundImage: `url(${art})` } : undefined}
                  >
                    {eur != null && (
                      <span className="dk-price" title={c.qty > 1 ? `${c.qty} copie: ${formatMoney(eur * c.qty, "EUR")}` : undefined}>
                        {formatMoney(eur, "EUR")}
                      </span>
                    )}
                    {isCover && <span className="dk-cover">★</span>}
                  </button>
                  <button type="button" className="dk-main" onClick={() => onOpen(c)}>
                    <span className="dk-name">{c.printedName ?? c.name}</span>
                    <span className="dk-meta">
                      {c.manaCost ? <ManaCost cost={c.manaCost.split(" // ")[0]} size={15} /> : null}
                      {c.printedName && <span className="muted dk-en">{c.name}</span>}
                    </span>
                  </button>
                  <div className="dk-side">
                    <span className="dk-qty">
                      <button
                        type="button"
                        aria-label="Una copia in meno"
                        onClick={() => decks.setQty(deck.id, c.id, board, c.qty - 1)}
                      >
                        −
                      </button>
                      <span className="dk-n">{c.qty}</span>
                      <button
                        type="button"
                        aria-label="Una copia in più"
                        onClick={() => decks.setQty(deck.id, c.id, board, c.qty + 1)}
                      >
                        +
                      </button>
                    </span>
                    <span className="dk-tags">
                      {board !== "maybe" && (
                        <OwnBadge
                          card={c}
                          have={owned.get(c.name.toLowerCase()) ?? 0}
                          need={need.get(c.name.toLowerCase()) ?? 0}
                        />
                      )}
                      {QUICK_MOVE[board].map((to) => (
                        <button
                          key={to}
                          type="button"
                          className="dk-move"
                          title={`Sposta una copia in ${BOARD_TITLE[to]}`}
                          onClick={() => decks.moveCard(deck.id, c.id, board, to, 1)}
                        >
                          → {BOARD_LABEL[to]}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
}
