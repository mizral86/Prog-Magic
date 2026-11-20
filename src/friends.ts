// Amici, stato online e chat: tipi e collegamento a Supabase.
//
// Tabelle e regole di sicurezza in supabase/friends.sql. Lo stato online usa
// la "presence" di Supabase Realtime (canale "online"): ogni app aperta e in
// primo piano si annuncia con l'id del proprio account. Nuovi messaggi e
// richieste arrivano subito grazie a Realtime (postgres_changes).

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./cloud";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  last_seen?: string | null;
  /** Immagine profilo: art crop di un planeswalker su cards.scryfall.io. */
  avatar?: string | null;
}

export interface Friendship {
  id: number;
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  created_at: string;
  accepted_at: string | null;
}

export interface Message {
  id: number;
  sender: string;
  receiver: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface LiveHandlers {
  /** Messaggio nuovo ricevuto (o inviato da un altro dispositivo). */
  onMessage: (m: Message) => void;
  /** Un messaggio è cambiato (es. letto dall'amico). */
  onMessageUpdate: (m: Message) => void;
  /** Qualcosa è cambiato nelle richieste o nelle amicizie. */
  onFriendships: () => void;
}

/** Tutto ciò che la sezione Amici chiede al server. */
export interface FriendsBackend {
  myProfile(uid: string): Promise<Profile | null>;
  saveProfile(uid: string, username: string, displayName: string | null): Promise<Profile>;
  /** Imposta (o toglie, con null) l'immagine profilo. */
  saveAvatar(uid: string, avatar: string | null): Promise<Profile>;
  touch(uid: string): Promise<void>;
  search(q: string): Promise<Profile[]>;
  friendships(): Promise<Friendship[]>;
  profiles(ids: string[]): Promise<Profile[]>;
  request(uid: string, other: string): Promise<void>;
  accept(id: number): Promise<void>;
  remove(id: number): Promise<void>;
  conversation(uid: string, other: string): Promise<Message[]>;
  send(uid: string, other: string, body: string): Promise<Message>;
  markRead(uid: string, other: string): Promise<void>;
  unread(uid: string): Promise<Record<string, number>>;
  live(uid: string, h: LiveHandlers): () => void;
  /** Annuncia "sono online" e segnala chi è online. */
  presence(uid: string, onChange: (online: Set<string>) => void): () => void;
  /** Blocca: niente più messaggi, richieste né ricerca; toglie l'amicizia. */
  block(other: string): Promise<void>;
  unblock(other: string): Promise<void>;
  /** Profili che hai bloccato (vuoto se la funzione non è attiva sul server). */
  blocked(): Promise<Profile[]>;
  /** Segnala un utente (con copia degli ultimi messaggi tra voi). */
  report(other: string, reason: ReportReason, details: string, alsoBlock: boolean): Promise<void>;
}

export type ReportReason = "spam" | "molestie" | "inappropriato" | "truffa" | "altro";

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "molestie", label: "Offese, minacce o molestie" },
  { id: "inappropriato", label: "Contenuti inappropriati" },
  { id: "spam", label: "Spam o pubblicità" },
  { id: "truffa", label: "Truffa o richiesta di soldi" },
  { id: "altro", label: "Altro" },
];

export class FriendsError extends Error {
  constructor(
    message: string,
    public kind: "setup" | "taken" | "other" = "other",
  ) {
    super(message);
  }
}

interface PgError {
  code?: string;
  message?: string;
}

