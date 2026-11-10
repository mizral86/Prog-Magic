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
import { PricePoint, recordPoint } from "./priceHistory";

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
  /** Storico prezzi EUR (un punto al giorno, poi uno al mese). */
  priceHistory?: PricePoint[];
  /** Prezzi al momento dell'inserimento in collezione. */
  addedPrices?: { eur?: number; eurFoil?: number };
  /**
   * true se la carta era già in collezione prima che l'app salvasse lo
   * storico: `addedPrices` è allora il primo prezzo noto, non quello esatto.
   */
  addedPriceApprox?: boolean;
  qty: number; // copie non-foil
  foilQty: number; // copie foil
  addedAt: number;
  /** Raccoglitore in cui si trova la stampa (assente = nessuno). */
  binder?: string;
}

/** Raccoglitore: un contenitore con nome per dividere la collezione. */
export interface Binder {
  id: string;
  name: string;
}

type EntryMap = Record<string, CollectionEntry>;

const KEY = "pm.collection.v1";
const BINDERS_KEY = "pm.binders.v1";

function loadBinders(): Binder[] {
  try {
    const raw = localStorage.getItem(BINDERS_KEY);
    return raw ? (JSON.parse(raw) as Binder[]) : [];
  } catch {
    return [];
  }
}

function load(): EntryMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return migrate(JSON.parse(raw) as EntryMap);
  } catch {
    return {};
  }
}

/**
 * Carte salvate prima dello storico prezzi: il prezzo che hanno in memoria
 * diventa il primo punto dello storico e il prezzo "di inserimento"
 * (segnato come approssimato).
 */
function migrate(map: EntryMap): EntryMap {
  for (const [id, e] of Object.entries(map)) {
    if (e.addedPrices || !e.prices) continue;
    map[id] = {
      ...e,
      addedPrices: { eur: e.prices.eur, eurFoil: e.prices.eurFoil },
      addedPriceApprox: true,
      priceHistory: e.priceHistory?.length ? e.priceHistory : recordPoint([], e.prices),
    };
  }
  return map;
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
  /** Aggiorna prezzi e immagini delle stampe già in collezione. */
  refreshCards: (cards: CardInfo[]) => void;
  binders: Binder[];
  createBinder: (name: string) => string;
  renameBinder: (id: string, name: string) => void;
  /** Elimina il raccoglitore: le carte restano in collezione, senza raccoglitore. */
  deleteBinder: (id: string) => void;
  setBinder: (entryId: string, binderId: string | undefined) => void;
}

const Ctx = createContext<CollectionCtx | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<EntryMap>(() => load());
  const [binders, setBinders] = useState<Binder[]>(() => loadBinders());

  useEffect(() => {
    save(map);
  }, [map]);
  useEffect(() => {
    try {
      localStorage.setItem(BINDERS_KEY, JSON.stringify(binders));
    } catch {
      /* ignora */
    }
  }, [binders]);

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
              prices: card.prices ?? existing.prices,
              priceHistory: recordPoint(existing.priceHistory, card.prices),
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
              priceHistory: recordPoint([], card.prices),
              addedPrices: card.prices
                ? { eur: card.prices.eur, eurFoil: card.prices.eurFoil }
                : undefined,
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
      binders,
      createBinder: (name) => {
        const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        setBinders((b) => [...b, { id, name: name.trim() || "Raccoglitore" }]);
        return id;
      },
      renameBinder: (id, name) =>
        setBinders((b) => b.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x))),
      deleteBinder: (id) => {
        setBinders((b) => b.filter((x) => x.id !== id));
        setMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k].binder === id) next[k] = { ...next[k], binder: undefined };
          }
          return next;
        });
      },
      setBinder: (entryId, binderId) =>
        setMap((prev) =>
          prev[entryId] ? { ...prev, [entryId]: { ...prev[entryId], binder: binderId } } : prev,
        ),
      refreshCards: (cards) =>
        setMap((prev) => {
          const next = { ...prev };
          for (const c of cards) {
            const id = c.scryfallId;
            if (!id || !next[id]) continue;
            next[id] = {
              ...next[id],
              prices: c.prices,
              priceHistory: recordPoint(next[id].priceHistory, c.prices),
              // Carta aggiunta senza prezzo: il primo prezzo letto fa da riferimento.
              ...(next[id].addedPrices || !c.prices
                ? {}
                : {
                    addedPrices: { eur: c.prices.eur, eurFoil: c.prices.eurFoil },
                    addedPriceApprox: true,
                  }),
              imageUrl: c.imageUrl ?? next[id].imageUrl,
              imageSmallUrl: c.imageSmallUrl ?? next[id].imageSmallUrl,
            };
          }
          return next;
        }),
    };
  }, [map, binders]);

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

/** Copie possedute per nome carta (tutte le stampe, normali + foil). */
export function ownedByName(entries: CollectionEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = e.name.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + e.qty + e.foilQty);
  }
  return m;
}
