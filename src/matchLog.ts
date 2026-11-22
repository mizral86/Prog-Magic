// Diario delle partite giocate con i propri mazzi: risultato, chi ha
// iniziato, mulligan, avversario. Si registra dal Tavolo, dal Segnapunti o a
// mano dalla scheda "Partite" del mazzo, e da qui escono le statistiche
// (vittorie per mazzo, inizio/pesca, avversari).
//
// Chiave "pm.*": con l'accesso il diario va sul profilo come mazzi e
// collezione. Resta anche se il mazzo viene eliminato (c'è il nome).

import { useEffect, useState } from "react";

export const MATCHES_KEY = "pm.matches.v1";

export type MatchResult = "win" | "loss" | "draw";
export type MatchSource = "tavolo" | "online" | "segnapunti" | "manuale";

export interface MatchEntry {
  id: string;
  deckId: string;
  /** Nome del mazzo quando è stata giocata (resta se il mazzo cambia nome o sparisce). */
  deckName: string;
  playedAt: number;
  result: MatchResult;
  /** true = hai iniziato tu, false = hai pescato per primo, assente = non si sa. */
  onPlay?: boolean;
  mulligans?: number;
  /** Avversario (persona). */
  opponent?: string;
  /** Mazzo o archetipo dell'avversario (es. "Mono Red"). */
  oppDeck?: string;
  /** Giocatori al tavolo (2 = uno contro uno). */
  players?: number;
  turns?: number;
  source: MatchSource;
  note?: string;
}

function load(): MatchEntry[] {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as MatchEntry[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

function save(list: MatchEntry[]) {
  try {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(list));
  } catch {
    /* spazio pieno: il guardiano dello storage avvisa */
  }
  listeners.forEach((l) => l());
}

export function allMatches(): MatchEntry[] {
  return load();
}

export function addMatch(m: Omit<MatchEntry, "id" | "playedAt"> & { playedAt?: number }): MatchEntry {
  const entry: MatchEntry = {
    ...m,
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    playedAt: m.playedAt ?? Date.now(),
  };
  // Le più recenti prima.
  save([entry, ...load()]);
  return entry;
}

export function removeMatch(id: string) {
  save(load().filter((m) => m.id !== id));
}

/** Tutte le partite del diario, aggiornate quando cambiano (anche da un'altra scheda o dal profilo). */
export function useMatches(): MatchEntry[] {
  const [list, setList] = useState<MatchEntry[]>(load);
  useEffect(() => {
    const reload = () => setList(load());
    listeners.add(reload);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MATCHES_KEY) reload();
    };
    window.addEventListener("storage", onStorage);
    // I dati del profilo arrivano scrivendo direttamente in localStorage.
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(reload);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return list;
}

// ---------------------------------------------------------------------------
// Statistiche

export interface Tally {
  n: number;
  w: number;
  l: number;
  d: number;
}

export function tally(list: MatchEntry[]): Tally {
  const t: Tally = { n: 0, w: 0, l: 0, d: 0 };
  for (const m of list) {
    t.n++;
    if (m.result === "win") t.w++;
    else if (m.result === "loss") t.l++;
    else t.d++;
  }
  return t;
}

/** Percentuale di vittorie (i pareggi contano mezza), o null senza partite. */
export function winRate(t: Tally): number | null {
  if (t.n === 0) return null;
  return Math.round(((t.w + t.d / 2) / t.n) * 100);
}

export interface MatchStats {
  all: Tally;
  play: Tally;
  draw: Tally;
  /** Partite in cui si sa chi ha iniziato. */
  known: number;
  avgMulligans: number | null;
  /** Mulligan fatti → risultato. */
  withMull: Tally;
  noMull: Tally;
  /** Per mazzo/archetipo avversario, dal più giocato. */
  byOpp: { name: string; t: Tally }[];
  /** Ultime 10 partite, dalla più vecchia: "win" | "loss" | "draw". */
  form: MatchResult[];
  streak: { result: MatchResult; n: number } | null;
}

export function matchStats(list: MatchEntry[]): MatchStats {
  const sorted = [...list].sort((a, b) => a.playedAt - b.playedAt);
  const play = sorted.filter((m) => m.onPlay === true);
  const draw = sorted.filter((m) => m.onPlay === false);
  const mull = sorted.filter((m) => typeof m.mulligans === "number");
  const byOppMap = new Map<string, { name: string; list: MatchEntry[] }>();
  for (const m of sorted) {
    const raw = (m.oppDeck || "").trim();
    const key = raw.toLowerCase() || "?";
    const cur = byOppMap.get(key) ?? { name: raw || "Non indicato", list: [] };
    cur.list.push(m);
    byOppMap.set(key, cur);
  }
  const byOpp = [...byOppMap.values()]
    .map((o) => ({ name: o.name, t: tally(o.list) }))
    .sort((a, b) => b.t.n - a.t.n || a.name.localeCompare(b.name));
  let streak: MatchStats["streak"] = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (!streak) streak = { result: r, n: 1 };
    else if (streak.result === r) streak.n++;
    else break;
  }
  return {
    all: tally(sorted),
    play: tally(play),
    draw: tally(draw),
    known: play.length + draw.length,
    avgMulligans: mull.length ? mull.reduce((s, m) => s + (m.mulligans ?? 0), 0) / mull.length : null,
    withMull: tally(mull.filter((m) => (m.mulligans ?? 0) > 0)),
    noMull: tally(mull.filter((m) => (m.mulligans ?? 0) === 0)),
    byOpp,
    form: sorted.slice(-10).map((m) => m.result),
    streak,
  };
}

/** Mazzi/archetipi avversari già scritti, per suggerirli (dal più usato). */
export function knownOppDecks(list: MatchEntry[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const m of list) {
    const raw = (m.oppDeck || "").trim();
    if (!raw) continue;
    const k = raw.toLowerCase();
    const cur = count.get(k) ?? { name: raw, n: 0 };
    cur.n++;
    count.set(k, cur);
  }
  return [...count.values()].sort((a, b) => b.n - a.n).map((x) => x.name);
}

export function knownOpponents(list: MatchEntry[]): string[] {
  const seen = new Map<string, string>();
  for (const m of list) {
    const raw = (m.opponent || "").trim();
    if (raw && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
  }
  return [...seen.values()];
}
