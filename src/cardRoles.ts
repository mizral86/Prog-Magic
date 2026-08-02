// Deduzione euristica del "ruolo" di una carta dal testo oracle e dai tipi.
// Serve per l'analisi di matchup e i suggerimenti di sideboard.
//
// È volutamente approssimativo: riconosce i pattern più comuni, non ogni carta.

import { DeckEntry, CardInfo, Color, COLORS } from "./types";

export type Role =
  | "boardwipe" // spazzavia
  | "removal" // rimozione mirata
  | "creature-removal" // rimozione che colpisce creature
  | "counter" // counter magie
  | "carddraw" // pescata / card advantage
  | "discard" // scarto forzato
  | "threat" // minaccia proattiva (creatura/PW/battle)
  | "planeswalker"
  | "ramp" // accelerazione mana
  | "lifegain" // guadagno vita
  | "artifact-enchant-hate" // odio artefatti/incantesimi
  | "graveyard-hate" // odio cimitero
  | "uncounterable"; // non può essere neutralizzata

function t(card: CardInfo): string {
  return (card.oracleText || "").toLowerCase();
}

export function rolesOf(card: CardInfo): Set<Role> {
  const roles = new Set<Role>();
  const text = t(card);
  const cats = card.categories;

  // Minacce proattive.
  if (cats.includes("creature")) roles.add("threat");
  if (cats.includes("planeswalker")) {
    roles.add("threat");
    roles.add("planeswalker");
  }
  if (cats.includes("battle")) roles.add("threat");

  // Spazzavia (controllare prima delle rimozioni mirate).
  const wipe =
    /(destroy|exile) all (other )?(creatures|nonland permanents|permanents)/.test(
      text,
    ) ||
    /destroy each (creature|nonland)/.test(text) ||
    /all creatures get -\d+\/-\d+/.test(text) ||
    /(deals?) \d+ damage to each (creature|opponent and each creature)/.test(
      text,
    );
  if (wipe) roles.add("boardwipe");

  // Rimozione mirata.
  const targetsCreature =
    /(destroy|exile) target (creature|permanent)/.test(text) ||
    /target creature|target attacking creature/.test(text) ||
    /deals? \d+ damage to (target creature|any target|target creature or planeswalker)/.test(
      text,
    ) ||
    /target creature gets -\d+\/-\d+/.test(text) ||
    /return target creature .* to (its owner's|their) hand/.test(text);
  const targetsAny =
    /(destroy|exile) target (permanent|nonland permanent|artifact|enchantment|planeswalker)/.test(
      text,
    ) || /deals? \d+ damage to any target/.test(text);
  if (!wipe && (targetsCreature || targetsAny)) {
    roles.add("removal");
    if (targetsCreature) roles.add("creature-removal");
  }

  // Counter.
  if (/counter target (spell|ability|creature spell|noncreature spell)/.test(text))
    roles.add("counter");

  // Card draw.
  if (/draw (a card|\w+ cards|that many cards)/.test(text)) roles.add("carddraw");

  // Discard forzato.
  if (/target (player|opponent) discards|each opponent discards/.test(text))
    roles.add("discard");

  // Ramp (non-terra che produce mana o cerca terre).
  if (!card.isLand) {
    if (
      /search your library for (a|up to \w+) .*land/.test(text) ||
      /add \{[wubrgc0-9]/.test(text)
    ) {
      roles.add("ramp");
    }
  }

  // Guadagno vita.
  if (/gain \d+ life|gains \d+ life|you gain life|lifelink/.test(text))
    roles.add("lifegain");

  // Odio artefatti/incantesimi.
  if (
    /(destroy|exile) target (artifact|enchantment)/.test(text) ||
    /destroy all (artifacts|enchantments)/.test(text) ||
    /destroy target artifact or enchantment/.test(text)
  )
    roles.add("artifact-enchant-hate");

  // Odio cimitero.
  if (/exile .*graveyard|graveyards? .*exile|exile all cards from/.test(text))
    roles.add("graveyard-hate");

  // Non neutralizzabile.
  if (/can't be countered|cannot be countered/.test(text))
    roles.add("uncounterable");

  return roles;
}

const COLOR_WORD: Record<string, Color> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

// Colori contro cui la carta è specificamente efficace (protezione dal colore,
// odio di colore, rimozione mirata per colore). Es. Kor Firewalker -> [R],
// Celestial Purge -> [B,R], Aether Gust -> [R,G].
export function hosedColors(card: CardInfo): Color[] {
  const text = t(card);
  const found = new Set<Color>();
  const add = (w: string | undefined) => {
    if (w && COLOR_WORD[w]) found.add(COLOR_WORD[w]);
  };
  // "protection from <color>"
  for (const m of text.matchAll(/protection from (white|blue|black|red|green)/g))
    add(m[1]);
  // "prevent ... damage ... from <color>" / "damage from <color>"
  for (const m of text.matchAll(/damage[^.]*from (white|blue|black|red|green)/g))
    add(m[1]);
  // "<color> [or <color>] (spell|permanent|creature|card|source)"
  for (const m of text.matchAll(
    /\b(white|blue|black|red|green)\b(?:\s+or\s+(white|blue|black|red|green))?\s+(spell|permanent|creature|card|source)/g,
  )) {
    add(m[1]);
    add(m[2]);
  }
  // "<color> or <color>" ovunque (es. "that's red or green") — contesto d'odio.
  for (const m of text.matchAll(
    /\b(white|blue|black|red|green)\s+or\s+(white|blue|black|red|green)\b/g,
  )) {
    add(m[1]);
    add(m[2]);
  }
  return [...found];
}

// Carta che ostacola il guadagno di vita (anti-lifegain).
export function isAntiLifegain(card: CardInfo): boolean {
  const text = t(card);
  return /can't gain life|players can't gain life|damage can't be prevented/.test(
    text,
  );
}

// Carta "odio" ristretta: utile solo in matchup specifici.
export function isHoser(card: CardInfo): boolean {
  return hosedColors(card).length > 0 || isAntiLifegain(card);
}

// Colori (identità) di un mazzo.
export function deckColorIdentity(entries: DeckEntry[]): Color[] {
  const set = new Set<Color>();
  for (const e of entries) {
    if (!e.card) continue;
    for (const c of e.card.colorIdentity) set.add(c);
  }
  return COLORS.filter((c) => set.has(c));
}

export interface RoleCounts {
  threats: number;
  planeswalkers: number;
  removal: number;
  creatureRemoval: number;
  boardwipes: number;
  counters: number;
  carddraw: number;
  discard: number;
  ramp: number;
  lifegain: number;
  artifactEnchantHate: number;
  graveyardHate: number;
  /** minacce + tutta la disruption reattiva (utile per stime). */
  answers: number; // removal + boardwipe + counter
  disruption: number; // answers + discard
  /** quante carte usano il cimitero (per capire se ha senso l'odio-cimitero). */
  usesGraveyard: number;
  /** artefatti/incantesimi permanenti presenti (bersagli per l'odio). */
  artifactEnchantTargets: number;
}

const EMPTY: () => RoleCounts = () => ({
  threats: 0,
  planeswalkers: 0,
  removal: 0,
  creatureRemoval: 0,
  boardwipes: 0,
  counters: 0,
  carddraw: 0,
  discard: 0,
  ramp: 0,
  lifegain: 0,
  artifactEnchantHate: 0,
  graveyardHate: 0,
  answers: 0,
  disruption: 0,
  usesGraveyard: 0,
  artifactEnchantTargets: 0,
});

export function deckRoleCounts(entries: DeckEntry[]): RoleCounts {
  const c = EMPTY();
  for (const e of entries) {
    if (!e.card) continue;
    const q = e.quantity;
    const roles = rolesOf(e.card);
    if (roles.has("threat")) c.threats += q;
    if (roles.has("planeswalker")) c.planeswalkers += q;
    if (roles.has("removal")) c.removal += q;
    if (roles.has("creature-removal")) c.creatureRemoval += q;
    if (roles.has("boardwipe")) c.boardwipes += q;
    if (roles.has("counter")) c.counters += q;
    if (roles.has("carddraw")) c.carddraw += q;
    if (roles.has("discard")) c.discard += q;
    if (roles.has("ramp")) c.ramp += q;
    if (roles.has("lifegain")) c.lifegain += q;
    if (roles.has("artifact-enchant-hate")) c.artifactEnchantHate += q;
    if (roles.has("graveyard-hate")) c.graveyardHate += q;
    if (/graveyard/.test((e.card.oracleText || "").toLowerCase()))
      c.usesGraveyard += q;
    if (
      (e.card.categories.includes("artifact") ||
        e.card.categories.includes("enchantment")) &&
      !e.card.categories.includes("land")
    )
      c.artifactEnchantTargets += q;
  }
  c.answers = c.removal + c.boardwipes + c.counters;
  c.disruption = c.answers + c.discard;
  return c;
}

/** Nomi (con quantità) delle carte che hanno un certo ruolo, per gli elenchi. */
export function namesWithRole(entries: DeckEntry[], role: Role): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (!e.card) continue;
    if (rolesOf(e.card).has(role)) out.push(e.card.name);
  }
  return out;
}

/** Le minacce più "veloci" (cmc più basso) di un mazzo. */
export function topThreats(entries: DeckEntry[], n: number): string[] {
  return entries
    .filter((e) => e.card && rolesOf(e.card).has("threat"))
    .sort((a, b) => (a.card!.cmc ?? 0) - (b.card!.cmc ?? 0))
    .slice(0, n)
    .map((e) => e.card!.name);
}
