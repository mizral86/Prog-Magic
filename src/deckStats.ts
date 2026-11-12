// Statistiche e controlli di legalità di un mazzo.

import { DeckCard, Format, SavedDeck } from "./decks";
import { bestPrice } from "./prices";
import { CardCategory, Color, TokenRef } from "./types";

export interface Bucket {
  label: string;
  count: number;
}

export interface CurveBucket extends Bucket {
  /** Di cui creature. */
  creatures: number;
}

export interface DeckStats {
  mainCount: number;
  sideCount: number;
  maybeCount: number;
  landCount: number;
  curve: CurveBucket[]; // magie (non terre) del main per CMC
  /** CMC medio delle magie del main. */
  avgCmc: number;
  /** Tipi di creatura del main (Elfo, Goblin…), dal più frequente. */
  creatureTypes: Bucket[];
  /** Valore della maybeboard (non conta nel prezzo del mazzo). */
  maybePriceEur: number;
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
  const maybe = deck.cards.filter((c) => c.board === "maybe");

  const curveMap = new Map<string, number>(
    ["0", "1", "2", "3", "4", "5", "6", "7+"].map((k) => [k, 0]),
  );
  const curveCre = new Map<string, number>();
  const ctypes = new Map<string, number>();
  let cmcSum = 0;
  let spellN = 0;
  const colors: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let colorless = 0;
  const typeMap = new Map<CardCategory, number>();
  let landCount = 0;

  for (const c of main) {
    if (c.isLand) landCount += c.qty;
    else {
      const key = c.cmc >= 7 ? "7+" : String(Math.floor(c.cmc));
      curveMap.set(key, (curveMap.get(key) ?? 0) + c.qty);
      if (c.categories.includes("creature"))
        curveCre.set(key, (curveCre.get(key) ?? 0) + c.qty);
      cmcSum += c.cmc * c.qty;
      spellN += c.qty;
    }
    for (const t of creatureSubtypes(c.typeLine))
      ctypes.set(t, (ctypes.get(t) ?? 0) + c.qty);
    if ((c.colors?.length ?? 0) === 0 && !c.isLand) colorless += c.qty;
    for (const col of c.colors ?? []) colors[col] += c.qty;
    const t = primaryType(c);
    typeMap.set(t, (typeMap.get(t) ?? 0) + c.qty);
  }

  let totalPriceEur = 0;
  let missingPrice = 0;
  for (const c of [...main, ...side]) {
    const p = eurOf(c);
    if (p != null) totalPriceEur += p * c.qty;
    else missingPrice += c.qty;
  }
  const maybePriceEur = maybe.reduce((s, c) => s + (eurOf(c) ?? 0) * c.qty, 0);

  return {
    mainCount: main.reduce((s, c) => s + c.qty, 0),
    sideCount: side.reduce((s, c) => s + c.qty, 0),
    maybeCount: maybe.reduce((s, c) => s + c.qty, 0),
    landCount,
    curve: [...curveMap].map(([label, count]) => ({
      label,
      count,
      creatures: curveCre.get(label) ?? 0,
    })),
    avgCmc: spellN ? cmcSum / spellN : 0,
    creatureTypes: [...ctypes]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    maybePriceEur,
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

function eurOf(c: DeckCard): number | undefined {
  const p = bestPrice({ prices: c.prices } as any);
  if (p && p.currency === "EUR") return p.value;
  return c.prices?.eur ?? undefined;
}

/**
 * Tipi di creatura dalla riga del tipo ("Legendary Creature — Elf Druid" →
 * Elf, Druid). Per le carte doppie conta ogni faccia creatura una volta.
 */
export function creatureSubtypes(typeLine: string): string[] {
  const out = new Set<string>();
  for (const face of typeLine.split(" // ")) {
    const [types, subs] = face.split(" — ");
    if (!subs || !/\bCreature\b/.test(types)) continue;
    for (const t of subs.trim().split(/\s+/)) if (t) out.add(t);
  }
  return [...out];
}

// --- Pedine generate dalle carte del mazzo ----------------------------------

export interface DeckToken extends TokenRef {
  /** Carte del mazzo che la creano (nomi). */
  from: string[];
  /** Almeno una delle carte che la creano è nel main. */
  inMain: boolean;
}

/** Pedine create dalle carte di main e side (la maybeboard non conta). */
export function deckTokens(deck: SavedDeck): DeckToken[] {
  const map = new Map<string, DeckToken>();
  for (const c of deck.cards) {
    if (c.board === "maybe") continue;
    for (const t of c.tokens ?? []) {
      // Stesso nome e tipo = stessa pedina, anche se di stampe diverse.
      const key = `${t.name}|${t.typeLine ?? ""}`;
      const cur = map.get(key) ?? { ...t, from: [], inMain: false };
      if (!cur.from.includes(c.name)) cur.from.push(c.name);
      if (c.board === "main") cur.inMain = true;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort(
    (a, b) => Number(b.inMain) - Number(a.inMain) || a.name.localeCompare(b.name),
  );
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

  // 2) Terre consigliate: formula di Frank Karsten (analisi di migliaia di
  // mazzi da torneo). 60 carte: 19,59 + 1,90 × CMC medio − 0,28 × magie
  // economiche (costo ≤ 2) che pescano o danno mana. Commander: 31,42 +
  // 3,13 × CMC medio − 0,28 × le stesse magie. Mazzi più grandi in proporzione.
  const cheap = spells.filter((c) => c.drawRamp).reduce((s, c) => s + c.qty, 0);
  const raw = commander
    ? 31.42 + 3.13 * avgCmc - 0.28 * cheap
    : (19.59 + 1.9 * avgCmc - 0.28 * cheap) * Math.max(1, mainCount / 60);
  const target = commander ? clamp(Math.round(raw), 30, 42) : clamp(Math.round(raw), 14, 28);
  const pct = mainCount ? Math.round((landCount / mainCount) * 100) : 0;
  const diff = landCount - target;
  // La formula tende a stare un po' alta: una o due terre in meno vanno ancora bene.
  const landVerdict: Verdict = diff >= -2 && diff <= 1 ? "good" : "warn";
  const why =
    `CMC medio ${avgCmc.toFixed(2)}` +
    (cheap > 0 ? `, ${cheap} magie economiche di pesca/mana` : "");
  items.push({
    label: "Terre",
    value: `${landCount} (${pct}%)`,
    verdict: landVerdict,
    note:
      landVerdict === "good"
        ? `giuste: ~${target} consigliate (${why})`
        : diff < 0
          ? `poche: ~${target} consigliate (${why})`
          : `troppe: ~${target} consigliate (${why})`,
  });

  // 3) Mano iniziale (7 carte): probabilità di avere 2, 3 o 4 terre.
  const keep = [2, 3, 4].reduce((s, k) => s + hyp(mainCount, landCount, 7, k), 0);
  const screw = [0, 1].reduce((s, k) => s + hyp(mainCount, landCount, 7, k), 0);
  const flood = Math.max(0, 1 - keep - screw);
  items.push({
    label: "Mano iniziale con 2-4 terre",
    value: `${Math.round(keep * 100)}%`,
    verdict: keep >= 0.7 ? "good" : "warn",
    note: `0-1 terre ${Math.round(screw * 100)}% · 5 o più terre ${Math.round(flood * 100)}%`,
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

  // Legalità delle singole carte nel formato (la maybeboard non conta).
  const played = [...main, ...side];
  for (const c of played) {
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
  for (const c of played) {
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
