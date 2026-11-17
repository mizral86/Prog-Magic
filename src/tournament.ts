// Tornei tra amici: iscritti, abbinamenti, risultati e classifica.
// Tutto lo stato sta in un oggetto JSON (TData) salvato nella riga del torneo
// su Supabase: qui solo funzioni pure, senza rete.
//
// Formati:
//   swiss        Svizzero: a ogni turno si affrontano giocatori con gli stessi
//                punti, senza rivincite; turni = log2(iscritti) arrotondato su.
//   roundrobin   Girone all'italiana: tutti contro tutti.
//   elimination  Eliminazione diretta: chi perde è fuori; i "bye" del primo
//                turno vanno ai primi sorteggiati.
// Punti partita: vittoria 3, pareggio 1, sconfitta 0. Il bye vale una vittoria 2-0.

export type TKind = "swiss" | "roundrobin" | "elimination";
export type TStatus = "open" | "running" | "done";

export const KINDS: { id: TKind; label: string; hint: string }[] = [
  { id: "swiss", label: "Svizzero", hint: "turni con chi ha i tuoi stessi punti, niente rivincite" },
  { id: "roundrobin", label: "Girone", hint: "tutti contro tutti" },
  { id: "elimination", label: "Eliminazione", hint: "chi perde è fuori, fino alla finale" },
];

export function kindLabel(k: TKind): string {
  return KINDS.find((x) => x.id === k)?.label ?? k;
}

export interface TPlayer {
  id: string;
  /** Account dell'amico, se iscritto con il suo profilo; null per un ospite. */
  uid: string | null;
  name: string;
  /** Ritirato: non viene più abbinato. */
  dropped?: boolean;
}

export interface TMatch {
  id: string;
  a: string;
  /** null = bye (vittoria a tavolino per a). */
  b: string | null;
  winsA: number;
  winsB: number;
  draws: number;
  done: boolean;
}

export interface TRound {
  n: number;
  matches: TMatch[];
}

export interface TData {
  players: TPlayer[];
  rounds: TRound[];
  /** Partite per incontro: 1 (secca) o 3 (al meglio di tre). */
  bestOf: 1 | 3;
  totalRounds: number;
}

