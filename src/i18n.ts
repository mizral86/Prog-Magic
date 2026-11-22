// Lingua dell'interfaccia: italiano (predefinito) o inglese.
//
// I testi dell'app sono scritti in italiano direttamente nei componenti. In
// inglese un traduttore guarda la pagina (MutationObserver) e sostituisce i
// testi che trova nel dizionario i18n/en.txt: così ogni schermata viene
// tradotta senza toccare la logica, e una frase mancante resta semplicemente
// in italiano. Per i testi fuori dalla pagina (confirm/alert) c'è t().
//
// La scelta sta in localStorage "mm.lang" (non "pm.*": non va sul profilo, così
// resta anche dopo l'uscita dall'account). Cambiarla ricarica l'app.

import enText from "./i18n/en.txt?raw";
import { CREATURE_TYPES_IT } from "./creatureTypes";

export type Lang = "it" | "en";

const KEY = "mm.lang";

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "it") return v;
  } catch {
    /* storage non disponibile: italiano */
  }
  return "it";
}

const LANG: Lang = readLang();

export function getLang(): Lang {
  return LANG;
}

/** Salva la lingua e ricarica l'app per applicarla ovunque. */
export function setLang(lang: Lang): void {
  if (lang === LANG) return;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignora */
  }
  window.location.reload();
}

/** Locale per date e numeri. */
export function locale(): string {
  return LANG === "en" ? "en-GB" : "it-IT";
}

/** Sceglie tra due testi quando la stessa parola italiana ha più traduzioni. */
export function tr(it: string, en: string): string {
  return LANG === "en" ? en : it;
}

// ---------------------------------------------------------------------------
// Dizionario

interface Pattern {
  re: RegExp;
  /** Pezzo di testo fisso più lungo: controllo veloce prima della RegExp. */
  hint: string;
  /** Traduzione con {0}, {1}… */
  to: string;
  /** Lunghezza della parte fissa: i modelli più precisi vengono provati prima. */
  weight: number;
}

const exact = new Map<string, string>();
const patterns: Pattern[] = [];

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Legge le righe "italiano ⇒ inglese" (esportata per i test). */
export function parseDictionary(text: string): { exact: Map<string, string>; patterns: Pattern[] } {
  const ex = new Map<string, string>();
  const pats: Pattern[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const at = line.indexOf(" ⇒ ");
    if (at < 0) continue;
    const from = collapse(line.slice(0, at));
    const to = line.slice(at + 3).trim();
    if (!from || from === to) continue;
    if (/\{0\}/.test(from)) {
      const pieces = from.split(/\{\d\}/);
      const order = [...from.matchAll(/\{(\d)\}/g)].map((m) => m[1]);
      const re = new RegExp(
        "^" + pieces.map(escapeRe).join("([\\s\\S]+?)") + "$",
      );
      // I gruppi catturati sono nell'ordine in cui compaiono: rimappo {n}.
      let target = to;
      order.forEach((n, i) => {
        target = target.split(`{${n}}`).join(`\u0000${i}\u0000`);
      });
      target = target.replace(/\u0000(\d)\u0000/g, "{$1}");
      const hint = pieces.reduce((a, b) => (b.length > a.length ? b : a), "");
      pats.push({ re, hint, to: target, weight: pieces.join("").length });
    } else {
      ex.set(from, to);
    }
  }
  pats.sort((a, b) => b.weight - a.weight);
  return { exact: ex, patterns: pats };
}

let loaded = false;
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const d = parseDictionary(enText);
  for (const [k, v] of d.exact) exact.set(k, v);
  patterns.push(...d.patterns);
  // Tipi di creatura: nell'app sono mostrati con il nome italiano.
  for (const [en, it] of Object.entries(CREATURE_TYPES_IT)) {
    if (!exact.has(it)) exact.set(it, en);
  }
}

const cache = new Map<string, string | null>();

