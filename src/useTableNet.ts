// Stato di rete della partita in due al Tavolo (vedi onlineGame.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DeckCard,
  GameLink,
  NetHandlers,
  NetMsg,
  PublicTable,
  publicOf,
  supabaseLink,
} from "./onlineGame";
import { TableState } from "./tabletop";

export interface NetOptions {
  gameId: string;
  uid: string;
  friendId: string;
  friendName: string;
  myName: string;
  deckLabel: string;
  cards: DeckCard[];
  /** Chi ha lanciato la sfida decide a caso chi inizia. */
  host: boolean;
  initialActive: string | null;
  devMode: boolean;
}

export interface Opponent {
  name: string;
  deck: string;
  cards: Map<string, DeckCard>;
  table: PublicTable | null;
}

export interface TableNet {
  uid: string;
  friendId: string;
  friendName: string;
  /** Canale collegato (false = rete assente o server non raggiungibile). */
  linked: boolean;
  /** L'amico ha il tavolo aperto adesso. */
  peerOnline: boolean;
  opp: Opponent;
  /** Id di chi ha il turno, null finché i due non si sono visti. */
  active: string | null;
  oppLeft: boolean;
  publish: (s: TableState) => void;
  sendLife: (d: number) => void;
  pass: () => void;
  leave: () => void;
  /** Eventi che cambiano il MIO tavolo (vita, turno passato a me). */
  onRemote: (cb: (m: NetMsg) => void) => () => void;
}

const SEND_DELAY = 120;

export function useTableNet(o: NetOptions): TableNet {
  const [linked, setLinked] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [active, setActive] = useState<string | null>(o.initialActive);
  const [oppLeft, setOppLeft] = useState(false);
  const [opp, setOpp] = useState<Opponent>({
    name: o.friendName,
    deck: "",
    cards: new Map(),
    table: null,
  });

  const link = useRef<GameLink | null>(null);
  const mine = useRef<PublicTable | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const optsRef = useRef(o);
  optsRef.current = o;
  const listeners = useRef(new Set<(m: NetMsg) => void>());
  const timer = useRef<number | null>(null);
  const peerWas = useRef(false);

  const hello = useCallback((reply: boolean) => {
    const op = optsRef.current;
    if (!link.current || !mine.current) return;
    link.current.send({
      t: "hello",
      reply,
      name: op.myName,
      deck: op.deckLabel,
      cards: op.cards,
      table: mine.current,
      active: activeRef.current,
    });
  }, []);

  useEffect(() => {
    let closed = false;
    const { gameId, uid, friendId, devMode } = o;
    const h: NetHandlers = {
      onStatus: (ok) => !closed && setLinked(ok),
      onPeers(ids) {
        if (closed) return;
        const on = ids.has(friendId);
        setPeerOnline(on);
        if (on && !peerWas.current) {
          setOppLeft(false);
          if (optsRef.current.host && !activeRef.current) {
            const first = Math.random() < 0.5 ? uid : friendId;
            activeRef.current = first;
            setActive(first);
          }
          hello(false);
        }
        peerWas.current = on;
      },
      onMsg(m, from) {
        if (closed || from !== friendId) return;
        switch (m.t) {
          case "hello":
            setOpp({
              name: m.name || optsRef.current.friendName,
              deck: m.deck,
              cards: new Map(m.cards.map((c) => [c.name.toLowerCase(), c])),
              table: m.table,
            });
            setOppLeft(false);
            if (!activeRef.current && m.active) {
              activeRef.current = m.active;
              setActive(m.active);
            }
            if (!m.reply) hello(true);
            break;
          case "table":
            setOpp((p) => ({ ...p, table: m.table }));
            break;
          case "pass":
            activeRef.current = uid;
            setActive(uid);
            break;
          case "leave":
            setOppLeft(true);
            break;
        }
        listeners.current.forEach((cb) => cb(m));
      },
    };
    if (import.meta.env.DEV && devMode) {
      void import("./dev/fakeGameLink").then((mod) => {
        if (!closed) link.current = mod.fakeLink(gameId, uid, h);
      });
    } else {
      link.current = supabaseLink(gameId, uid, h);
    }
    return () => {
      closed = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      link.current?.close();
      link.current = null;
      peerWas.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.gameId, o.uid, o.friendId, o.devMode]);

  const publish = useCallback((s: TableState) => {
    mine.current = publicOf(s);
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (link.current && mine.current) link.current.send({ t: "table", table: mine.current });
    }, SEND_DELAY);
  }, []);

  const onRemote = useCallback((cb: (m: NetMsg) => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  return {
    uid: o.uid,
    friendId: o.friendId,
    friendName: opp.name || o.friendName,
    linked,
    peerOnline,
    opp,
    active,
    oppLeft,
    publish,
    sendLife: (d) => link.current?.send({ t: "life", d }),
    pass() {
      link.current?.send({ t: "pass" });
      activeRef.current = o.friendId;
      setActive(o.friendId);
    },
    leave: () => link.current?.send({ t: "leave" }),
    onRemote,
  };
}