export interface Tournament {
  id: string;
  group_id: string;
  name: string;
  kind: TKind;
  status: TStatus;
  data: TData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let seq = 0;
function mid(round: number): string {
  seq = (seq + 1) % 1e6;
  return `r${round}-${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function totalRoundsFor(kind: TKind, n: number): number {
  if (n < 2) return 0;
  if (kind === "roundrobin") return n % 2 === 0 ? n - 1 : n;
  return Math.ceil(Math.log2(n));
}

/** Partite da vincere per chiudere un incontro. */
export function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

function byeMatch(round: number, a: string): TMatch {
  return { id: mid(round), a, b: null, winsA: 2, winsB: 0, draws: 0, done: true };
}

function match(round: number, a: string, b: string): TMatch {
  return { id: mid(round), a, b, winsA: 0, winsB: 0, draws: 0, done: false };
}

// ---------------------------------------------------------------------------
// Creazione e turni

export function createData(players: { uid: string | null; name: string }[], kind: TKind, bestOf: 1 | 3): TData {
  const ps: TPlayer[] = players.map((p, i) => ({ id: `p${i + 1}`, uid: p.uid, name: p.name.trim() }));
  return { players: ps, rounds: [], bestOf, totalRounds: totalRoundsFor(kind, ps.length) };
}

/** Primo turno (o tutti i turni, nel girone). */
export function start(d: TData, kind: TKind, rng: Rng = Math.random): TData {
  const ids = shuffle(
    d.players.filter((p) => !p.dropped).map((p) => p.id),
    rng,
  );
  if (kind === "roundrobin") return { ...d, rounds: roundRobin(ids) };
  if (kind === "elimination") return { ...d, rounds: [eliminationFirst(ids)] };
  return { ...d, rounds: [swissRound(d, 1, rng, ids)] };
}

/** Metodo del cerchio: tutti i turni del girone in una volta. */
function roundRobin(ids: string[]): TRound[] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: TRound[] = [];
  for (let r = 0; r < n - 1; r++) {
    const matches: TMatch[] = [];
    for (let i = 0; i < n / 2; i++) {
      let a = list[i];
      let b = list[n - 1 - i];
      if (a === null) [a, b] = [b, a];
      if (a === null) continue;
      // Alterna chi è "primo" così nessuno è sempre a sinistra.
      if (b !== null && r % 2 === 1) [a, b] = [b, a];
      matches.push(b === null ? byeMatch(r + 1, a) : match(r + 1, a, b));
    }
    rounds.push({ n: r + 1, matches });
    // Ruota tutti tranne il primo.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

function eliminationFirst(ids: string[]): TRound {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, ids.length)));
  const byes = size - ids.length;
  const matches: TMatch[] = [];
  // I primi "byes" sorteggiati passano direttamente; gli altri si sfidano.
  for (let i = 0; i < byes; i++) matches.push(byeMatch(1, ids[i]));
  const rest = ids.slice(byes);
  for (let i = 0; i + 1 < rest.length; i += 2) matches.push(match(1, rest[i], rest[i + 1]));
  // Ordine del tabellone: alterna bye e incontri così i bye non si incrociano subito.
  const ordered: TMatch[] = [];
  const bys = matches.filter((m) => m.b === null);
  const real = matches.filter((m) => m.b !== null);
  while (bys.length || real.length) {
    if (real.length) ordered.push(real.shift()!);
    if (bys.length) ordered.push(bys.shift()!);
  }
  return { n: 1, matches: ordered };
}

/** Vincitore di un incontro concluso (null se pareggio o non concluso). */
export function matchWinner(m: TMatch): string | null {
  if (!m.done) return null;
  if (m.b === null) return m.a;
  if (m.winsA > m.winsB) return m.a;
  if (m.winsB > m.winsA) return m.b;
  return null;
}

function swissRound(d: TData, n: number, rng: Rng, order?: string[]): TRound {
  const st = standings(d);
  const active = st.filter((s) => !s.player.dropped);
  // Ordina per punti; a parità, ordine casuale (o quello del sorteggio).
  const rank = new Map((order ?? shuffle(active.map((s) => s.player.id), rng)).map((id, i) => [id, i]));
  const sorted = [...active].sort((x, y) => y.points - x.points || (rank.get(x.player.id)! - rank.get(y.player.id)!));
  const played = new Set<string>();
  const hadBye = new Set<string>();
  for (const r of d.rounds)
    for (const m of r.matches) {
      if (m.b === null) hadBye.add(m.a);
      else {
        played.add(`${m.a}|${m.b}`);
        played.add(`${m.b}|${m.a}`);
      }
    }
  let ids = sorted.map((s) => s.player.id);
  const matches: TMatch[] = [];
  if (ids.length % 2 === 1) {
    // Bye al più basso in classifica che non l'ha già avuto.
    let bi = ids.length - 1;
    while (bi > 0 && hadBye.has(ids[bi])) bi--;
    matches.push(byeMatch(n, ids[bi]));
    ids = ids.filter((_, i) => i !== bi);
  }
  const pairs = pairUp(ids, played) ?? pairUp(ids, new Set())!;
  for (const [a, b] of pairs) matches.unshift(match(n, a, b));
  // Il bye resta in fondo.
  matches.sort((x, y) => Number(x.b === null) - Number(y.b === null));
  return { n, matches };
}

/** Abbina in ordine evitando le rivincite (con ritorno sui propri passi). */
function pairUp(ids: string[], played: Set<string>): [string, string][] | null {
  if (ids.length === 0) return [];
  const [first, ...rest] = ids;
  for (let i = 0; i < rest.length; i++) {
    const other = rest[i];
    if (played.has(`${first}|${other}`)) continue;
    const sub = pairUp(
      rest.filter((_, j) => j !== i),
      played,
    );
    if (sub) return [[first, other], ...sub];
  }
  return null;
}

/** Turno attuale: il primo con incontri da giocare, altrimenti l'ultimo. */
export function currentRound(d: TData): TRound | null {
  return d.rounds.find((r) => r.matches.some((m) => !m.done)) ?? d.rounds[d.rounds.length - 1] ?? null;
}

export function roundComplete(r: TRound): boolean {
  return r.matches.every((m) => m.done);
}

/** Vero quando non ci sono più turni da giocare. */
export function isFinished(d: TData, kind: TKind): boolean {
  if (d.rounds.length === 0) return false;
  if (!d.rounds.every(roundComplete)) return false;
  if (kind === "elimination") {
    const last = d.rounds[d.rounds.length - 1];
    return last.matches.length === 1;
  }
  return d.rounds.length >= d.totalRounds;
}

/** Si può passare al turno dopo (svizzero ed eliminazione). */
export function canAdvance(d: TData, kind: TKind): boolean {
  if (kind === "roundrobin") return false;
  const last = d.rounds[d.rounds.length - 1];
  return !!last && roundComplete(last) && !isFinished(d, kind);
}

export function nextRound(d: TData, kind: TKind, rng: Rng = Math.random): TData {
  if (!canAdvance(d, kind)) return d;
  const n = d.rounds.length + 1;
  if (kind === "swiss") return { ...d, rounds: [...d.rounds, swissRound(d, n, rng)] };
  // Eliminazione: i vincitori, nell'ordine del tabellone.
  const last = d.rounds[d.rounds.length - 1];
  const winners = last.matches.map((m) => matchWinner(m)!).filter((w) => {
    const p = d.players.find((x) => x.id === w);
    return p && !p.dropped;
  });
  const matches: TMatch[] = [];
  for (let i = 0; i < winners.length; i += 2)
    matches.push(i + 1 < winners.length ? match(n, winners[i], winners[i + 1]) : byeMatch(n, winners[i]));
  return { ...d, rounds: [...d.rounds, { n, matches }] };
}

// ---------------------------------------------------------------------------
// Risultati

export function setResult(
  d: TData,
  matchId: string,
  r: { winsA: number; winsB: number; draws: number },
  kind: TKind,
): TData {
  return {
    ...d,
    rounds: d.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((m) => {
        if (m.id !== matchId || m.b === null) return m;
        const next = { ...m, winsA: Math.max(0, r.winsA), winsB: Math.max(0, r.winsB), draws: Math.max(0, r.draws) };
        next.done = resultComplete(next, d.bestOf, kind);
        return next;
      }),
    })),
  };
}

/** Un incontro è chiuso quando qualcuno ha le vittorie necessarie o le partite sono finite. */
export function resultComplete(m: TMatch, bestOf: number, kind: TKind): boolean {
  if (m.b === null) return true;
  const need = winsNeeded(bestOf);
  if (m.winsA >= need || m.winsB >= need) return true;
  const games = m.winsA + m.winsB + m.draws;
  if (games >= bestOf) return kind !== "elimination" || m.winsA !== m.winsB;
  return false;
}

/** Aggiunge una partita vinta (o pareggiata) a un incontro: per il segnapunti. */
export function addGameToMatch(d: TData, matchId: string, winner: string | null, kind: TKind): TData {
  const m = findMatch(d, matchId);
  if (!m || m.done || m.b === null) return d;
  return setResult(
    d,
    matchId,
    {
      winsA: m.winsA + (winner === m.a ? 1 : 0),
      winsB: m.winsB + (winner === m.b ? 1 : 0),
      draws: m.draws + (winner === null ? 1 : 0),
    },
    kind,
  );
}

export function findMatch(d: TData, matchId: string): TMatch | null {
  for (const r of d.rounds) for (const m of r.matches) if (m.id === matchId) return m;
  return null;
}

/** Incontri ancora da giocare del turno in corso. */
export function openMatches(d: TData): TMatch[] {
  const r = currentRound(d);
  return r ? r.matches.filter((m) => !m.done && m.b !== null) : [];
}

export function dropPlayer(d: TData, pid: string, dropped: boolean): TData {
  return { ...d, players: d.players.map((p) => (p.id === pid ? { ...p, dropped } : p)) };
}

// ---------------------------------------------------------------------------
// Classifica

export interface Standing {
  player: TPlayer;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  /** Media della % di vittorie degli avversari (minimo 33%, come da regole DCI). */
  omw: number;
  /** % di partite vinte. */
  gw: number;
  played: number;
  /** Eliminazione: turno in cui è uscito (Infinity se ancora in gioco). */
  outRound: number;
}

export function standings(d: TData): Standing[] {
  const base = new Map<string, Standing>();
  for (const p of d.players)
    base.set(p.id, { player: p, points: 0, wins: 0, losses: 0, draws: 0, omw: 0, gw: 0, played: 0, outRound: Infinity });
  const opps = new Map<string, string[]>();
  const games = new Map<string, { won: number; total: number }>();
  for (const p of d.players) {
    opps.set(p.id, []);
    games.set(p.id, { won: 0, total: 0 });
  }
  for (const r of d.rounds)
    for (const m of r.matches) {
      if (!m.done) continue;
      const a = base.get(m.a);
      if (!a) continue;
      if (m.b === null) {
        a.points += 3;
        a.wins++;
        continue;
      }
      const b = base.get(m.b);
      if (!b) continue;
      a.played++;
      b.played++;
      opps.get(m.a)!.push(m.b);
      opps.get(m.b)!.push(m.a);
      const t = m.winsA + m.winsB + m.draws;
      games.get(m.a)!.won += m.winsA + m.draws / 3;
      games.get(m.a)!.total += t;
      games.get(m.b)!.won += m.winsB + m.draws / 3;
      games.get(m.b)!.total += t;
      if (m.winsA > m.winsB) {
        a.points += 3;
        a.wins++;
        b.losses++;
        b.outRound = Math.min(b.outRound, r.n);
      } else if (m.winsB > m.winsA) {
        b.points += 3;
        b.wins++;
        a.losses++;
        a.outRound = Math.min(a.outRound, r.n);
      } else {
        a.points++;
        b.points++;
        a.draws++;
        b.draws++;
      }
    }
  const mwp = (s: Standing) => {
    const n = s.wins + s.losses + s.draws;
    return n ? Math.max(1 / 3, s.points / (3 * n)) : 1 / 3;
  };
  for (const s of base.values()) {
    const os = opps.get(s.player.id)!;
    s.omw = os.length ? os.reduce((sum, o) => sum + mwp(base.get(o)!), 0) / os.length : 0;
    const g = games.get(s.player.id)!;
    s.gw = g.total ? Math.max(1 / 3, g.won / g.total) : 0;
  }
  return [...base.values()].sort(
    (x, y) =>
      y.outRound - x.outRound ||
      y.points - x.points ||
      y.omw - x.omw ||
      y.gw - x.gw ||
      x.player.name.localeCompare(y.player.name),
  );
}

/** Classifica per svizzero e girone; l'eliminazione ordina per turno raggiunto. */
export function ranking(d: TData, kind: TKind): Standing[] {
  const st = standings(d);
  if (kind === "elimination") return st;
  return [...st].sort(
    (x, y) =>
      y.points - x.points || y.omw - x.omw || y.gw - x.gw || x.player.name.localeCompare(y.player.name),
  );
}

export function champion(d: TData, kind: TKind): TPlayer | null {
  if (!isFinished(d, kind)) return null;
  if (kind === "elimination") {
    const last = d.rounds[d.rounds.length - 1];
    const w = matchWinner(last.matches[0]);
    return d.players.find((p) => p.id === w) ?? null;
  }
  return ranking(d, kind)[0]?.player ?? null;
}

export function roundName(kind: TKind, d: TData, n: number): string {
  if (kind !== "elimination") return `Turno ${n}`;
  const left = d.totalRounds - n;
  if (left === 0) return "Finale";
  if (left === 1) return "Semifinali";
  if (left === 2) return "Quarti";
  return `Turno ${n}`;
}

export function playerName(d: TData, id: string | null): string {
  if (id === null) return "Bye";
  return d.players.find((p) => p.id === id)?.name ?? "?";
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
