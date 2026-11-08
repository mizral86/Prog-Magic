// Wishlist: carte che vuoi procurarti, con il costo totale stimato.

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { CardInfo } from "./types";

export interface WishItem {
  id: string; // scryfallId o nome in minuscolo
  name: string;
  setCode?: string;
  collectorNumber?: string;
  imageSmallUrl?: string;
  imageUrl?: string;
  prices?: CardInfo["prices"];
  qty: number;
  addedAt: number;
}

/** Quello che serve per mettere una carta in wishlist. */
export type WishSource = Pick<
  CardInfo,
  "name" | "scryfallId" | "setCode" | "collectorNumber" | "imageSmallUrl" | "imageUrl" | "prices"
>;

const KEY = "pm.wishlist.v1";

function load(): Record<string, WishItem> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, WishItem>) : {};
  } catch {
    return {};
  }
}

interface WishCtx {
  items: WishItem[];
  has: (id: string) => boolean;
  add: (card: WishSource, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
}

const Ctx = createContext<WishCtx | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, WishItem>>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
      /* ignora */
    }
  }, [map]);

  const api = useMemo<WishCtx>(
    () => ({
      items: Object.values(map).sort((a, b) => b.addedAt - a.addedAt),
      has: (id) => !!map[id],
      add: (card, qty = 1) =>
        setMap((prev) => {
          const id = card.scryfallId ?? card.name.toLowerCase();
          const ex = prev[id];
          return {
            ...prev,
            [id]: ex
              ? { ...ex, qty: ex.qty + qty }
              : {
                  id,
                  name: card.name,
                  setCode: card.setCode,
                  collectorNumber: card.collectorNumber,
                  imageSmallUrl: card.imageSmallUrl,
                  imageUrl: card.imageUrl,
                  prices: card.prices,
                  qty,
                  addedAt: Date.now(),
                },
          };
        }),
      setQty: (id, qty) =>
        setMap((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          if (qty <= 0) delete next[id];
          else next[id] = { ...next[id], qty };
          return next;
        }),
      remove: (id) =>
        setMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
    }),
    [map],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWishlist deve essere usato dentro <WishlistProvider>");
  return ctx;
}

/** Costo stimato in EUR di una voce (prezzo normale, altrimenti foil o USD). */
export function wishUnit(w: WishItem): number {
  return w.prices?.eur ?? w.prices?.eurFoil ?? w.prices?.usd ?? 0;
}
