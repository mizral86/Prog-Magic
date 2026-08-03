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

// --- Analisi single-deck (linee guida euristiche, non regole assolute) -------

export type Verdict = "good" | "warn" | "info";

export interface AnalysisItem {
  label: string;
  value: string;
  verdict: Verdict;
  note?: string;
}

export interface DeckAnalysis {
  items: AnalysisItem[];
  /** Vuoto se il main è troppo piccolo per una stima sensata. */
  empty: boolean;
}

// Coefficiente binomiale in virgola mobile (n,k piccoli: mazzi ≤ ~250 carte).
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

// Ipergeometrica: P(k successi) pescando `draw` da N con L successi totali.
function hyp(N: number, L: number, draw: number, k: number): number {
  if (draw > N) return k === L ? 1 : 0;
  return (comb(L, k) * comb(N - L, draw - k)) / comb(N, draw);
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

export function deckAnalysis(deck: SavedDeck): DeckAnalysis {
  const main = deck.cards.filter((c) => c.board === "main");
  const mainCount = main.reduce((s, c) => s + c.qty, 0);
  const lands = main.filter((c) => c.isLand);
  const spells = main.filter((c) => !c.isLand);
  const landCount = lands.reduce((s, c) => s + c.qty, 0);
  const spellCount = spells.reduce((s, c) => s + c.qty, 0);
  const commander = deck.format === "commander";

  if (mainCount < 7) return { items: [], empty: true };

  const items: AnalysisItem[] = [];

  // 1) CMC medio delle magie.
  const avgCmc = spellCount
    ? spells.reduce((s, c) => s + c.cmc * c.qty, 0) / spellCount
    : 0;
  items.push({
    label: "CMC medio (magie)",
    value: avgCmc.toFixed(2),
    verdict: "info",
    note:
      avgCmc >= 3.5
        ? "curva alta: valuta più terre/ramp"
        : avgCmc <= 2
          ? "curva bassa e aggressiva"
          : "curva equilibrata",
  });

  // 2) Terre vs linea guida (scala con la dimensione del main).
  const target = commander
    ? Math.round((mainCount / 100) * 37)
    : clamp(Math.round((mainCount / 60) * (16 + (avgCmc - 2) * 3)), 16, 26);
  const pct = mainCount ? Math.round((landCount / mainCount) * 100) : 0;
  const diff = landCount - target;
  const landVerdict: Verdict = Math.abs(diff) <= 2 ? "good" : "warn";
  items.push({
    label: "Terre",
    value: `${landCount} (${pct}%)`,
    verdict: landVerdict,
    note:
      landVerdict === "good"
        ? `in linea (~${target} consigliate)`
        : diff < 0
          ? `poche: ~${target} consigliate per questa curva`
          : `molte: ~${target} basterebbero`,
  });

  // 3) Consistenza mano iniziale (7 carte): probabilità di tenerla (2-5 terre).
  const keep = [2, 3, 4, 5].reduce(
    (s, k) => s + hyp(mainCount, landCount, 7, k),
    0,
  );
  const screw = [0, 1].reduce((s, k) => s + hyp(mainCount, landCount, 7, k), 0);
  const flood = keep + screw < 1 ? 1 - keep - screw : 0;
  items.push({
    label: "Mano tenibile (2-5 terre su 7)",
    value: `${Math.round(keep * 100)}%`,
    verdict: keep >= 0.65 ? "good" : "warn",
    note: `mana screw ${Math.round(screw * 100)}% · flood ${Math.round(
      flood * 100,
    )}%`,
  });

  // 4) Bilancio fonti/richieste per colore.
  // Fonte = terra la cui identità colore include quel colore (proxy: le terre
  // non hanno `colors`, ma l'identità riflette bene ciò che producono).
  for (const col of ["W", "U", "B", "R", "G"] as Color[]) {
    const demand = spells
      .filter((c) => (c.colors ?? []).includes(col))
      .reduce((s, c) => s + c.qty, 0);
    if (demand === 0) continue;
    const sources = lands
      .filter((c) => (c.colorIdentity ?? []).includes(col))
      .reduce((s, c) => s + c.qty, 0);
    // Regola pratica: servono ~ demand/2 fonti (min 8-10 su 60 per un colore
    // molto richiesto). Segnaliamo se le fonti sono chiaramente sotto.
    const wantSources = clamp(Math.round(demand * 0.6) + 5, 6, landCount || 6);
    const ok = sources >= Math.min(wantSources, Math.round(landCount * 0.45));
    items.push({
      label: `Fonti ${COLOR_NAME[col]}`,
      value: `${sources} per ${demand} magie`,
      verdict: ok ? "good" : "warn",
      note: ok ? "sufficienti" : "poche fonti per la domanda",
    });
  }

  return { items, empty: false };
}

const COLOR_NAME: Record<Color, string> = {
  W: "bianche",
  U: "blu",
  B: "nere",
  R: "rosse",
  G: "verdi",
};

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
