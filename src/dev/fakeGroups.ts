// SOLO SVILUPPO: finto server dei gruppi (vedi fakeFriends.ts). Si attiva
// con ?finto=nome insieme agli amici finti. Dati nel localStorage, condivisi
// tra le schede: due schede con utenti diversi vedono lo stesso gruppo.

import type { Friendship, Profile } from "../friends";
import { FriendsError } from "../friends";
import type { Group, GroupGame, GroupMember, GroupsBackend, NewGame } from "../groups";
import type { TData, TKind, Tournament, TStatus } from "../tournament";

const KEY = "pmdev.fakegroups";
const FRIENDS_KEY = "pmdev.fake";

interface Db {
  groups: Group[];
  members: Omit<GroupMember, "profile">[];
  games: GroupGame[];
  tournaments: Tournament[];
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* vuoto */
  }
  return { groups: [], members: [], games: [], tournaments: [] };
}
function save(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
function friendsDb(): { profiles: Profile[]; friendships: Friendship[] } {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* vuoto */
  }
  return { profiles: [], friendships: [] };
}
const now = () => new Date().toISOString();
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export class FakeGroups implements GroupsBackend {
  constructor(private me: string) {}

  private member(db: Db, g: string, u = this.me) {
    return db.members.some((m) => m.group_id === g && m.user_id === u);
  }
  private must(db: Db, g: string) {
    if (!this.member(db, g)) throw new FriendsError("Operazione non permessa: non fai parte del gruppo.");
  }

  async myGroups() {
    const db = load();
    return db.groups.filter((g) => this.member(db, g.id));
  }
  async createGroup(name: string) {
    const db = load();
    const id = uuid();
    db.groups.push({ id, name: name.trim(), owner: this.me, created_at: now() });
    db.members.push({ group_id: id, user_id: this.me, added_by: this.me, joined_at: now() });
    save(db);
    return id;
  }
  async renameGroup(id: string, name: string) {
    const db = load();
    const g = db.groups.find((x) => x.id === id && x.owner === this.me);
    if (g) g.name = name.trim();
    save(db);
  }
  async deleteGroup(id: string) {
    const db = load();
    if (!db.groups.some((g) => g.id === id && g.owner === this.me)) return;
    db.groups = db.groups.filter((g) => g.id !== id);
    db.members = db.members.filter((m) => m.group_id !== id);
    db.games = db.games.filter((m) => m.group_id !== id);
    db.tournaments = db.tournaments.filter((m) => m.group_id !== id);
    save(db);
  }
  async members(groupId: string) {
    const db = load();
    this.must(db, groupId);
    const ps = friendsDb().profiles;
    return db.members
      .filter((m) => m.group_id === groupId)
      .map((m) => ({ ...m, profile: ps.find((p) => p.id === m.user_id) ?? null }));
  }
  async addMember(groupId: string, me: string, friend: string) {
    const db = load();
    this.must(db, groupId);
    const ok = friendsDb().friendships.some(
      (f) =>
        f.status === "accepted" &&
        ((f.requester === me && f.addressee === friend) || (f.requester === friend && f.addressee === me)),
    );
    if (!ok) throw new FriendsError("Puoi aggiungere al gruppo solo i tuoi amici.");
    if (this.member(db, groupId, friend)) throw new FriendsError("È già nel gruppo.");
    db.members.push({ group_id: groupId, user_id: friend, added_by: me, joined_at: now() });
    save(db);
  }
  async removeMember(groupId: string, user: string) {
    const db = load();
    const owner = db.groups.find((g) => g.id === groupId)?.owner === this.me;
    if (user !== this.me && !owner) throw new FriendsError("Operazione non permessa.");
    db.members = db.members.filter((m) => !(m.group_id === groupId && m.user_id === user));
    save(db);
  }
  async games(groupId: string) {
    const db = load();
    this.must(db, groupId);
    return db.games
      .filter((g) => g.group_id === groupId)
      .sort((a, b) => b.played_at.localeCompare(a.played_at));
  }
  async addGame(uid: string, g: NewGame) {
    const db = load();
    this.must(db, g.group_id);
    const row: GroupGame = { ...g, id: uuid(), created_by: uid, created_at: now() };
    db.games.push(row);
    save(db);
    return row;
  }
  async deleteGame(id: string) {
    const db = load();
    db.games = db.games.filter((g) => !(g.id === id && (g.created_by === this.me || db.groups.find((x) => x.id === g.group_id)?.owner === this.me)));
    save(db);
  }
  async tournaments(groupId: string) {
    const db = load();
    this.must(db, groupId);
    return db.tournaments
      .filter((t) => t.group_id === groupId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async tournament(id: string) {
    const db = load();
    const t = db.tournaments.find((x) => x.id === id);
    return t && this.member(db, t.group_id) ? t : null;
  }
  async createTournament(uid: string, groupId: string, name: string, kind: TKind, data: TData) {
    const db = load();
    this.must(db, groupId);
    const t: Tournament = {
      id: uuid(),
      group_id: groupId,
      name,
      kind,
      status: "running",
      data,
      created_by: uid,
      created_at: now(),
      updated_at: now(),
    };
    db.tournaments.push(t);
    save(db);
    return t;
  }
  async saveTournament(t: Tournament, patch: { name?: string; status?: TStatus; data?: TData }) {
    const db = load();
    const cur = db.tournaments.find((x) => x.id === t.id);
    if (!cur || cur.updated_at !== t.updated_at) return null;
    Object.assign(cur, patch, { updated_at: now() });
    save(db);
    return cur;
  }
  async deleteTournament(id: string) {
    const db = load();
    db.tournaments = db.tournaments.filter((t) => t.id !== id);
    save(db);
  }
  live(_groupId: string, onChange: () => void) {
    const on = (e: StorageEvent) => {
      if (e.key === KEY) onChange();
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }
}
