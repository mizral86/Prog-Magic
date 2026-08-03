// Risoluzione delle carte tramite l'API pubblica di Scryfall.
// Usa l'endpoint /cards/collection (POST) che accetta fino a 75 identificatori
// per richiesta: molto più gentile del rate limit del lookup singolo.
//
// Docs: https://scryfall.com/docs/api/cards/collection

import { CardCategory, CardInfo, Color, COLORS, ManaAbility } from "./types";

const COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const CHUNK = 75;

// Oggetto carta di Scryfall (solo i campi che ci servono).
interface ScryCardFace {
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { normal?: string; small?: string };
}
interface ScryCard {
  id?: string;
  name: string;
  cmc?: number;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  produced_mana?: string[];
  image_uris?: { normal?: string; small?: string };
  card_faces?: ScryCardFace[];
  rarity?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  released_at?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities?: Record<string, string>;
  prices?: {
    eur?: string | null;
    eur_foil?: string | null;
    usd?: string | null;
    usd_foil?: string | null;
  };
}

interface CollectionResponse {
  data: ScryCard[];
  not_found: { name?: string }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function asColors(arr: string[] | undefined): Color[] {
  if (!arr) return [];
  return arr.filter((c): c is Color => (COLORS as string[]).includes(c));
}

function parsePips(manaCost: string): {
  pips: Partial<Record<Color, number>>;
  generic: number;
} {
  const pips: Partial<Record<Color, number>> = {};
  let generic = 0;
  const matches = manaCost.match(/\{([^}]+)\}/g) ?? [];
  for (const token of matches) {
    const sym = token.slice(1, -1); // rimuove le graffe
    if (/^\d+$/.test(sym)) {
      generic += parseInt(sym, 10);
    } else if ((COLORS as string[]).includes(sym)) {
      const c = sym as Color;
      pips[c] = (pips[c] ?? 0) + 1;
    } else if (sym.includes("/")) {
      // Simbolo ibrido (es. "R/G" o "2/W"): lo contiamo come 1 generico
      // (approssimazione: pagabile in modo flessibile).
      generic += 1;
    } else if (sym === "X" || sym === "Y" || sym === "Z") {
      // X vale 0 al lancio ai fini della curva.
    } else {
      generic += 1; // simboli speciali (Phyrexian, ecc.)
    }
  }
  return { pips, generic };
}

function categoriesFromTypeLine(typeLine: string): CardCategory[] {
  const t = typeLine.toLowerCase();
  const cats: CardCategory[] = [];
  if (t.includes("land")) cats.push("land");
  if (t.includes("creature")) cats.push("creature");
  if (t.includes("planeswalker")) cats.push("planeswalker");
  if (t.includes("instant")) cats.push("instant");
  if (t.includes("sorcery")) cats.push("sorcery");
  if (t.includes("artifact")) cats.push("artifact");
  if (t.includes("enchantment")) cats.push("enchantment");
  if (t.includes("battle")) cats.push("battle");
  if (cats.length === 0) cats.push("other");
  return cats;
}

function detectEntersTapped(card: ScryCard): boolean {
  const text = (
    card.oracle_text ??
    card.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ??
    ""
  ).toLowerCase();
  // "enters tapped" o "enters the battlefield tapped", ma non se è condizionale
  // ("unless", "you may"): in quei casi assumiamo prudenzialmente NON tappata.
  if (!/enters (the battlefield )?tapped/.test(text)) return false;
  const idx = text.indexOf("tapped");
  const around = text.slice(Math.max(0, idx - 60), idx + 20);
  if (around.includes("unless") || around.includes("you may")) return false;
  return true;
}

// Quanti mana produce una clausola "add {...}".
function parseAddAmount(text: string): number {
  const m = text.match(/add ((?:\{[^}]+\}\s*)+)/);
  if (m) {
    const syms = m[1].match(/\{[^}]+\}/g);
    if (syms) return Math.min(3, syms.length);
  }
  if (/add three mana/.test(text)) return 3;
  if (/add two mana/.test(text)) return 2;
  return 1;
}