/** Traduce un testo già "pulito" (senza spazi ai bordi). null = non trovato. */
function lookup(core: string): string | null {
  const hit = exact.get(core);
  if (hit !== undefined) return hit;
  const c = cache.get(core);
  if (c !== undefined) return c;
  let out: string | null = null;
  for (const p of patterns) {
    if (p.hint && !core.includes(p.hint)) continue;
    const m = p.re.exec(core);
    if (!m) continue;
    out = p.to.replace(/\{(\d)\}/g, (_, i: string) => {
      // Anche le parti variabili possono essere frasi da tradurre (sono più corte: niente cicli).
      const g = m[Number(i) + 1] ?? "";
      return translateText(g) ?? g;
    });
    break;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(core, out);
  return out;
}

/** Traduzione di un testo qualsiasi, mantenendo gli spazi ai bordi. null = invariato. */
function translateText(s: string): string | null {
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return null;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  // Testi su più righe (confirm, segnaposto): riga per riga, tenendo gli a capo.
  if (m[2].includes("\n")) {
    let changed = false;
    const lines = m[2].split("\n").map((line) => {
      const r = line.trim() ? translateText(line) : null;
      if (r !== null) changed = true;
      return r ?? line;
    });
    if (changed) return m[1] + lines.join("\n") + m[3];
  }
  const core = collapse(m[2]);
  if (!core) return null;
  const t = lookup(core);
  return t === null ? null : m[1] + t + m[3];
}

/** Testo nella lingua scelta (per messaggi che non passano dalla pagina). */
export function t(s: string): string {
  if (LANG !== "en") return s;
  ensureLoaded();
  return translateText(s) ?? s;
}

// ---------------------------------------------------------------------------
// Traduttore della pagina

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
/** Elementi il cui testo interno non va toccato (gli attributi sì, es. placeholder). */
const SKIP_TEXT = new Set(["SCRIPT", "STYLE", "TEXTAREA", "PRE", "NOSCRIPT"]);

/** Parti marcate translate="no" (testi scritti dagli utenti): da non toccare. */
function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (e.getAttribute("translate") === "no") return true;
  }
  return false;
}

function skippedText(el: Element | null): boolean {
  if (!el) return true;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (SKIP_TEXT.has(e.tagName) || (e as HTMLElement).isContentEditable) return true;
  }
  return skipped(el);
}

function translateNode(node: Text): void {
  const v = node.nodeValue;
  if (!v || skippedText(node.parentElement)) return;
  const out = translateText(v);
  if (out !== null && out !== v) node.nodeValue = out;
}

function translateAttrs(el: Element): void {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const out = translateText(v);
    if (out !== null && out !== v) el.setAttribute(a, out);
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  translateAttrs(el);
  if (skippedText(el)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (e.getAttribute("translate") === "no") return NodeFilter.FILTER_REJECT;
        if (SKIP_TEXT.has(e.tagName)) {
          translateAttrs(e);
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const v = n.nodeValue;
      if (v) {
        const out = translateText(v);
        if (out !== null && out !== v) n.nodeValue = out;
      }
    } else {
      translateAttrs(n as Element);
    }
  }
}

/**
 * Avvia la traduzione della pagina (solo in inglese). Da chiamare prima di
 * montare React: l'osservatore traduce ogni testo appena compare o cambia.
 */
export function installTranslator(): void {
  document.documentElement.lang = LANG;
  if (LANG !== "en") return;
  ensureLoaded();
  document.title = t(document.title);

  // Messaggi delle finestre del browser.
  const w = window as unknown as {
    alert: (m?: unknown) => void;
    confirm: (m?: string) => boolean;
    prompt: (m?: string, d?: string) => string | null;
  };
  const alert0 = w.alert.bind(window);
  const confirm0 = w.confirm.bind(window);
  const prompt0 = w.prompt.bind(window);
  w.alert = (m?: unknown) => alert0(typeof m === "string" ? t(m) : m);
  w.confirm = (m?: string) => confirm0(m === undefined ? m : t(m));
  w.prompt = (m?: string, d?: string) => prompt0(m === undefined ? m : t(m), d);

  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") {
        translateNode(r.target as Text);
      } else if (r.type === "attributes") {
        const el = r.target as Element;
        if (!skipped(el)) {
          const v = el.getAttribute(r.attributeName!);
          if (v) {
            const out = translateText(v);
            if (out !== null && out !== v) el.setAttribute(r.attributeName!, out);
          }
        }
      } else {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) translateNode(n as Text);
          else translateTree(n);
        });
      }
    }
  });
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
  translateTree(document.body);
}
