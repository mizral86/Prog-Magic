// SOLO SVILUPPO: finto server per provare la sezione Amici senza Supabase.
// Si attiva aprendo l'app in sviluppo con ?finto=luciano (o marco, giulia).
// I dati stanno nel localStorage del browser, condivisi tra le schede: due
// schede con utenti diversi si scrivono come se fossero due telefoni.

import type { Friendship, FriendsBackend, LiveHandlers, Message, Profile } from "../friends";
import { FriendsError } from "../friends";

const KEY = "pmdev.fake";
const ONLINE = "pmdev.online.";

interface Db {
  users: { id: string; email: string }[];
  profiles: Profile[];
  friendships: Friendship[];
  messages: Message[];
  seq: number;
}

const SEED_USERS = ["luciano", "marco", "giulia"].map((n, i) => ({
  id: `0000000${i}-0000-4000-8000-00000000000${i}`,
  email: `${n}@esempio.it`,
}));

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* vuoto */
  }
  return { users: SEED_USERS, profiles: [], friendships: [], messages: [], seq: 1 };
}
function save(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
const now = () => new Date().toISOString();

export function fakeUserId(name: string): string | null {
  return SEED_USERS.find((u) => u.email.startsWith(name + "@"))?.id ?? null;
}

export class FakeFriends implements FriendsBackend {
  constructor(private me: string) {}

  private connected(db: Db, a: string, b: string) {
    return db.friendships.some(
      (f) => (f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a),
    );
  }

  async myProfile(uid: string) {
    return load().profiles.find((p) => p.id === uid) ?? null;
  }
  async saveProfile(uid: string, username: string, displayName: string | null) {
    const db = load();
    if (db.profiles.some((p) => p.username === username && p.id !== uid))
      throw new FriendsError("Questo nome utente è già preso: scegline un altro.", "taken");
    const p: Profile = { id: uid, username, display_name: displayName, last_seen: now() };
    db.profiles = [...db.profiles.filter((x) => x.id !== uid), p];
    save(db);
    return p;
  }
  async touch(uid: string) {
    const db = load();
    const p = db.profiles.find((x) => x.id === uid);
    if (p) p.last_seen = now();
    save(db);
  }
  async search(q: string) {
    const db = load();
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return db.profiles.filter(
      (p) =>
        p.id !== this.me &&
        (p.username.startsWith(t) || db.users.find((u) => u.id === p.id)?.email === t),
    );
  }
  async friendships() {
    return load().friendships.filter((f) => f.requester === this.me || f.addressee === this.me);
  }
  async profiles(ids: string[]) {
    const db = load();
    return db.profiles.filter(
      (p) => ids.includes(p.id) && (p.id === this.me || this.connected(db, this.me, p.id)),
    );
  }
  async request(uid: string, other: string) {
    const db = load();
    if (this.connected(db, uid, other)) throw new FriendsError("C'è già una richiesta tra voi due.");
    db.friendships.push({
      id: db.seq++,
      requester: uid,
      addressee: other,
      status: "pending",
      created_at: now(),
      accepted_at: null,
    });
    save(db);
  }
  async accept(id: number) {
    const db = load();
    const f = db.friendships.find((x) => x.id === id && x.addressee === this.me);
    if (f) {
      f.status = "accepted";
      f.accepted_at = now();
    }
    save(db);
  }
  async remove(id: number) {
    const db = load();
    db.friendships = db.friendships.filter(
      (f) => !(f.id === id && (f.requester === this.me || f.addressee === this.me)),
    );
    save(db);
  }
  async conversation(uid: string, other: string) {
    return load().messages.filter(
      (m) => (m.sender === uid && m.receiver === other) || (m.sender === other && m.receiver === uid),
    );
  }
  async send(uid: string, other: string, body: string) {
    const db = load();
    const ok = db.friendships.some(
      (f) =>
        f.status === "accepted" &&
        ((f.requester === uid && f.addressee === other) || (f.requester === other && f.addressee === uid)),
    );
    if (!ok) throw new FriendsError("Operazione non permessa (potete scrivervi solo da amici).");
    const m: Message = { id: db.seq++, sender: uid, receiver: other, body, created_at: now(), read_at: null };
    db.messages.push(m);
    save(db);
    return m;
  }
  async markRead(uid: string, other: string) {
    const db = load();
    for (const m of db.messages)
      if (m.receiver === uid && m.sender === other && !m.read_at) m.read_at = now();
    save(db);
  }
  async unread(uid: string) {
    const out: Record<string, number> = {};
    for (const m of load().messages)
      if (m.receiver === uid && !m.read_at) out[m.sender] = (out[m.sender] ?? 0) + 1;
    return out;
  }
  live(uid: string, h: LiveHandlers) {
    let prev = load();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const next = load();
      const old = new Map(prev.messages.map((m) => [m.id, m]));
      for (const m of next.messages) {
        if (m.sender !== uid && m.receiver !== uid) continue;
        const o = old.get(m.id);
        if (!o) h.onMessage(m);
        if ((o?.read_at ?? null) !== m.read_at && m.sender === uid) h.onMessageUpdate(m);
      }
      if (JSON.stringify(prev.friendships) !== JSON.stringify(next.friendships)) h.onFriendships();
      prev = next;
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }
  presence(uid: string, onChange: (online: Set<string>) => void) {
    const tick = () => {
      if (document.visibilityState === "visible") localStorage.setItem(ONLINE + uid, String(Date.now()));
      const on = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith(ONLINE) && Date.now() - Number(localStorage.getItem(k)) < 3000)
          on.add(k.slice(ONLINE.length));
      }
      onChange(on);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(t);
      localStorage.removeItem(ONLINE + uid);
    };
  }
}
