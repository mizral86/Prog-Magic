// Stato della sezione Amici condiviso da tutta l'app: profilo, amici,
// richieste, chi è online e messaggi non letti (per il pallino in alto).

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import {
  friendsBackend,
  FriendsBackend,
  FriendsError,
  Friendship,
  Message,
  Profile,
  setFriendsBackend,
} from "./friends";

export type FriendsStatus = "off" | "loading" | "setup" | "needProfile" | "ready" | "error";

export interface FriendEntry {
  friendship: Friendship;
  profile: Profile | undefined;
  /** id dell'altro account */
  id: string;
  online: boolean;
  unread: number;
}

interface FriendsValue {
  status: FriendsStatus;
  error: string | null;
  uid: string | null;
  me: Profile | null;
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
  /** Messaggi non letti + richieste ricevute. */
  badge: number;
  backend: FriendsBackend | null;
  saveProfile: (username: string, displayName: string | null) => Promise<void>;
  search: (q: string) => Promise<Profile[]>;
  sendRequest: (other: string) => Promise<void>;
  accept: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
  /** Avvisa la chat aperta di messaggi nuovi o letti. */
  onMessage: (cb: (m: Message, kind: "new" | "update") => void) => () => void;
  /** Chat aperta adesso (i suoi messaggi non contano come non letti). */
  setActiveChat: (id: string | null) => void;
  clearUnread: (id: string) => void;
  /** Prove in sviluppo con il finto server. */
  devMode: boolean;
}

const FriendsContext = createContext<FriendsValue | null>(null);

const TOUCH_EVERY = 120_000;

/** In sviluppo, ?finto=nome usa il finto server (vedi src/dev/fakeFriends.ts). */
function devUserName(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const q = new URLSearchParams(window.location.search).get("finto");
    if (q) sessionStorage.setItem("pmdev.finto", q);
    return sessionStorage.getItem("pmdev.finto");
  } catch {
    return null;
  }
}

