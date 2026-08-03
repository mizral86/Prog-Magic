// Collezione dell'utente: stato condiviso + persistenza locale (localStorage).
// Ogni voce è una specifica stampa (scryfallId), con copie normali e foil.

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CardInfo, Color } from "./types";

export interface CollectionEntry {
  id: string; // scryfallId (stampa specifica)
  name: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  imageSmallUrl?: string;
  imageUrl?: string;
  colors: Color[];
  colorIdentity: Color[];
  rarity?: string;
  cmc: number;
  typeLine: string;
  isLand: boolean;
  prices?: CardInfo["prices"];
  qty: number; // copie non-foil
  foilQty: number; // copie foil
  addedAt: number;
}

type EntryMap = Record<string, CollectionEntry>;

const KEY = "pm.collection.v1";

function load(): EntryMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EntryMap;
  } catch {
    return {};
  }
}

function save(map: EntryMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // quota superata o storage non disponibile: ignoriamo silenziosamente
  }
}

interface CollectionCtx {
  entries: CollectionEntry[];
  get: (id: string) => CollectionEntry | undefined;
  add: (card: CardInfo, opts?: { foil?: boolean; qty?: number }) => void;
  setQty: (id: string, qty: number) => void;
  setFoilQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const Ctx = createContext<CollectionCtx | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<EntryMap>(() => load());

  useEffect(() => {
    save(map);
  }, [map]);

  const api = useMemo<CollectionCtx>(() => {
    const cleanup = (m: EntryMap, id: string) => {
      const e = m[id];
      if (e && e.qty <= 0 && e.foilQty <= 0) delete m[id];
    };

    return {
      entries: Object.values(map).sort((a, b) => b.addedAt - a.addedAt),
      get: (id) => map[id],
      add: (card, opts) => {
        if (!card.scryfallId) return;
        const foil = opts?.foil ?? false;
        const n = opts?.qty ?? 1;
        setMap((prev) => {
          const next = { ...prev };
          const id = card.scryfallId!;
          const existing = next[id];
          if (existing) {
            next[id] = {
              ...existing,
              qty: existing.qty + (foil ? 0 : n),
              foilQty: existing.foilQty + (foil ? n : 0),
            };
          } else {
            next[id] = {
              id,
              name: card.name,
              setCode: card.setCode,
              setName: card.setName,
              collectorNumber: card.collectorNumber,
              imageSmallUrl: card.imageSmallUrl,
              imageUrl: card.imageUrl,
              colors: card.colors,
              colorIdentity: card.colorIdentity,
              rarity: card.rarity,
              cmc: card.cmc,
              typeLine: card.typeLine,
              isLand: card.isLand,
              prices: card.prices,
              qty: foil ? 0 : n,
              foilQty: foil ? n : 0,
              addedAt: Date.now(),
            };
          }
          return next;
        });
      },
      setQty: (id, qty) =>
        setMap((prev) => {
          const next = { ...prev };
          if (next[id]) {
            next[id] = { ...next[id], qty: Math.max(0, qty) };
            cleanup(next, id);
          }
          return next;
        }),
      setFoilQty: (id, qty) =>
        setMap((prev) => {
          const next = { ...prev };
          if (next[id]) {
            next[id] = { ...next[id], foilQty: Math.max(0, qty) };
            cleanup(next, id);
          }
          return next;
        }),
      remove: (id) =>
        setMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      clear: () => setMap({}),
    };
  }, [map]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCollection(): CollectionCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useCollection deve essere usato dentro <CollectionProvider>");
  return ctx;
}

// --- Aiutanti per valore e statistiche (calcolati dalla pagina) ---

/** Prezzo EUR di una copia non-foil (0 se sconosciuto). */
export function eurUnit(e: CollectionEntry): number {
  return e.prices?.eur ?? 0;
}
/** Prezzo EUR di una copia foil (fallback al non-foil). */
export function eurFoilUnit(e: CollectionEntry): number {
  return e.prices?.eurFoil ?? e.prices?.eur ?? 0;
}

export interface CollectionTotals {
  cards: number; // copie totali
  unique: number; // stampe uniche
  valueEur: number; // valore stimato in EUR
  missingPrice: number; // copie senza prezzo EUR
}

export function computeTotals(entries: CollectionEntry[]): CollectionTotals {
  let cards = 0;
  let valueEur = 0;
  let missingPrice = 0;
  for (const e of entries) {
    const copies = e.qty + e.foilQty;
    cards += copies;
    const nf = eurUnit(e);
    const f = eurFoilUnit(e);
    valueEur += e.qty * nf + e.foilQty * f;
    if (nf === 0) missingPrice += e.qty;
    if (f === 0) missingPrice += e.foilQty;
  }
  return { cards, unique: entries.length, valueEur, missingPrice };
}
