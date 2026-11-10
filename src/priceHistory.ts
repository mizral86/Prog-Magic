// Storico prezzi della collezione e rilevamento di spike/cali.
//
// Scryfall dà solo il prezzo di oggi: lo storico lo costruiamo noi salvando
// un "punto" (data + prezzi EUR) ogni volta che i prezzi vengono letti
// (aggiunta della carta, "Aggiorna prezzi", aggiornamento automatico
// giornaliero). Al massimo un punto al giorno: l'ultimo letto vince.

import { CardInfo } from "./types";

export interface PricePoint {
  /** Giorno locale, formato YYYY-MM-DD. */
  d: string;
  eur?: number;
  eurFoil?: number;
}

export type Finish = "nonfoil" | "foil";
export type Period = "month" | "year" | "added";

/** Data locale di oggi (o di `t`) come YYYY-MM-DD. */
export function dayKey(t: number | Date = Date.now()): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${g}`;
}

/** Aggiunge (o sostituisce, se già presente oggi) il punto del giorno. */
export function recordPoint(
  history: PricePoint[] | undefined,
  prices: CardInfo["prices"] | undefined,
  now: number = Date.now(),
): PricePoint[] {
  const list = history ? [...history] : [];
  if (!prices || (prices.eur == null && prices.eurFoil == null)) return list;
  const d = dayKey(now);
  const point: PricePoint = { d };
  if (prices.eur != null) point.eur = prices.eur;
  if (prices.eurFoil != null) point.eurFoil = prices.eurFoil;
  if (list.length > 0 && list[list.length - 1].d === d) list[list.length - 1] = point;
  else list.push(point);
  return trimHistory(list, now);
}

/**
 * Tiene lo storico piccolo (va anche nella sincronizzazione del profilo):
 * tutti i punti degli ultimi 60 giorni, prima solo l'ultimo punto di ogni
 * mese, per al massimo 30 mesi.
 */
export function trimHistory(list: PricePoint[], now: number = Date.now()): PricePoint[] {
  const recentFrom = dayKey(now - 60 * DAY);
  const recent = list.filter((p) => p.d >= recentFrom);
  const lastOfMonth = new Map<string, PricePoint>();
  for (const p of list) if (p.d < recentFrom) lastOfMonth.set(p.d.slice(0, 7), p);
  const old = [...lastOfMonth.values()].slice(-30);
  return [...old, ...recent];
}

const DAY = 24 * 60 * 60 * 1000;

/** Prezzo EUR di una copia nella finitura indicata (foil → fallback al normale). */
export function unitPrice(
  p: { eur?: number; eurFoil?: number } | undefined,
  finish: Finish,
): number | undefined {
  if (!p) return undefined;
  return finish === "foil" ? p.eurFoil ?? p.eur : p.eur;
}

export interface Reference {
  price: number;
  /** Giorno del prezzo di riferimento (YYYY-MM-DD). */
  date?: string;
  /**
   * true quando non c'è un prezzo abbastanza vecchio per il periodo e si usa
   * il primo prezzo registrato (o, per l'inserimento, il primo prezzo noto
   * per una carta aggiunta prima che l'app salvasse lo storico).
   */
  partial: boolean;
}

/** Prezzo di riferimento per il periodo scelto. */
export function referencePrice(
  entry: {
    priceHistory?: PricePoint[];
    addedPrices?: { eur?: number; eurFoil?: number };
    addedPriceApprox?: boolean;
    addedAt: number;
  },
  finish: Finish,
  period: Period,
  now: number = Date.now(),
): Reference | null {
  if (period === "added") {
    const price = unitPrice(entry.addedPrices, finish);
    if (price == null || price <= 0) return null;
    return { price, date: dayKey(entry.addedAt), partial: !!entry.addedPriceApprox };
  }
  const today = dayKey(now);
  const points = (entry.priceHistory ?? []).filter((p) => {
    const v = unitPrice(p, finish);
    return v != null && v > 0 && p.d < today;
  });
  if (points.length === 0) return null;
  const target =
    period === "month" ? dayKey(now - 30 * DAY) : `${new Date(now).getFullYear()}-01-01`;
  // Ultimo punto alla data obiettivo o prima.
  let best: PricePoint | undefined;
  for (const p of points) if (p.d <= target) best = p;
  if (best) return { price: unitPrice(best, finish)!, date: best.d, partial: false };
  // Nessun punto così vecchio: si usa il primo registrato (dentro il periodo).
  const first = points[0];
  return { price: unitPrice(first, finish)!, date: first.d, partial: true };
}

export interface PriceMove<E> {
  entry: E;
  finish: Finish;
  copies: number;
  current: number;
  ref: Reference;
  /** Variazione relativa, es. 0.25 = +25%. */
  pct: number;
  /** Differenza per copia in EUR. */
  diff: number;
}

/** Differenza minima per copia perché una variazione conti (evita il rumore sui centesimi). */
export const MIN_DIFF_EUR = 0.25;

/**
 * Calcola le variazioni per ogni finitura posseduta. `moves` contiene tutte
 * quelle con un riferimento; `noRef` conta le stampe senza storico utile.
 */
export function computeMoves<
  E extends {
    qty: number;
    foilQty: number;
    prices?: CardInfo["prices"];
    priceHistory?: PricePoint[];
    addedPrices?: { eur?: number; eurFoil?: number };
    addedPriceApprox?: boolean;
    addedAt: number;
  },
>(entries: E[], period: Period, now: number = Date.now()) {
  const moves: PriceMove<E>[] = [];
  let noRef = 0;
  for (const entry of entries) {
    const finishes: [Finish, number][] = [];
    if (entry.qty > 0) finishes.push(["nonfoil", entry.qty]);
    if (entry.foilQty > 0) finishes.push(["foil", entry.foilQty]);
    for (const [finish, copies] of finishes) {
      const current = unitPrice(entry.prices, finish);
      if (current == null) continue;
      const ref = referencePrice(entry, finish, period, now);
      if (!ref) {
        noRef++;
        continue;
      }
      const diff = current - ref.price;
      moves.push({ entry, finish, copies, current, ref, pct: diff / ref.price, diff });
    }
  }
  return { moves, noRef };
}

export function isSignificant(m: { pct: number; diff: number }, threshold: number): boolean {
  return Math.abs(m.pct) >= threshold && Math.abs(m.diff) >= MIN_DIFF_EUR;
}
