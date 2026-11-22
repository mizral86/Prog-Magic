// Segnapunti per partite dal vivo: stato, regole minime e salvataggio locale.
// Volutamente fuori dalle chiavi "pm.*": ogni tocco cambia lo stato e non ha
// senso caricarlo sul profilo online a ogni punto vita.

import { tr } from "./i18n";

export const LC_KEY = "mm.segnapunti.v1";

/** Sfondo del riquadro: un colore di mana oppure l'illustrazione di una carta. */
export type Tint = "W" | "U" | "B" | "R" | "G" | "M" | "C";
export const TINTS: { id: Tint; label: string }[] = [
  { id: "W", label: "Bianco" },
  { id: "U", label: "Blu" },
  { id: "B", label: "Nero" },
  { id: "R", label: "Rosso" },
  { id: "G", label: "Verde" },
  { id: "M", label: "Oro" },
  { id: "C", label: "Incolore" },
];

export type CounterKey = "poison" | "energy" | "exp" | "tax";
export const COUNTERS: { key: CounterKey; icon: string; label: string; hint?: string }[] = [
  { key: "poison", icon: "☠", label: "Veleno", hint: "a 10 sei fuori" },
  { key: "energy", icon: "⚡", label: "Energia" },
  { key: "exp", icon: "✦", label: "Esperienza" },
  { key: "tax", icon: "⟳", label: "Lanci comandante", hint: "ogni lancio costa {2} in più" },
];

export interface LcPlayer {
  id: string;
  name: string;
  tint: Tint;
  art?: string;
  /** Account dell'amico (gruppi), se scelto tra i membri del gruppo. */
  uid?: string;
  life: number;
  counters: Record<CounterKey, number>;
  /** Danni da comandante ricevuti, per id dell'avversario. */
  cmd: Record<string, number>;
}

export interface LcGame {
  players: LcPlayer[];
  startLife: number;
  commander: boolean;
  /** Riquadri girati verso chi siede intorno al telefono. */
  rotate: boolean;
  monarch?: string;
  /** Chi ha iniziato (scelto a caso). */
  first?: string;
  startedAt: number;
  /** Gruppo di amici in cui registrare la partita. */
  groupId?: string;
  /** Già registrata nel gruppo (id della partita salvata). */
  recordedId?: string;
}

export interface LcSetup {
  count: number;
  startLife: number;
  commander: boolean;
  rotate: boolean;
  players: { name: string; tint: Tint; art?: string; uid?: string }[];
  /** Gruppo di amici scelto (i nomi si prendono dai membri). */
  groupId?: string;
}

const DEFAULT_NAMES = [1, 2, 3, 4, 5, 6].map((n) => `${tr("Giocatore", "Player")} ${n}`);
const DEFAULT_TINTS: Tint[] = ["R", "U", "G", "B", "W", "M"];

export function defaultSetup(): LcSetup {
  return {
    count: 2,
    startLife: 20,
    commander: false,
    rotate: true,
    players: DEFAULT_NAMES.map((name, i) => ({ name, tint: DEFAULT_TINTS[i] })),
  };
}

function zero(): Record<CounterKey, number> {
  return { poison: 0, energy: 0, exp: 0, tax: 0 };
}

export function newGame(s: LcSetup): LcGame {
  const players = s.players.slice(0, s.count).map((p, i) => ({
    id: `p${i}`,
    name: p.name.trim() || DEFAULT_NAMES[i],
    tint: p.tint,
    art: p.art,
    uid: p.uid,
    life: s.startLife,
    counters: zero(),
    cmd: {},
  }));
  return {
    players,
    startLife: s.startLife,
    commander: s.commander,
    rotate: s.rotate,
    startedAt: Date.now(),
    groupId: s.groupId,
  };
}

/** Stessi giocatori, vita e segnalini da capo. */
export function resetGame(g: LcGame): LcGame {
  return {
    ...g,
    players: g.players.map((p) => ({ ...p, life: g.startLife, counters: zero(), cmd: {} })),
    monarch: undefined,
    first: undefined,
    startedAt: Date.now(),
    recordedId: undefined,
  };
}

