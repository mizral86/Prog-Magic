// Mazzi salvati dall'utente: stato condiviso + persistenza locale.

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CardCategory, CardInfo, Color, TokenRef } from "./types";

export type Board = "main" | "side" | "maybe";
export const BOARDS: Board[] = ["main", "side", "maybe"];
export const BOARD_LABEL: Record<Board, string> = {
  main: "Main",
  side: "Side",
  maybe: "Maybe",
};

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
  /** Solo illustrazione, per la copertina del mazzo. */
  artCropUrl?: string;
  manaCost?: string;
  /** Nome stampato (es. italiano) se diverso da quello inglese. */
  printedName?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  /** Magia economica (costo ≤ 2) che pesca carte o dà mana (per le terre consigliate). */
  drawRamp?: boolean;
  /** Pedine create dalla carta; undefined = dati non ancora scaricati. */
  tokens?: TokenRef[];
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

export function isScryfallId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

/** Pesca o mana a basso costo (Opt, Llanowar Elves, Ponder…): conta come "mezza terra". */
function isDrawRamp(card: CardInfo): boolean {
  if (card.isLand || card.cmc > 2) return false;
  if (card.manaAbility) return true;
  const t = (card.oracleText ?? "").toLowerCase();
  return /draw (a|two|three) cards?|look at the top \w+ cards|\bsurveil \d|search your library for (a|up to \w+) basic land|\{t\}: add \{/.test(t);
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
    artCropUrl: card.artCropUrl,
    manaCost: card.manaCost,
    printedName: card.printedName,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    tokens: card.tokens ?? [],
    drawRamp: isDrawRamp(card),
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
  /** Sposta `qty` copie (tutte se omesso) da una sezione all'altra. */
  moveCard: (deckId: string, cardId: string, from: Board, to: Board, qty?: number) => void;
  /** Sostituisce la stampa (edizione) di una carta, tenendo quantità e sezione. */
  changePrinting: (deckId: string, cardId: string, board: Board, card: CardInfo) => void;
  /** Aggiorna i dati (pedine, immagini, prezzi) delle carte già nel mazzo. */
  refreshCards: (deckId: string, cards: CardInfo[]) => void;
}

/** Unisce le voci con stesso id e sezione (dopo spostamenti o cambi di stampa). */
function mergeSame(cards: DeckCard[]): DeckCard[] {
  const out: DeckCard[] = [];
  for (const c of cards) {
    if (c.qty <= 0) continue;
    const same = out.find((o) => o.id === c.id && o.board === c.board);
    if (same) same.qty += c.qty;
    else out.push({ ...c });
  }
  return out;
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
      moveCard: (deckId, cardId, from, to, qty) =>
        mutate(deckId, (d) => {
          if (from === to) return d;
          const src = d.cards.find((c) => c.id === cardId && c.board === from);
          if (!src) return d;
          const n = Math.min(src.qty, qty ?? src.qty);
          const cards = d.cards.map((c) => (c === src ? { ...c, qty: c.qty - n } : c));
          cards.push({ ...src, board: to, qty: n });
          return { ...d, cards: mergeSame(cards) };
        }),
      changePrinting: (deckId, cardId, board, card) =>
        mutate(deckId, (d) => {
          const old = d.cards.find((c) => c.id === cardId && c.board === board);
          if (!old) return d;
          const fresh = toDeckCard(card, board, old.qty);
          // La copertina segue la carta se era la sua illustrazione.
          const wasCover =
            !!d.coverImageUrl &&
            [old.artCropUrl, old.imageUrl, old.imageSmallUrl].includes(d.coverImageUrl);
          const cards = d.cards.map((c) => (c === old ? fresh : c));
          return {
            ...d,
            cards: mergeSame(cards),
            coverImageUrl: wasCover
              ? fresh.artCropUrl ?? fresh.imageUrl
              : d.coverImageUrl,
          };
        }),
      refreshCards: (deckId, fresh) =>
        mutate(deckId, (d) => {
          const byId = new Map<string, CardInfo>();
          const byName = new Map<string, CardInfo>();
          for (const c of fresh) {
            if (c.scryfallId) byId.set(c.scryfallId, c);
            byName.set(c.name.toLowerCase(), c);
          }
          const cards = d.cards.map((c) => {
            const f = isScryfallId(c.id)
              ? byId.get(c.id)
              : byName.get(c.name.toLowerCase());
            if (!f) return c.tokens ? c : { ...c, tokens: [] };
            return {
              ...toDeckCard(f, c.board, c.qty),
              printedName: c.printedName ?? f.printedName,
            };
          });
          return { ...d, cards: mergeSame(cards) };
        }),
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
  return autoCover(deck);
}

/** Copertina automatica: illustrazione della carta non-terra più cara di mana. */
export function autoCover(deck: SavedDeck): string | undefined {
  const main = deck.cards.filter((c) => c.board === "main");
  const pool = main.filter((c) => !c.isLand);
  const pick = (pool.length ? pool : main).reduce<DeckCard | undefined>(
    (best, c) => (!best || c.cmc > best.cmc ? c : best),
    undefined,
  );
  return pick?.artCropUrl ?? pick?.imageUrl ?? pick?.imageSmallUrl;
}

/** Dati minimi di una carta del mazzo per metterla in collezione (serve l'ID Scryfall). */
export function deckCardToInfo(c: DeckCard): CardInfo | null {
  if (!isScryfallId(c.id)) return null;
  return {
    name: c.name,
    printedName: c.printedName,
    cmc: c.cmc,
    typeLine: c.typeLine,
    categories: c.categories,
    colors: c.colors,
    colorIdentity: c.colorIdentity,
    isLand: c.isLand,
    producedMana: [],
    entersTapped: false,
    manaCost: c.manaCost ?? "",
    pips: {},
    generic: 0,
    oracleText: "",
    imageUrl: c.imageUrl,
    imageSmallUrl: c.imageSmallUrl,
    artCropUrl: c.artCropUrl,
    scryfallId: c.id,
    setCode: c.setCode,
    setName: c.setName,
    collectorNumber: c.collectorNumber,
    legalities: c.legalities,
    prices: c.prices,
  };
}
