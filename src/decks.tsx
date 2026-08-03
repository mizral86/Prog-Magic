// Mazzi salvati dall'utente: stato condiviso + persistenza locale.

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CardCategory, CardInfo, Color } from "./types";

export type Board = "main" | "side";

export const FORMATS = [
  "standard",
  "pioneer",
  "modern",
  "pauper",
  "legacy",
  "vintage",
  "commander",
] as const;
export type Format = (typeof FORMATS)[number];

export interface DeckCard {
  id: string; // scryfallId o fallback sul nome
  name: string;
  cmc: number;
  colors: Color[];
  colorIdentity: Color[];
  typeLine: string;
  isLand: boolean;
  categories: CardCategory[];
  imageSmallUrl?: string;
  imageUrl?: string;
  prices?: CardInfo["prices"];
  legalities?: Record<string, string>;
  qty: number;
  board: Board;
}

export interface SavedDeck {
  id: string;
  name: string;
  format: Format;
  cards: DeckCard[];
  createdAt: number;
  updatedAt: number;
  /** URL immagine di copertina (art di una carta scelta dall'utente). */
  coverImageUrl?: string;
}

const KEY = "pm.decks.v1";

function load(): Record<string, SavedDeck> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedDeck>) : {};
  } catch {
    return {};
  }
}
function save(m: Record<string, SavedDeck>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignora */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function cardKey(card: CardInfo): string {
  return card.scryfallId ?? card.name.toLowerCase();
}

function toDeckCard(card: CardInfo, board: Board, qty: number): DeckCard {
  return {
    id: cardKey(card),
    name: card.name,
    cmc: card.cmc,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    typeLine: card.typeLine,
    isLand: card.isLand,
    categories: card.categories,
    imageSmallUrl: card.imageSmallUrl,
    imageUrl: card.imageUrl,
    prices: card.prices,
    legalities: card.legalities,
    qty,
    board,
  };
}

interface DecksCtx {
  decks: SavedDeck[];
  get: (id: string) => SavedDeck | undefined;
  create: (name: string, format: Format) => string;
  rename: (id: string, name: string) => void;
  setFormat: (id: string, format: Format) => void;
  remove: (id: string) => void;
  addCard: (deckId: string, card: CardInfo, board: Board, qty?: number) => void;
  setQty: (deckId: string, cardId: string, board: Board, qty: number) => void;
  removeCard: (deckId: string, cardId: string, board: Board) => void;
  replaceCards: (deckId: string, cards: DeckCard[]) => void;
  setCover: (deckId: string, url: string | undefined) => void;
}

const Ctx = createContext<DecksCtx | null>(null);

export function DecksProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, SavedDeck>>(() => load());
  useEffect(() => save(map), [map]);

  const api = useMemo<DecksCtx>(() => {
    const mutate = (deckId: string, fn: (d: SavedDeck) => SavedDeck) =>
      setMap((prev) => {
        const d = prev[deckId];
        if (!d) return prev;
        return { ...prev, [deckId]: { ...fn(d), updatedAt: Date.now() } };
      });

    return {
      decks: Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt),
      get: (id) => map[id],
      create: (name, format) => {
        const id = uid();
        setMap((prev) => ({
          ...prev,
          [id]: {
            id,
            name: name || "Nuovo mazzo",
            format,
            cards: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }));
        return id;
      },
      rename: (id, name) => mutate(id, (d) => ({ ...d, name })),
      setFormat: (id, format) => mutate(id, (d) => ({ ...d, format })),
      remove: (id) =>
        setMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      addCard: (deckId, card, board, qty = 1) =>
        mutate(deckId, (d) => {
          const id = cardKey(card);
          const idx = d.cards.findIndex((c) => c.id === id && c.board === board);
          const cards = d.cards.slice();
          if (idx >= 0) cards[idx] = { ...cards[idx], qty: cards[idx].qty + qty };
          else cards.push(toDeckCard(card, board, qty));
          return { ...d, cards };
        }),
      setQty: (deckId, cardId, board, qty) =>
        mutate(deckId, (d) => ({
          ...d,
          cards: d.cards
            .map((c) =>
              c.id === cardId && c.board === board
                ? { ...c, qty: Math.max(0, qty) }
                : c,
            )
            .filter((c) => c.qty > 0),
        })),
      removeCard: (deckId, cardId, board) =>
        mutate(deckId, (d) => ({
          ...d,
          cards: d.cards.filter((c) => !(c.id === cardId && c.board === board)),
        })),
      replaceCards: (deckId, cards) => mutate(deckId, (d) => ({ ...d, cards })),
      setCover: (deckId, url) => mutate(deckId, (d) => ({ ...d, coverImageUrl: url })),
    };
  }, [map]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDecks(): DecksCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDecks deve stare dentro <DecksProvider>");
  return ctx;
}

// Helper per costruire DeckCard da CardInfo (usato dall'import).
export function makeDeckCard(card: CardInfo, board: Board, qty: number): DeckCard {
  return toDeckCard(card, board, qty);
}

// URL della copertina: quella scelta dall'utente, oppure — in mancanza —
// l'art della carta non-terra più costosa del main (la "bomba" del mazzo).
export function deckCoverUrl(deck: SavedDeck): string | undefined {
  if (deck.coverImageUrl) return deck.coverImageUrl;
  const main = deck.cards.filter((c) => c.board === "main");
  const pool = main.filter((c) => !c.isLand);
  const pick = (pool.length ? pool : main).reduce<DeckCard | undefined>(
    (best, c) => (!best || c.cmc > best.cmc ? c : best),
    undefined,
  );
  return pick?.imageUrl ?? pick?.imageSmallUrl;
}
