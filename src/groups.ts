// Gruppi di amici: membri, partite registrate dal segnapunti e tornei.
// Tabelle e regole di sicurezza in supabase/groups.sql (da eseguire dopo
// friends.sql). In sviluppo, con ?finto=nome, si usa src/dev/fakeGroups.ts.

import { useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./cloud";
import { FriendsError, Profile } from "./friends";
import { useFriends } from "./friendsContext";
import type { TData, TKind, Tournament, TStatus } from "./tournament";

export interface Group {
  id: string;
  name: string;
  owner: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  added_by: string | null;
  joined_at: string;
  profile: Profile | null;
}

export interface GamePlayer {
  /** Account del giocatore, null per un ospite senza profilo. */
  uid: string | null;
  name: string;
  /** Vita a fine partita (se registrata dal segnapunti). */
  life: number | null;
  winner: boolean;
  /** Come ha perso (es. "Vita a zero"). */
  out: string | null;
}

export interface GroupGame {
  id: string;
  group_id: string;
  created_by: string | null;
  played_at: string;
  players: GamePlayer[];
  start_life: number | null;
  commander: boolean;
  duration_min: number | null;
  note: string | null;
  tournament_id: string | null;
  created_at: string;
}

export type NewGame = Omit<GroupGame, "id" | "created_by" | "created_at">;

export interface GroupsBackend {
  myGroups(uid: string): Promise<Group[]>;
  createGroup(name: string): Promise<string>;
  renameGroup(id: string, name: string): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  members(groupId: string): Promise<GroupMember[]>;
  addMember(groupId: string, me: string, friend: string): Promise<void>;
  removeMember(groupId: string, user: string): Promise<void>;
  games(groupId: string): Promise<GroupGame[]>;
  addGame(uid: string, g: NewGame): Promise<GroupGame>;
  deleteGame(id: string): Promise<void>;
  tournaments(groupId: string): Promise<Tournament[]>;
  tournament(id: string): Promise<Tournament | null>;
  createTournament(uid: string, groupId: string, name: string, kind: TKind, data: TData): Promise<Tournament>;
  /** Salva solo se nessun altro l'ha cambiato nel frattempo; altrimenti null. */
  saveTournament(
    t: Tournament,
    patch: { name?: string; status?: TStatus; data?: TData },
  ): Promise<Tournament | null>;
  deleteTournament(id: string): Promise<void>;
  /** Avvisa quando cambia qualcosa nel gruppo (partite, tornei, membri). */
  live(groupId: string, onChange: () => void): () => void;
}

interface PgError {
  code?: string;
  message?: string;
}

function fail(e: PgError | null): never {
  const msg = e?.message ?? "Errore sconosciuto";
  const m = msg.toLowerCase();
  if (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    e?.code === "PGRST202" ||
    e?.code === "PGRST200" ||
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("could not find the function")
  )
    throw new FriendsError("La sezione Gruppi non è ancora configurata sul server.", "setup");
  if (e?.code === "23505") throw new FriendsError("È già nel gruppo.");
  if (m.includes("row-level security") && m.includes("group_members"))
    throw new FriendsError("Puoi aggiungere al gruppo solo i tuoi amici.");
  if (e?.code === "42501" || m.includes("row-level security") || m.includes("permission denied"))
    throw new FriendsError(`Operazione non permessa dal server (${msg}).`);
  if (m.includes("failed to fetch") || m.includes("network"))
    throw new FriendsError("Connessione assente: riprova.");
  throw new FriendsError(msg);
}

class SupabaseGroups implements GroupsBackend {
  constructor(private sb: SupabaseClient) {}

  async myGroups() {
    // Le regole RLS mostrano solo i gruppi di cui si fa parte.
    const { data, error } = await this.sb.from("play_groups").select("*").order("created_at");
    if (error) fail(error);
    return (data ?? []) as Group[];
  }

  async createGroup(name: string) {
    const { data, error } = await this.sb.rpc("create_play_group", { group_name: name });
    if (error) fail(error);
    return data as string;
  }

  async renameGroup(id: string, name: string) {
    const { error } = await this.sb.from("play_groups").update({ name }).eq("id", id);
    if (error) fail(error);
  }

  async deleteGroup(id: string) {
    const { error } = await this.sb.from("play_groups").delete().eq("id", id);
    if (error) fail(error);
  }

  async members(groupId: string) {
    const { data, error } = await this.sb
      .from("group_members")
      .select("*, profile:profiles!group_members_user_id_fkey(id, username, display_name, last_seen)")
      .eq("group_id", groupId)
      .order("joined_at");
    if (error) fail(error);
    return (data ?? []) as GroupMember[];
  }

  async addMember(groupId: string, me: string, friend: string) {
    const { error } = await this.sb
      .from("group_members")
      .insert({ group_id: groupId, user_id: friend, added_by: me });
    if (error) fail(error);
  }

  async removeMember(groupId: string, user: string) {
    const { error } = await this.sb.from("group_members").delete().eq("group_id", groupId).eq("user_id", user);
    if (error) fail(error);
  }

  async games(groupId: string) {
    const { data, error } = await this.sb
      .from("group_games")
      .select("*")
      .eq("group_id", groupId)
      .order("played_at", { ascending: false })
      .limit(500);
    if (error) fail(error);
    return (data ?? []) as GroupGame[];
  }

  async addGame(uid: string, g: NewGame) {
    const { data, error } = await this.sb
      .from("group_games")
      .insert({ ...g, created_by: uid })
      .select("*")
      .single();
    if (error) fail(error);
    return data as GroupGame;
  }

  async deleteGame(id: string) {
    const { error } = await this.sb.from("group_games").delete().eq("id", id);
    if (error) fail(error);
  }

  async tournaments(groupId: string) {
    const { data, error } = await this.sb
      .from("tournaments")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (error) fail(error);
    return (data ?? []) as Tournament[];
  }

  async tournament(id: string) {
    const { data, error } = await this.sb.from("tournaments").select("*").eq("id", id).maybeSingle();
    if (error) fail(error);
    return (data as Tournament | null) ?? null;
  }

  async createTournament(uid: string, groupId: string, name: string, kind: TKind, data: TData) {
    const { data: row, error } = await this.sb
      .from("tournaments")
      .insert({ group_id: groupId, name, kind, data, status: "running", created_by: uid })
      .select("*")
      .single();
    if (error) fail(error);
    return row as Tournament;
  }

  async saveTournament(t: Tournament, patch: { name?: string; status?: TStatus; data?: TData }) {
    const { data, error } = await this.sb
      .from("tournaments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("updated_at", t.updated_at)
      .select("*");
    if (error) fail(error);
    const rows = (data ?? []) as Tournament[];
    return rows[0] ?? null;
  }

  async deleteTournament(id: string) {
    const { error } = await this.sb.from("tournaments").delete().eq("id", id);
    if (error) fail(error);
  }

  live(groupId: string, onChange: () => void) {
    const f = `group_id=eq.${groupId}`;
    const ch: RealtimeChannel = this.sb
      .channel(`gruppo-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_games", filter: f }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: f }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: f }, onChange)
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}

let real: GroupsBackend | null = null;
let fake: { name: string; b: GroupsBackend } | null = null;

/**
 * Il collegamento al server dei gruppi, pronto quando la sezione Amici è
 * pronta (serve il profilo). null finché non lo è.
 */
export function useGroupsBackend(): GroupsBackend | null {
  const fr = useFriends();
  const [dev, setDev] = useState<GroupsBackend | null>(fake?.b ?? null);
  useEffect(() => {
    if (!import.meta.env.DEV || !fr.devMode || !fr.uid) return;
    const uid = fr.uid;
    if (fake?.name === uid) return setDev(fake.b);
    void import("./dev/fakeGroups").then((m) => {
      fake = { name: uid, b: new m.FakeGroups(uid) };
      setDev(fake.b);
    });
  }, [fr.devMode, fr.uid]);
  if (fr.status !== "ready") return null;
  if (fr.devMode) return dev;
  if (!real) {
    const sb = supabase();
    if (!sb) return null;
    real = new SupabaseGroups(sb);
  }
  return real;
}

/** Nome da mostrare per un membro. */
export function memberName(m: GroupMember | undefined): string {
  if (!m?.profile) return "Amico";
  return m.profile.display_name?.trim() || m.profile.username;
}

// ---------------------------------------------------------------------------
// Statistiche del gruppo

export interface GroupStat {
  key: string;
  uid: string | null;
  name: string;
  games: number;
  wins: number;
  /** Partite con più di due giocatori (multiplayer). */
  multi: number;
  lastPlayed: string | null;
}

/** Vittorie e partite per giocatore (account o, per gli ospiti, nome). */
export function groupStats(games: GroupGame[], members: GroupMember[]): GroupStat[] {
  const out = new Map<string, GroupStat>();
  for (const m of members)
    out.set(m.user_id, { key: m.user_id, uid: m.user_id, name: memberName(m), games: 0, wins: 0, multi: 0, lastPlayed: null });
  for (const g of games)
    for (const p of g.players) {
      const key = p.uid ?? `ospite:${p.name.trim().toLowerCase()}`;
      let s = out.get(key);
      if (!s) {
        s = { key, uid: p.uid, name: p.name, games: 0, wins: 0, multi: 0, lastPlayed: null };
        out.set(key, s);
      }
      s.games++;
      if (p.winner) s.wins++;
      if (g.players.length > 2) s.multi++;
      if (!s.lastPlayed || g.played_at > s.lastPlayed) s.lastPlayed = g.played_at;
    }
  return [...out.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games) ||
      b.games - a.games ||
      a.name.localeCompare(b.name),
  );
}

/** Testa a testa tra due giocatori (solo partite in cui c'erano entrambi). */
export function headToHead(games: GroupGame[], a: string, b: string): { a: number; b: number; total: number } {
  let wa = 0;
  let wb = 0;
  let total = 0;
  const k = (p: GamePlayer) => p.uid ?? `ospite:${p.name.trim().toLowerCase()}`;
  for (const g of games) {
    const pa = g.players.find((p) => k(p) === a);
    const pb = g.players.find((p) => k(p) === b);
    if (!pa || !pb) continue;
    total++;
    if (pa.winner) wa++;
    if (pb.winner) wb++;
  }
  return { a: wa, b: wb, total };
}

/**
 * Cambia un torneo rileggendolo e riprovando se un altro membro l'ha
 * modificato nello stesso momento (così nessun risultato va perso).
 */
export async function updateTournament(
  b: GroupsBackend,
  t: Tournament,
  change: (t: Tournament) => { name?: string; status?: TStatus; data?: TData },
): Promise<Tournament> {
  let cur: Tournament | null = t;
  for (let i = 0; i < 4 && cur; i++) {
    const saved = await b.saveTournament(cur, change(cur));
    if (saved) return saved;
    cur = await b.tournament(t.id);
  }
  throw new FriendsError("Il torneo è stato cambiato da un altro membro: riprova.");
}