function fail(e: PgError | null): never {
  const msg = e?.message ?? "Errore sconosciuto";
  const m = msg.toLowerCase();
  if (/block_user|report_user|public\.blocks|"blocks"/.test(m) && /could not find|does not exist|schema cache/.test(m))
    throw new FriendsError(
      "Blocchi e segnalazioni non sono ancora attivi sul server: va eseguito una volta il file supabase/account.sql su Supabase.",
    );
  if (m.includes("troppe segnalazioni")) throw new FriendsError("Troppe segnalazioni oggi: riprova domani.");
  // Limiti di supabase/limits.sql: il messaggio è già in italiano.
  if (e?.code === "P0001") throw new FriendsError(msg);
  if (e?.code === "23514" && m.includes("display_name"))
    throw new FriendsError("Il nome da mostrare può avere al massimo 40 caratteri.");
  if (m.includes("avatar") && (e?.code === "PGRST204" || e?.code === "42703" || m.includes("column")))
    throw new FriendsError(
      "Le immagini profilo non sono ancora attive sul server: va eseguito una volta il file supabase/avatar.sql su Supabase.",
      "setup",
    );
  if (e?.code === "23514" && m.includes("avatar"))
    throw new FriendsError("Immagine non valida: scegline una dalla galleria.");
  if (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    e?.code === "PGRST202" ||
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("could not find the function")
  )
    throw new FriendsError("La sezione Amici non è ancora configurata sul server.", "setup");
  if (e?.code === "23505" && m.includes("username"))
    throw new FriendsError("Questo nome utente è già preso: scegline un altro.", "taken");
  if (e?.code === "23505") throw new FriendsError("C'è già una richiesta tra voi due.");
  if (e?.code === "23514" && m.includes("username"))
    throw new FriendsError("Nome utente non valido: 3-20 tra lettere minuscole, numeri, _ e punto.");
  if (m.includes("row-level security") && m.includes("messages"))
    throw new FriendsError("Operazione non permessa: potete scrivervi solo da amici.");
  if (e?.code === "42501" || m.includes("row-level security") || m.includes("permission denied"))
    throw new FriendsError(`Operazione non permessa dal server (${msg}).`);
  if (m.includes("failed to fetch") || m.includes("network"))
    throw new FriendsError("Connessione assente: riprova.");
  throw new FriendsError(msg);
}

/** Trasforma un nome qualsiasi in un nome utente valido (suggerimento). */
export function suggestUsername(from: string): string {
  const base = from
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : (base + "mago").slice(0, 20);
}

export function validUsername(u: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(u);
}

/**
 * Vero se l'avatar è ammesso: un simbolo dell'app ("sym:W", "sym:WU",
 * "sym:WUB", "sym:C") o un'immagine di Scryfall (illustrazione di planeswalker).
 */
export function validAvatar(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("sym:")) return /^sym:[WUBRGC]{1,3}$/.test(url);
  return /^https:\/\/cards\.scryfall\.io\/[^"'()\s]+$/.test(url) && url.length <= 300;
}

/** Indirizzo dell'immagine da mostrare per un avatar valido. */
export function avatarImageUrl(avatar: string): string {
  return avatar.startsWith("sym:") ? symbolAvatarUrl(avatar) : avatar;
}

/** "sym:WU" → immagine del simbolo in public/mana/ (disco pastello). */
export function symbolAvatarUrl(avatar: string): string {
  return `${import.meta.env.BASE_URL}mana/${avatar.slice(4)}.webp`;
}

/** Nome da mostrare: quello scelto, altrimenti il nome utente. */
export function shownName(p: Profile | undefined | null): string {
  if (!p) return "Utente";
  return p.display_name?.trim() || p.username;
}

class SupabaseFriends implements FriendsBackend {
  constructor(private sb: SupabaseClient) {}

