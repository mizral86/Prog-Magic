// Tavolo in due: collegamento in tempo reale con un amico.
//
// Niente tabelle nuove sul server: la sfida parte come messaggio nella chat
// (vedi INVITE_RE) e la partita viaggia su un canale "broadcast" di Supabase
// Realtime (tavolo-<id>), con la presence per sapere se l'amico è collegato.
// Ognuno muove solo le proprie carte; all'altro arriva la parte "pubblica"
// del tavolo (campo, cimitero, esilio, vita, numero di carte in mano e nel
// mazzo). Le carte coperte viaggiano senza nome.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./cloud";
import { TableState, TCard } from "./tabletop";

/** Messaggio di chat che lancia la sfida: "[[tavolo:ID]] testo". */
export const INVITE_RE = /\[\[tavolo:([a-z0-9]{6,32})\]\]/;

export function inviteBody(gameId: string, deck: string): string {
  return `[[tavolo:${gameId}]] ⚔ Ti sfido al Tavolo! Io gioco con «${deck.slice(0, 60)}».`;
}

export function parseInvite(body: string): { gameId: string; text: string } | null {
  const m = INVITE_RE.exec(body);
  if (!m) return null;
  return { gameId: m[1], text: body.replace(INVITE_RE, "").trim() };
}

export function newGameId(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/** Carta vista dall'avversario. */
export interface PubCard {
  uid: number;
  name: string;
  img?: string;
  token?: boolean;
  tapped?: boolean;
  faceDown?: boolean;
  counters?: number;
  x?: number;
  y?: number;
}

/** La parte del tavolo che l'avversario può vedere. */
export interface PublicTable {
  life: number;
  turn: number;
  hand: number;
  library: number;
  mulligans: number;
  battlefield: PubCard[];
  graveyard: PubCard[];
  exile: PubCard[];
}

/** Immagini e nomi del mazzo, per mostrare le carte all'avversario. */
export interface DeckCard {
  name: string;
  printed?: string;
  img?: string;
  big?: string;
  type?: string;
}

export function publicOf(s: TableState): PublicTable {
  const pub = (c: TCard, hide = false): PubCard =>
    hide
      ? { uid: c.uid, name: "", faceDown: true, tapped: c.tapped, counters: c.counters, x: c.x, y: c.y }
      : {
          uid: c.uid,
          name: c.name,
          img: c.img,
          token: c.token,
          tapped: c.tapped,
          faceDown: c.faceDown,
          counters: c.counters,
          x: c.x,
          y: c.y,
        };
  return {
    life: s.life,
    turn: s.turn,
    hand: s.hand.length,
    library: s.library.length,
    mulligans: s.mulligans,
    battlefield: s.battlefield.map((c) => pub(c, !!c.faceDown)),
    graveyard: s.graveyard.map((c) => pub(c)),
    exile: s.exile.map((c) => pub(c)),
  };
}

/** Messaggi scambiati sul canale. */
export type NetMsg =
  | {
      t: "hello";
      reply: boolean;
      name: string;
      deck: string;
      cards: DeckCard[];
      table: PublicTable;
      /** Chi ha il turno (id account), se già deciso. */
      active: string | null;
    }
  | { t: "table"; table: PublicTable }
  | { t: "life"; d: number }
  | { t: "pass" }
  | { t: "leave" }
  | { t: "ping" };

export interface NetHandlers {
  onMsg: (m: NetMsg, from: string) => void;
  /** Chi è collegato al canale (id account), me compreso. */
  onPeers: (ids: Set<string>) => void;
  onStatus?: (ok: boolean) => void;
}

export interface GameLink {
  send(m: NetMsg): void;
  close(): void;
}

/** Collegamento vero, con Supabase Realtime. */
export function supabaseLink(gameId: string, uid: string, h: NetHandlers): GameLink | null {
  const sb = supabase();
  if (!sb) return null;
  const ch: RealtimeChannel = sb.channel(`tavolo-${gameId}`, {
    config: { broadcast: { self: false }, presence: { key: uid } },
  });
  let joined = false;
  const queue: NetMsg[] = [];
  ch.on("broadcast", { event: "m" }, ({ payload }) => {
    const p = payload as { from: string; m: NetMsg };
    if (p?.from && p.from !== uid && p.m) h.onMsg(p.m, p.from);
  });
  ch.on("presence", { event: "sync" }, () => h.onPeers(new Set(Object.keys(ch.presenceState()))));
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      joined = true;
      h.onStatus?.(true);
      void ch.track({ at: new Date().toISOString() });
      while (queue.length) void ch.send({ type: "broadcast", event: "m", payload: { from: uid, m: queue.shift() } });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      h.onStatus?.(false);
    }
  });
  return {
    send(m) {
      if (!joined) {
        // Prima del collegamento tengo solo l'ultimo stato del tavolo.
        if (m.t === "table") {
          const i = queue.findIndex((q) => q.t === "table");
          if (i >= 0) queue.splice(i, 1);
        }
        queue.push(m);
        return;
      }
      void ch.send({ type: "broadcast", event: "m", payload: { from: uid, m } });
    },
    close() {
      void sb.removeChannel(ch);
    },
  };
}

// ---------------------------------------------------------------------------
// Partita salvata sul telefono, per riprenderla se si ricarica l'app.

export interface SavedGame {
  /** Il mio account (sullo stesso telefono possono alternarsi più profili). */
  uid: string;
  gameId: string;
  friendId: string;
  friendName: string;
  /** Chi ha lanciato la sfida. */
  host?: boolean;
  deckLabel: string;
  names: string[];
  state: TableState | null;
  active: string | null;
  savedAt: number;
}

const SAVE_KEY = "mm.tavolo.online.v1";
const SAVE_TTL = 1000 * 60 * 60 * 24; // un giorno

export function loadSavedGame(uid: string | null): SavedGame | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${SAVE_KEY}.${uid}`);
    if (!raw) return null;
    const g = JSON.parse(raw) as SavedGame;
    if (!g?.gameId || Date.now() - (g.savedAt ?? 0) > SAVE_TTL) return null;
    return g;
  } catch {
    return null;
  }
}

export function saveGame(g: SavedGame) {
  try {
    localStorage.setItem(`${SAVE_KEY}.${g.uid}`, JSON.stringify({ ...g, savedAt: Date.now() }));
  } catch {
    /* spazio pieno o storage bloccato: pazienza */
  }
}

export function clearSavedGame(uid: string, gameId?: string) {
  try {
    if (gameId && loadSavedGame(uid)?.gameId !== gameId) return;
    localStorage.removeItem(`${SAVE_KEY}.${uid}`);
  } catch {
    /* niente */
  }
}
