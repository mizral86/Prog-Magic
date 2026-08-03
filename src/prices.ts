// Utility per i prezzi delle carte (preferenza EUR, fallback USD).

import { CardInfo } from "./types";

export interface PriceInfo {
  value: number;
  currency: "EUR" | "USD";
  foil: boolean;
}

/** Miglior prezzo disponibile: EUR non-foil > EUR foil > USD non-foil > USD foil. */
export function bestPrice(card: CardInfo | undefined): PriceInfo | null {
  const p = card?.prices;
  if (!p) return null;
  if (p.eur != null) return { value: p.eur, currency: "EUR", foil: false };
  if (p.eurFoil != null) return { value: p.eurFoil, currency: "EUR", foil: true };
  if (p.usd != null) return { value: p.usd, currency: "USD", foil: false };
  if (p.usdFoil != null) return { value: p.usdFoil, currency: "USD", foil: true };
  return null;
}

export function formatMoney(value: number, currency: "EUR" | "USD"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Prezzo formattato pronto da mostrare, es. "1,25 €" o "0,50 € (foil)". */
export function formatPrice(card: CardInfo | undefined): string {
  const p = bestPrice(card);
  if (!p) return "—";
  return formatMoney(p.value, p.currency) + (p.foil ? " (foil)" : "");
}
