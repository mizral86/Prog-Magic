// Regole e casistiche ufficiali di una carta ("rulings"), in italiano.
//
// Scryfall pubblica le rulings (Wizards of the Coast e Scryfall) solo in
// inglese: /cards/{id}/rulings. Le traduciamo al volo con Google Traduttore
// (endpoint pubblico gratuito, lo stesso del widget web) e salviamo il
// risultato nel telefono, così ogni carta si traduce una volta sola.
// Se la traduzione non riesce si mostrano le regole in inglese.

const API = "https://api.scryfall.com";
const TRANSLATE_URL =
  "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=it&dt=t";

/** Cache locale (riscaricabile: vedi storageGuard). Non è pm.* → non si sincronizza. */
export const RULINGS_CACHE_KEY = "mm.rulings.v1";
const CACHE_MAX = 300;
const CACHE_DAYS = 30;
/** Separatore tra una ruling e l'altra nella stessa richiesta di traduzione. */
const SEP = "\n@@\n";
/** Lunghezza massima del testo in una richiesta (poi si spezza). */
const MAX_CHARS = 4000;

export interface Ruling {
  /** Data di pubblicazione, "AAAA-MM-GG". */
  date: string;
  /** "wotc" (Wizards of the Coast) o "scryfall". */
  source: string;
  en: string;
  /** Traduzione italiana; assente se la traduzione non è riuscita. */
  it?: string;
}

interface CacheEntry {
  at: number;
  rulings: Ruling[];
}

type Cache = Record<string, CacheEntry>;

function readCache(): Cache {
  try {
    return (JSON.parse(localStorage.getItem(RULINGS_CACHE_KEY) ?? "{}") as Cache) ?? {};
  } catch {
    return {};
  }
}

function writeCache(key: string, rulings: Ruling[]) {
  try {
    const cache = readCache();
    cache[key] = { at: Date.now(), rulings };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete cache[k]);
    }
    localStorage.setItem(RULINGS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* memoria piena o privata: pazienza, si riscarica la prossima volta */
  }
}

interface ScryRuling {
  source?: string;
  published_at?: string;
  comment?: string;
}

async function fetchRulingsEn(card: { name: string; scryfallId?: string }): Promise<Ruling[]> {
  const path = card.scryfallId
    ? `/cards/${encodeURIComponent(card.scryfallId)}/rulings`
    : `/cards/named?exact=${encodeURIComponent(card.name)}`;
  let res = await fetch(API + path, { headers: { Accept: "application/json" } });
  if (!card.scryfallId && res.ok) {
    const c = (await res.json()) as { id?: string };
    if (!c.id) return [];
    res = await fetch(`${API}/cards/${c.id}/rulings`, { headers: { Accept: "application/json" } });
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
  const json = (await res.json()) as { data?: ScryRuling[] };
  return (json.data ?? [])
    .filter((r) => r.comment)
    .map((r) => ({
      date: r.published_at ?? "",
      source: r.source ?? "",
      en: r.comment!.trim(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Nomi da non tradurre (es. "Solitude" diventerebbe "Solitudine"). */
export function protectedNames(name: string, printedName?: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const add = (from: string, to: string) => {
    from = from.trim();
    if (from.length >= 3 && !out.some((o) => o.from === from)) out.push({ from, to: to.trim() });
  };
  // Il nome intero diventa quello italiano, se lo conosciamo.
  add(name, printedName && !printedName.includes("//") ? printedName : name);
  // Carte a due facce/divise: ogni faccia.
  const faces = name.split("//");
  const itFaces = printedName?.split("//");
  if (faces.length > 1) {
    faces.forEach((f, i) => add(f, itFaces?.length === faces.length ? itFaces[i] : f));
  }
  // Leggendari: le rulings usano spesso solo il nome corto ("Ragavan").
  for (const f of faces) {
    const short = f.split(",")[0];
    if (short !== f) add(short, short);
  }
  // Prima i più lunghi, così "Ragavan, Nimble Pilferer" non si spezza.
  return out.sort((a, b) => b.from.length - a.from.length);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Sostituisce i nomi con segnaposto che il traduttore lascia intatti. */
export function maskNames(text: string, names: { from: string }[]): string {
  let t = text;
  names.forEach((n, i) => {
    t = t.replace(new RegExp(`(?<![A-Za-z])${escapeRe(n.from)}(?![A-Za-z])`, "g"), `ZQX${i}`);
  });
  return t;
}

export function unmaskNames(text: string, names: { to: string }[]): string {
  return text.replace(/ZQX(\d+)/g, (m, i) => names[Number(i)]?.to ?? m);
}

/** Correzioni di termini che il traduttore automatico sbaglia. */
const FIXES: [RegExp, string][] = [
  [/\bProfetizione\b/g, "Profetizza"],
  [/\bprofetizione\b/g, "profetizza"],
];

export function fixTerms(text: string): string {
  return FIXES.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

async function googleTranslate(text: string): Promise<string> {
  const body = new URLSearchParams({ q: text });
  const res = await fetch(TRANSLATE_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`Traduttore: ${res.status}`);
  const json = (await res.json()) as [Array<[string, ...unknown[]]>, ...unknown[]];
  return (json[0] ?? []).map((s) => s[0] ?? "").join("");
}

/** Divide il risultato tradotto di più rulings unite da SEP. */
export function splitTranslated(text: string): string[] {
  return text.split(/\s*\n?\s*@@\s*\n?\s*/).map((s) => s.trim());
}

async function translateAll(texts: string[]): Promise<(string | undefined)[]> {
  // Raggruppa le rulings in richieste da massimo MAX_CHARS caratteri.
  const groups: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  texts.forEach((t, i) => {
    if (cur.length && len + t.length > MAX_CHARS) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += t.length + SEP.length;
  });
  if (cur.length) groups.push(cur);

  const out: (string | undefined)[] = texts.map(() => undefined);
  for (const g of groups) {
    try {
      const parts = splitTranslated(await googleTranslate(g.map((i) => texts[i]).join(SEP)));
      if (parts.length === g.length) {
        g.forEach((i, k) => (out[i] = parts[k]));
        continue;
      }
    } catch {
      /* si riprova una alla volta */
    }
    for (const i of g) {
      try {
        out[i] = (await googleTranslate(texts[i])).trim();
      } catch {
        /* resta in inglese */
      }
    }
  }
  return out;
}

/**
 * Regole e casistiche della carta in italiano (con l'originale inglese).
 * Usa la cache locale se c'è ed è completa.
 */
export async function getRulingsIt(card: {
  name: string;
  printedName?: string;
  scryfallId?: string;
}): Promise<Ruling[]> {
  const key = card.name.toLowerCase();
  const cached = readCache()[key];
  if (
    cached &&
    Date.now() - cached.at < CACHE_DAYS * 86400000 &&
    cached.rulings.every((r) => r.it)
  ) {
    return cached.rulings;
  }
  const rulings = await fetchRulingsEn(card);
  if (rulings.length === 0) {
    writeCache(key, []);
    return [];
  }
  const names = protectedNames(card.name, card.printedName);
  const translated = await translateAll(rulings.map((r) => maskNames(r.en, names)));
  const result = rulings.map((r, i) => {
    const t = translated[i];
    return t ? { ...r, it: fixTerms(unmaskNames(t, names)) } : r;
  });
  writeCache(key, result);
  return result;
}