  async myProfile(uid: string) {
    const { data, error } = await this.sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) fail(error);
    return (data as Profile | null) ?? null;
  }

  async saveProfile(uid: string, username: string, displayName: string | null) {
    // Niente upsert: aggiornerebbe anche la colonna id, che le regole non
    // permettono di modificare. Prima volta insert, poi update.
    const row = { username, display_name: displayName || null };
    const existing = await this.myProfile(uid);
    const { data, error } = existing
      ? await this.sb.from("profiles").update(row).eq("id", uid).select("*").single()
      : await this.sb
          .from("profiles")
          .insert({ id: uid, ...row })
          .select("*")
          .single();
    if (error) fail(error);
    return data as Profile;
  }

  async saveAvatar(uid: string, avatar: string | null) {
    const { data, error } = await this.sb
      .from("profiles")
      .update({ avatar })
      .eq("id", uid)
      .select("*")
      .single();
    if (error) fail(error);
    return data as Profile;
  }

  async touch(uid: string) {
    await this.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", uid);
  }

  async search(q: string) {
    const { data, error } = await this.sb.rpc("search_profiles", { q });
    if (error) fail(error);
    return (data ?? []) as Profile[];
  }

  async friendships() {
    const { data, error } = await this.sb.from("friendships").select("*").order("created_at");
    if (error) fail(error);
    return (data ?? []) as Friendship[];
  }

  async profiles(ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.sb.from("profiles").select("*").in("id", ids);
    if (error) fail(error);
    return (data ?? []) as Profile[];
  }

  async request(uid: string, other: string) {
    const { error } = await this.sb.from("friendships").insert({ requester: uid, addressee: other });
    if (error) fail(error);
  }

  async accept(id: number) {
    const { error } = await this.sb
      .from("friendships")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) fail(error);
  }

  async remove(id: number) {
    const { error } = await this.sb.from("friendships").delete().eq("id", id);
    if (error) fail(error);
  }

  async conversation(uid: string, other: string) {
    const { data, error } = await this.sb
      .from("messages")
      .select("*")
      .or(`and(sender.eq.${uid},receiver.eq.${other}),and(sender.eq.${other},receiver.eq.${uid})`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) fail(error);
    return ((data ?? []) as Message[]).reverse();
  }

  async send(uid: string, other: string, body: string) {
    const { data, error } = await this.sb
      .from("messages")
      .insert({ sender: uid, receiver: other, body })
      .select("*")
      .single();
    if (error) fail(error);
    return data as Message;
  }

  async markRead(uid: string, other: string) {
    const { error } = await this.sb
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("receiver", uid)
      .eq("sender", other)
      .is("read_at", null);
    if (error) fail(error);
  }

  async unread(uid: string) {
    const { data, error } = await this.sb
      .from("messages")
      .select("sender")
      .eq("receiver", uid)
      .is("read_at", null)
      .limit(1000);
    if (error) fail(error);
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { sender: string }[]) out[r.sender] = (out[r.sender] ?? 0) + 1;
    return out;
  }

  live(uid: string, h: LiveHandlers) {
    const ch: RealtimeChannel = this.sb
      .channel(`amici-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver=eq.${uid}` },
        (p) => h.onMessage(p.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender=eq.${uid}` },
        (p) => h.onMessage(p.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `sender=eq.${uid}` },
        (p) => h.onMessageUpdate(p.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `addressee=eq.${uid}` },
        () => h.onFriendships(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `requester=eq.${uid}` },
        () => h.onFriendships(),
      )
      // Le cancellazioni non si possono filtrare: arriva solo l'id, quindi si ricarica.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "friendships" }, () =>
        h.onFriendships(),
      )
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }

  presence(uid: string, onChange: (online: Set<string>) => void) {
    const ch = this.sb.channel("online", { config: { presence: { key: uid } } });
    let joined = false;
    const announce = () => {
      if (!joined) return;
      if (document.visibilityState === "visible") void ch.track({ at: new Date().toISOString() });
      else void ch.untrack();
    };
    ch.on("presence", { event: "sync" }, () => onChange(new Set(Object.keys(ch.presenceState()))));
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        joined = true;
        announce();
      }
    });
    document.addEventListener("visibilitychange", announce);
    return () => {
      document.removeEventListener("visibilitychange", announce);
      void this.sb.removeChannel(ch);
    };
  }

  async block(other: string) {
    const { error } = await this.sb.rpc("block_user", { other });
    if (error) fail(error);
  }

  async unblock(other: string) {
    // Le regole RLS cancellano solo i blocchi messi da chi chiama.
    const { error } = await this.sb.from("blocks").delete().eq("blocked", other);
    if (error) fail(error);
  }

  async blocked() {
    const { data, error } = await this.sb.from("blocks").select("blocked").order("created_at");
    if (error) return []; // account.sql non ancora eseguito
    const ids = ((data ?? []) as { blocked: string }[]).map((r) => r.blocked);
    if (ids.length === 0) return [];
    const ps = await this.profiles(ids);
    return ids.map((id) => ps.find((p) => p.id === id) ?? { id, username: "utente", display_name: null });
  }

  async report(other: string, reason: ReportReason, details: string, alsoBlock: boolean) {
    const { error } = await this.sb.rpc("report_user", {
      other,
      why: reason,
      note: details.trim().slice(0, 1000) || null,
      also_block: alsoBlock,
    });
    if (error) fail(error);
  }
}

let backend: FriendsBackend | null = null;

/** Il collegamento al server, o null se Supabase non è configurato. */
export function friendsBackend(): FriendsBackend | null {
  if (backend) return backend;
  const sb = supabase();
  if (!sb) return null;
  backend = new SupabaseFriends(sb);
  return backend;
}

/** Solo per le prove in sviluppo: sostituisce il server. */
export function setFriendsBackend(b: FriendsBackend) {
  backend = b;
}