export function FriendsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [devName] = useState(devUserName);
  const [devUid, setDevUid] = useState<string | null>(null);
  const [backend, setBackend] = useState<FriendsBackend | null>(() =>
    devName ? null : friendsBackend(),
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !devName) return;
    void import("./dev/fakeFriends").then((m) => {
      const id = m.fakeUserId(devName);
      if (!id) return;
      const b = new m.FakeFriends(id);
      setFriendsBackend(b);
      setDevUid(id);
      setBackend(b);
    });
  }, [devName]);

  const uid = devName ? devUid : auth.status === "in" ? auth.user?.id ?? null : null;

  const [status, setStatus] = useState<FriendsStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState<Record<string, number>>({});
  const listeners = useRef(new Set<(m: Message, kind: "new" | "update") => void>());
  const activeChat = useRef<string | null>(null);

  const handle = useCallback((e: unknown) => {
    if (e instanceof FriendsError && e.kind === "setup") {
      setStatus("setup");
      return;
    }
    throw e;
  }, []);

  // Profilo dell'utente.
  useEffect(() => {
    if (!uid || !backend) {
      setStatus(auth.status === "loading" || (devName && !devUid) ? "loading" : "off");
      setMe(null);
      return;
    }
    let alive = true;
    setStatus("loading");
    backend
      .myProfile(uid)
      .then((p) => {
        if (!alive) return;
        setMe(p);
        setStatus(p ? "ready" : "needProfile");
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof FriendsError && e.kind === "setup") setStatus("setup");
        else {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [uid, backend, auth.status, devName, devUid]);

  const refresh = useCallback(async () => {
    if (!uid || !backend) return;
    try {
      const fs = await backend.friendships();
      const others = fs.map((f) => (f.requester === uid ? f.addressee : f.requester));
      const [ps, un] = await Promise.all([backend.profiles(others), backend.unread(uid)]);
      setFriendships(fs);
      setProfiles(Object.fromEntries(ps.map((p) => [p.id, p])));
      if (activeChat.current) delete un[activeChat.current];
      setUnread(un);
      setError(null);
    } catch (e) {
      try {
        handle(e);
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : String(e2));
      }
    }
  }, [uid, backend, handle]);

  const ready = status === "ready" && !!uid && !!backend;

  // Amici, richieste, aggiornamenti in tempo reale, presenza.
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const stopLive = backend!.live(uid!, {
      onMessage(m) {
        if (m.receiver === uid && m.sender !== activeChat.current)
          setUnread((u) => ({ ...u, [m.sender]: (u[m.sender] ?? 0) + 1 }));
        listeners.current.forEach((cb) => cb(m, "new"));
      },
      onMessageUpdate(m) {
        listeners.current.forEach((cb) => cb(m, "update"));
      },
      onFriendships() {
        void refresh();
      },
    });
    const stopPresence = backend!.presence(uid!, setOnline);
    const touch = () => {
      if (document.visibilityState === "visible") void backend!.touch(uid!).catch(() => undefined);
    };
    touch();
    const t = window.setInterval(touch, TOUCH_EVERY);
    // Tornando nell'app ricarica (i messaggi arrivati col telefono in tasca).
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopLive();
      stopPresence();
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, backend, uid, refresh]);

  // Quando un amico va offline, rilegge i profili per l'orario "visto alle".
  const prevOnline = useRef<Set<string>>(new Set());
  useEffect(() => {
    const left = [...prevOnline.current].some((id) => !online.has(id) && profiles[id]);
    prevOnline.current = online;
    if (left && backend && uid) {
      const ids = Object.keys(profiles);
      void backend
        .profiles(ids)
        .then((ps) => setProfiles(Object.fromEntries(ps.map((p) => [p.id, p]))))
        .catch(() => undefined);
    }
  }, [online, profiles, backend, uid]);

  const entries = useMemo(() => {
    const mk = (f: Friendship): FriendEntry => {
      const id = f.requester === uid ? f.addressee : f.requester;
      return { friendship: f, profile: profiles[id], id, online: online.has(id), unread: unread[id] ?? 0 };
    };
    const all = friendships.map(mk);
    const friends = all
      .filter((e) => e.friendship.status === "accepted")
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) ||
          b.unread - a.unread ||
          (a.profile?.username ?? "").localeCompare(b.profile?.username ?? ""),
      );
    const incoming = all.filter((e) => e.friendship.status === "pending" && e.friendship.addressee === uid);
    const outgoing = all.filter((e) => e.friendship.status === "pending" && e.friendship.requester === uid);
    return { friends, incoming, outgoing };
  }, [friendships, profiles, online, unread, uid]);

  const badge =
    entries.incoming.length + entries.friends.reduce((s, e) => s + (e.unread > 0 ? e.unread : 0), 0);

  const value: FriendsValue = {
    status,
    error,
    uid,
    me,
    ...entries,
    badge,
    backend,
    async saveProfile(username, displayName) {
      if (!uid || !backend) return;
      const p = await backend.saveProfile(uid, username, displayName);
      setMe(p);
      setStatus("ready");
    },
    async search(q) {
      if (!backend) return [];
      return backend.search(q);
    },
    async sendRequest(other) {
      if (!uid || !backend) return;
      await backend.request(uid, other);
      await refresh();
    },
    async accept(id) {
      if (!backend) return;
      await backend.accept(id);
      await refresh();
    },
    async remove(id) {
      if (!backend) return;
      await backend.remove(id);
      await refresh();
    },
    refresh,
    onMessage(cb) {
      listeners.current.add(cb);
      return () => {
        listeners.current.delete(cb);
      };
    },
    setActiveChat(id) {
      activeChat.current = id;
    },
    clearUnread(id) {
      setUnread((u) => {
        if (!u[id]) return u;
        const n = { ...u };
        delete n[id];
        return n;
      });
    },
    devMode: !!devName,
  };

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsValue {
  const v = useContext(FriendsContext);
  if (!v) throw new Error("useFriends fuori da FriendsProvider");
  return v;
}
