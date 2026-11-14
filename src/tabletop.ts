// Tavolo libero (sandbox): stato e mosse pure, senza regole imposte.
// Ogni mossa restituisce un nuovo stato (così l'annulla è una pila di stati).

export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile";

export interface TCard {
  uid: number;
  name: string;
  /** Immagine alternativa (pedine). */
  img?: string;
  token?: boolean;
  tapped?: boolean;
  faceDown?: boolean;
  /** Segnalini generici (es. +1/+1). Possono essere negativi. */
  counters?: number;
  /** Posizione sul campo: angolo in alto a sinistra, in frazione di larghezza/altezza. */
  x?: number;
  y?: number;
}

export interface TableState {
  library: TCard[]; // indice 0 = cima del mazzo
  hand: TCard[];
  battlefield: TCard[]; // ultimo = sopra gli altri
  graveyard: TCard[]; // ultimo = in cima
  exile: TCard[];
  life: number;
  oppLife: number;
  turn: number;
  mulligans: number;
}

export const ZONES: Zone[] = ["library", "hand", "battlefield", "graveyard", "exile"];

export const ZONE_LABEL: Record<Zone, string> = {
  library: "Mazzo",
  hand: "Mano",
  battlefield: "Campo",
  graveyard: "Cimitero",
  exile: "Esilio",
};

let nextUid = 1;
export function newUid(): number {
  return nextUid++;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(names: string[], onPlay: boolean): TableState {
  const library = shuffle(names.map((name) => ({ uid: newUid(), name })));
  const s: TableState = {
    library,
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    life: 20,
    oppLife: 20,
    turn: 1,
    mulligans: 0,
  };
  return draw(s, onPlay ? 7 : 8);
}

export function findCard(s: TableState, uid: number): { zone: Zone; idx: number } | null {
  for (const z of ZONES) {
    const idx = s[z].findIndex((c) => c.uid === uid);
    if (idx >= 0) return { zone: z, idx };
  }
  return null;
}

export interface MoveOpts {
  /** Mazzo: true = in fondo (default in cima). Mano: posizione d'inserimento. */
  bottom?: boolean;
  index?: number;
  x?: number;
  y?: number;
  faceDown?: boolean;
}

/** Sposta una carta in un'altra zona (o nella stessa, per riposizionarla). */
export function moveCard(s: TableState, uid: number, to: Zone, o: MoveOpts = {}): TableState {
  const at = findCard(s, uid);
  if (!at) return s;
  const card = s[at.zone][at.idx];
  const next: TableState = { ...s, [at.zone]: s[at.zone].filter((c) => c.uid !== uid) };
  // Le pedine fuori dal campo smettono di esistere.
  if (card.token && to !== "battlefield") return next;

  let moved: TCard;
  if (to === "battlefield") {
    moved = {
      ...card,
      x: o.x ?? card.x,
      y: o.y ?? card.y,
      faceDown: o.faceDown ?? (at.zone === "battlefield" ? card.faceDown : false),
    };
    if (moved.x == null || moved.y == null) {
      const p = autoPlace(next);
      moved.x = p.x;
      moved.y = p.y;
    }
  } else {
    // Fuori dal campo una carta torna "pulita".
    moved = { uid: card.uid, name: card.name, img: card.img };
  }

  const list = next[to].slice();
  if (to === "library") {
    if (o.bottom) list.push(moved);
    else list.unshift(moved);
  } else if (to === "hand" && o.index != null) {
    let i = o.index;
    // Riordino nella stessa mano: l'indice era calcolato con la carta ancora dentro.
    if (at.zone === "hand" && at.idx < i) i--;
    list.splice(Math.max(0, Math.min(i, list.length)), 0, moved);
  } else {
    list.push(moved);
  }
  next[to] = list;
  return next;
}

// Prima posizione libera sul campo, a scorrimento in diagonale.
function autoPlace(s: TableState): { x: number; y: number } {
  const taken = (x: number, y: number) =>
    s.battlefield.some((c) => Math.abs((c.x ?? 0) - x) < 0.06 && Math.abs((c.y ?? 0) - y) < 0.06);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 0.02 + col * 0.135;
      const y = 0.04 + row * 0.3;
      if (!taken(x, y)) return { x, y };
    }
  }
  return { x: 0.05 + Math.random() * 0.5, y: 0.05 + Math.random() * 0.4 };
}

export function updateCard(s: TableState, uid: number, patch: Partial<TCard>): TableState {
  const at = findCard(s, uid);
  if (!at) return s;
  const list = s[at.zone].slice();
  list[at.idx] = { ...list[at.idx], ...patch };
  return { ...s, [at.zone]: list };
}

export function draw(s: TableState, n = 1): TableState {
  const k = Math.min(n, s.library.length);
  if (k <= 0) return s;
  return { ...s, library: s.library.slice(k), hand: [...s.hand, ...s.library.slice(0, k)] };
}

export function untapAll(s: TableState): TableState {
  return { ...s, battlefield: s.battlefield.map((c) => (c.tapped ? { ...c, tapped: false } : c)) };
}

/** Nuovo turno: stappa tutto e pesca una carta. */
export function nextTurn(s: TableState): TableState {
  return draw(untapAll({ ...s, turn: s.turn + 1 }), 1);
}

export function shuffleLibrary(s: TableState): TableState {
  return { ...s, library: shuffle(s.library) };
}

/** Mulligan alla londinese: la mano torna nel mazzo, si mescola e si pescano 7 carte. */
export function mulligan(s: TableState): TableState {
  const back = s.hand.map((c) => ({ uid: c.uid, name: c.name }));
  const t: TableState = {
    ...s,
    hand: [],
    library: shuffle([...s.library, ...back]),
    mulligans: s.mulligans + 1,
  };
  return draw(t, 7);
}

/** Copia una carta del campo come pedina, accanto all'originale. */
export function copyAsToken(s: TableState, uid: number): TableState {
  const at = findCard(s, uid);
  if (!at || at.zone !== "battlefield") return s;
  const c = s.battlefield[at.idx];
  const tok: TCard = {
    uid: newUid(),
    name: c.name,
    img: c.img,
    token: true,
    x: Math.min(0.9, (c.x ?? 0) + 0.04),
    y: Math.min(0.9, (c.y ?? 0) + 0.06),
  };
  return { ...s, battlefield: [...s.battlefield, tok] };
}

export function createToken(s: TableState, name: string, img?: string): TableState {
  const p = autoPlace(s);
  return { ...s, battlefield: [...s.battlefield, { uid: newUid(), name, img, token: true, ...p }] };
}