// Deduce l'eventuale abilità di mana (dork/rock/ramp) di una carta non-terra.
function deriveManaAbility(
  producedRaw: string[] | undefined,
  isLand: boolean,
  cats: CardCategory[],
  text: string,
): ManaAbility | undefined {
  if (isLand) return undefined;
  const isCreature = cats.includes("creature");
  const isArtifact = cats.includes("artifact");
  const produces = producedRaw ?? [];

  // Permanente che tappa per mana (mana dork / mana rock).
  if (
    (isCreature || isArtifact) &&
    produces.length > 0 &&
    /\{t\}/.test(text) &&
    /add (\{|one mana|two mana|three mana|that much)/.test(text)
  ) {
    return {
      kind: "permanent",
      colors: asColors(produces),
      amount: parseAddAmount(text),
      isCreature,
    };
  }

  // Ramp che mette terre in gioco (Rampant Growth, Cultivate, Explosive Vegetation…).
  // Deve essere il proprietario a cercare NELLA PROPRIA libreria una terra da
  // mettere in gioco: così si evita di scambiare per ramp le rimozioni con
  // clausola "il controllore cerca una terra" (es. Path to Exile).
  if (
    /search your library for [^.]*\bland/.test(text) &&
    /onto the battlefield/.test(text) &&
    !/exile target|destroy target|counter target/.test(text)
  ) {
    const two =
      /two (basic )?lands?[^.]*onto the battlefield/.test(text) ||
      /both[^.]*onto the battlefield/.test(text);
    return { kind: "fetch", colors: [], amount: two ? 2 : 1, isCreature };
  }

  return undefined;
}

function toCardInfo(card: ScryCard): CardInfo {
  const front = card.card_faces?.[0];
  const typeLine = card.type_line ?? front?.type_line ?? "";
  const manaCost = card.mana_cost ?? front?.mana_cost ?? "";
  const isLand = typeLine.toLowerCase().includes("land");
  const { pips, generic } = parsePips(manaCost);
  const colors = asColors(card.colors ?? front?.colors);
  const imageUrl =
    card.image_uris?.normal ?? front?.image_uris?.normal ?? undefined;
  const imageSmallUrl =
    card.image_uris?.small ?? front?.image_uris?.small ?? undefined;
  const oracleText =
    card.oracle_text ??
    card.card_faces?.map((f) => f.oracle_text ?? "").join("\n") ??
    "";

  return {
    name: card.name,
    cmc: card.cmc ?? 0,
    typeLine,
    categories: categoriesFromTypeLine(typeLine),
    colors,
    colorIdentity: asColors(card.color_identity),
    isLand,
    producedMana: asColors(card.produced_mana),
    entersTapped: isLand && detectEntersTapped(card),
    manaCost,
    pips,
    generic,
    oracleText,
    manaAbility: deriveManaAbility(
      card.produced_mana,
      isLand,
      categoriesFromTypeLine(typeLine),
      oracleText.toLowerCase(),
    ),
    imageUrl,
    imageSmallUrl,
    scryfallId: card.id,
    rarity: card.rarity,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at,
    power: parsePT(card.power ?? front?.power),
    toughness: parsePT(card.toughness ?? front?.toughness),
    loyalty: parsePT(card.loyalty ?? front?.loyalty),
    legalities: card.legalities,
    prices: {
      eur: num(card.prices?.eur),
      eurFoil: num(card.prices?.eur_foil),
      usd: num(card.prices?.usd),
      usdFoil: num(card.prices?.usd_foil),
    },
  };
}

function num(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

// Forza/costituzione/lealtà: numerico, con "*"/valori variabili trattati come 0.
function parsePT(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

export interface ResolveResult {
  cards: Map<string, CardInfo>; // chiave: nome lowercase
  notFound: string[];
}

export async function resolveCards(names: string[]): Promise<ResolveResult> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const cards = new Map<string, CardInfo>();
  const notFound: string[] = [];

  for (const group of chunk(unique, CHUNK)) {
    const body = JSON.stringify({
      identifiers: group.map((name) => ({ name })),
    });
    const res = await fetch(COLLECTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(
        `Scryfall ha risposto ${res.status} ${res.statusText}. Riprova tra poco.`,
      );
    }
    const json = (await res.json()) as CollectionResponse;
    for (const c of json.data) {
      cards.set(c.name.toLowerCase(), toCardInfo(c));
    }
    for (const nf of json.not_found) {
      if (nf.name) notFound.push(nf.name);
    }
    // Piccola pausa di cortesia tra i chunk (Scryfall consiglia ~50-100ms).
    if (unique.length > CHUNK) await sleep(120);
  }

  return { cards, notFound };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const SEARCH_URL = "https://api.scryfall.com/cards/search";

// Criteri di ordinamento supportati dalla ricerca (sottoinsieme di Scryfall).
export type SortOrder = "name" | "cmc" | "rarity" | "eur" | "released";
export interface SearchOptions {
  order?: SortOrder;
  dir?: "asc" | "desc";
}

// Ricerca carte per query (nome o sintassi Scryfall). Prima pagina di risultati.
// include_multilingual=true fa matchare anche i nomi in italiano (e altre
// lingue), così si può cercare sia "Lightning Bolt" sia "Fulmine".
export async function searchCards(
  query: string,
  opts: SearchOptions = {},
): Promise<CardInfo[]> {
  const q = query.trim();
  if (!q) return [];
  const order = opts.order ?? "name";
  const dir = opts.dir ?? (order === "name" ? "asc" : "desc");
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
    `&unique=cards&order=${order}&dir=${dir}&include_multilingual=true`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return []; // nessun risultato
  if (!res.ok) {
    throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
  }
  const json = (await res.json()) as { data: ScryCard[] };
  // Con il multilingua possono arrivare doppioni per nome (stessa carta in più
  // lingue): li riduciamo a una voce per carta (oracle_id o nome).
  const seen = new Set<string>();
  const out: CardInfo[] = [];
  for (const c of json.data) {
    const key = (c.name || "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toCardInfo(c));
  }
  return out;
}

// --- Set / espansioni --------------------------------------------------------

export interface SetInfo {
  code: string;
  name: string;
  released?: string;
  cardCount: number;
  iconUrl?: string;
  setType?: string;
  digital?: boolean;
}

const SETS_URL = "https://api.scryfall.com/sets";

// Elenco di tutti i set pubblicati, dal più recente.
export async function getSets(): Promise<SetInfo[]> {
  const res = await fetch(SETS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
  }
  const json = (await res.json()) as {
    data: {
      code: string;
      name: string;
      released_at?: string;
      card_count: number;
      icon_svg_uri?: string;
      set_type?: string;
      digital?: boolean;
    }[];
  };
  return json.data
    .map((s) => ({
      code: s.code,
      name: s.name,
      released: s.released_at,
      cardCount: s.card_count,
      iconUrl: s.icon_svg_uri,
      setType: s.set_type,
      digital: s.digital,
    }))
    .sort((a, b) => (b.released ?? "").localeCompare(a.released ?? ""));
}

// Carte di un set (per codice), in ordine di numero di collezione.
// Segue la paginazione di Scryfall (175/pagina) con un tetto di sicurezza.
export async function getSetCards(code: string): Promise<CardInfo[]> {
  const q = `e:${code} unique:prints`;
  let next: string | null =
    `${SEARCH_URL}?q=${encodeURIComponent(q)}&order=set&dir=asc`;
  const out: CardInfo[] = [];
  let guard = 0;
  while (next && guard < 8) {
    const res: Response = await fetch(next, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) break; // set senza carte / codice ignoto
    if (!res.ok) {
      throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
    }
    const json = (await res.json()) as {
      data: ScryCard[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const c of json.data) out.push(toCardInfo(c));
    next = json.has_more ? json.next_page ?? null : null;
    guard++;
    if (next) await sleep(100);
  }
  return out;
}

// Tutte le stampe/edizioni di una carta (per nome esatto), dalla più recente.
export async function getPrintings(name: string): Promise<CardInfo[]> {
  const q = `!"${name}" unique:prints`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&order=released&dir=desc`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
  }
  const json = (await res.json()) as { data: ScryCard[] };
  return json.data.map(toCardInfo);
}