function mapPlayer(g: LcGame, id: string, f: (p: LcPlayer) => LcPlayer): LcGame {
  return { ...g, players: g.players.map((p) => (p.id === id ? f(p) : p)) };
}

export function addLife(g: LcGame, id: string, d: number): LcGame {
  return mapPlayer(g, id, (p) => ({ ...p, life: p.life + d }));
}

export function addCounter(g: LcGame, id: string, k: CounterKey, d: number): LcGame {
  return mapPlayer(g, id, (p) => ({
    ...p,
    counters: { ...p.counters, [k]: Math.max(0, p.counters[k] + d) },
  }));
}

/** Danno da comandante: conta a parte e toglie anche la vita (regola 903.10a). */
export function addCmdDamage(g: LcGame, id: string, from: string, d: number): LcGame {
  return mapPlayer(g, id, (p) => {
    const cur = p.cmd[from] ?? 0;
    const next = Math.max(0, cur + d);
    const real = next - cur;
    return { ...p, cmd: { ...p.cmd, [from]: next }, life: p.life - real };
  });
}

/** Motivo per cui il giocatore ha perso, se c'è. */
export function lossReason(p: LcPlayer): string | null {
  if (p.life <= 0) return "Vita a zero";
  if (p.counters.poison >= 10) return "10 segnalini veleno";
  if (Object.values(p.cmd).some((v) => v >= 21)) return "21 danni da comandante";
  return null;
}

export function loadGame(): LcGame | null {
  try {
    const raw = localStorage.getItem(LC_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { game?: LcGame };
    return j.game && Array.isArray(j.game.players) ? j.game : null;
  } catch {
    return null;
  }
}

export function loadSetup(): LcSetup {
  try {
    const raw = localStorage.getItem(LC_KEY);
    const j = raw ? (JSON.parse(raw) as { setup?: LcSetup }) : {};
    if (j.setup && Array.isArray(j.setup.players)) {
      const d = defaultSetup();
      return { ...d, ...j.setup, players: d.players.map((p, i) => j.setup!.players[i] ?? p) };
    }
  } catch {
    /* vuoto */
  }
  return defaultSetup();
}

export function saveLc(setup: LcSetup, game: LcGame | null): void {
  try {
    localStorage.setItem(LC_KEY, JSON.stringify({ setup, game }));
  } catch {
    /* memoria piena o non disponibile: pazienza */
  }
}

/**
 * Posto di ogni giocatore intorno al telefono (in verticale).
 * Le coppie siedono sui lati lunghi (riquadri girati di 90°), un eventuale
 * giocatore in più siede in fondo; in due ci si guarda in faccia.
 */
export interface Seat {
  col: string; // grid-column
  row: string; // grid-row
  rot: 0 | 90 | 180 | 270;
}

export function seatsFor(n: number, rotate: boolean): { cols: number; rows: number; seats: Seat[] } {
  if (n <= 1) return { cols: 1, rows: 1, seats: [{ col: "1", row: "1", rot: 0 }] };
  if (n === 2)
    return {
      cols: 1,
      rows: 2,
      seats: [
        { col: "1", row: "1", rot: rotate ? 180 : 0 },
        { col: "1", row: "2", rot: 0 },
      ],
    };
  const pairs = Math.floor(n / 2);
  const odd = n % 2 === 1;
  const rows = pairs + (odd ? 1 : 0);
  const seats: Seat[] = [];
  // Lato sinistro dall'alto in basso, poi il giocatore in fondo, poi il lato
  // destro dal basso in alto: l'ordine segue il giro del tavolo.
  for (let i = 0; i < pairs; i++) seats.push({ col: "1", row: String(i + 1), rot: rotate ? 90 : 0 });
  if (odd) seats.push({ col: "1 / span 2", row: String(rows), rot: 0 });
  for (let i = pairs - 1; i >= 0; i--) seats.push({ col: "2", row: String(i + 1), rot: rotate ? 270 : 0 });
  return { cols: 2, rows, seats };
}

/** Chi è ancora in gioco; se è rimasto uno solo, la partita è finita. */
export function survivors(g: LcGame): LcPlayer[] {
  return g.players.filter((p) => !lossReason(p));
}
