// Statistiche e controlli di legalità di un mazzo.

import { DeckCard, Format, SavedDeck } from "./decks";
import { bestPrice } from "./prices";
import { CardCategory, Color } from "./types";

export interface Bucket {
  label: string;
  count: number;
}

export interface DeckStats {
  mainCount: number;
  sideCount: number;
  landCount: number;
  curve: Bucket[]; // magie (non terre) del main per CMC
  colors: Record<Color, number>; // copie main che includono quel colore
  colorless: number;
  types: Bucket[];
  totalPriceEur: number;
  missingPrice: number;
}

const TYPE_ORDER: CardCategory[] = [
  "creature",
  "planeswalker",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "battle",
  "land",
  "other",
];
const TYPE_LABEL: Record<CardCategory, string> = {
  creature: "Creature",
  planeswalker: "Planeswalker",
  instant: "Istantanei",
  sorcery: "Stregonerie",
  artifact: "Artefatti",
  enchantment: "Incantesimi",
  battle: "Battaglie",
  land: "Terre",
  other: "Altro",
};

function primaryType(c: DeckCard): CardCategory {
  for (const t of TYPE_ORDER) if (c.categories.includes(t)) return t;
  return "other";
}

export function deckStats(deck: SavedDeck): DeckStats {
  const main = deck.cards.filter((c) => c.board === "main");
  const side = deck.cards.filter((c) => c.board === "side");

  const curveMap = new Map<string, number>(
    ["0", "1", "2", "3", "4", "5", "6", "7+"].map((k) => [k, 0]),
  );
  const colors: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let colorless = 0;
  const typeMap = new Map<CardCategory, number>();
  let landCount = 0;

  for (const c of main) {
    if (c.isLand) landCount += c.qty;
    else {
      const key = c.cmc >= 7 ? "7+" : String(Math.floor(c.cmc));
      curveMap.set(key, (curveMap.get(key) ?? 0) + c.qty);
    }
    if ((c.colors?.length ?? 0) === 0 && !c.isLand) colorless += c.qty;
    for (const col of c.colors ?? []) colors[col] += c.qty;
    const t = primaryType(c);
    typeMap.set(t, (typeMap.get(t) ?? 0) + c.qty);
  }

  let totalPriceEur = 0;
  let missingPrice = 0;
  for (const c of deck.cards) {
    const p = bestPrice({ prices: c.prices } as any);
    if (p && p.currency === "EUR") totalPriceEur += p.value * c.qty;
    else if (c.prices?.eur != null) totalPriceEur += c.prices.eur * c.qty;
    else missingPrice += c.qty;
  }

  return {
    mainCount: main.reduce((s, c) => s + c.qty, 0),
    sideCount: side.reduce((s, c) => s + c.qty, 0),
    landCount,
    curve: [...curveMap].map(([label, count]) => ({ label, count })),
    colors,
    colorless,
    types: TYPE_ORDER.filter((t) => (typeMap.get(t) ?? 0) > 0).map((t) => ({
      label: TYPE_LABEL[t],
      count: typeMap.get(t) ?? 0,
    })),
    totalPriceEur,
    missingPrice,
  };
}

export interface LegalityIssue {
  level: "error" | "warn";
  text: string;
}

function isBasicLand(c: DeckCard): boolean {
  return c.typeLine.toLowerCase().includes("basic");
}

export function legalityIssues(deck: SavedDeck): LegalityIssue[] {
  const issues: LegalityIssue[] = [];
  const f: Format = deck.format;
  const main = deck.cards.filter((c) => c.board === "main");
  const side = deck.cards.filter((c) => c.board === "side");
  const mainCount = main.reduce((s, c) => s + c.qty, 0);
  const sideCount = side.reduce((s, c) => s + c.qty, 0);

  // Legalità delle singole carte nel formato.
  for (const c of deck.cards) {
    const status = c.legalities?.[f];
    if (status === "banned")
      issues.push({ level: "error", text: `${c.name}: bandita in ${f}.` });
    else if (status === "not_legal")
      issues.push({ level: "error", text: `${c.name}: non legale in ${f}.` });
    else if (status === "restricted")
      issues.push({ level: "warn", text: `${c.name}: ristretta (max 1) in ${f}.` });
  }

  // Limiti di copie.
  const singleton = f === "commander";
  const maxCopies = singleton ? 1 : 4;
  const totals = new Map<string, number>();
  for (const c of deck.cards) {
    if (isBasicLand(c)) continue;
    totals.set(c.name, (totals.get(c.name) ?? 0) + c.qty);
  }
  for (const [name, n] of totals) {
    if (n > maxCopies)
      issues.push({
        level: "error",
        text: `${name}: ${n} copie (max ${maxCopies} in ${f}).`,
      });
  }

  // Dimensioni del mazzo.
  if (f === "commander") {
    if (mainCount !== 100)
      issues.push({
        level: mainCount === 0 ? "warn" : "error",
        text: `Commander richiede 100 carte nel main (ora ${mainCount}).`,
      });
  } else {
    if (mainCount < 60)
      issues.push({
        level: mainCount === 0 ? "warn" : "error",
        text: `Il main deve avere almeno 60 carte (ora ${mainCount}).`,
      });
    if (sideCount > 15)
      issues.push({
        level: "error",
        text: `Il sideboard può avere al massimo 15 carte (ora ${sideCount}).`,
      });
  }

  return issues;
}
