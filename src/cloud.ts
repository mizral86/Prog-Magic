// Sincronizzazione dei dati dell'app con il profilo Supabase.
//
// L'app continua a lavorare su localStorage (chiavi "pm.*"). Quando l'utente
// ha fatto l'accesso, tutte le chiavi "pm.*" vengono salvate come un unico
// oggetto JSON nella riga del suo profilo (tabella user_data) e, all'apertura
// dell'app su un altro dispositivo, riscaricate da lì.
//
// Le chiavi di servizio usano il prefisso "pmcloud." così non vengono
// sincronizzate.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./cloudConfig";

const TABLE = "user_data";
const DATA_PREFIX = "pm.";
const OWNER = "pmcloud.owner"; // id dell'utente a cui appartengono i dati locali
const SYNCED_AT = "pmcloud.syncedAt"; // updated_at della riga all'ultimo allineamento
const DIRTY_AT = "pmcloud.dirtyAt"; // modifiche locali non ancora caricate
const PUSH_DELAY = 2000;

/** Chiavi che contengono dati veri (non solo preferenze di vista). */
const CONTENT_KEYS = ["pm.collection.v1", "pm.decks.v1", "pm.binders.v1", "pm.wishlist.v1"];

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/**
 * Dice se l'accesso con Google è attivo nel progetto Supabase, così il
 * pulsante compare solo quando funziona. In caso di dubbio (rete assente) false.
 */
let googleCache: Promise<boolean> | null = null;
export function googleEnabled(): Promise<boolean> {
  if (!cloudConfigured) return Promise.resolve(false);
  googleCache ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => Boolean(j?.external?.google))
    .catch(() => {
      googleCache = null;
      return false;
    });
  return googleCache;
}

// ---------------------------------------------------------------------------
// localStorage

type Snapshot = Record<string, string>;

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function get(key: string): string | null {
  try {
    return ls()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Scrittura "di servizio": non segna i dati come modificati. */
let suppress = 0;
function quiet<T>(fn: () => T): T {
  suppress++;
  try {
    return fn();
  } finally {
    suppress--;
  }
}

function set(key: string, value: string | null) {
  quiet(() => {
    try {
      if (value === null) ls()?.removeItem(key);
      else ls()?.setItem(key, value);
    } catch {
      /* spazio esaurito o storage bloccato */
    }
  });
}

export function snapshot(): Snapshot {
  const out: Snapshot = {};
  const s = ls();
  if (!s) return out;
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(DATA_PREFIX)) out[k] = s.getItem(k) ?? "";
  }
  return out;
}

function clearData() {
  const s = ls();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(DATA_PREFIX)) keys.push(k);
  }
  for (const k of keys) set(k, null);
}

function applySnapshot(data: Snapshot) {
  clearData();
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k.startsWith(DATA_PREFIX) && typeof v === "string") set(k, v);
  }
}

function isEmptyJson(v: string | undefined): boolean {
  if (!v) return true;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.length === 0;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length === 0;
    return !parsed;
  } catch {
    return false;
  }
}

export function hasContent(data: Snapshot): boolean {
  return CONTENT_KEYS.some((k) => !isEmptyJson(data[k]));
}

function sameData(a: Snapshot, b: Snapshot): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b ?? {}).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

export function lastSyncedAt(): string | null {
  return get(SYNCED_AT);
}

// ---------------------------------------------------------------------------
// Server

interface RemoteRow {
  data: Snapshot;
  updated_at: string;
}

async function fetchRemote(uid: string): Promise<RemoteRow | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select("data, updated_at")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RemoteRow | null) ?? null;
}

let pushing: Promise<void> | null = null;

export async function push(uid: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  // Una sola scrittura alla volta: le successive ripartono dallo stato aggiornato.
  while (pushing) await pushing.catch(() => undefined);
  const run = (async () => {
    const startedDirty = get(DIRTY_AT);
    const { data, error } = await sb
      .from(TABLE)
      .upsert({ user_id: uid, data: snapshot(), updated_at: new Date().toISOString() })
      .select("updated_at")
      .single();
    if (error) throw new Error(error.message);
    set(SYNCED_AT, (data as { updated_at: string }).updated_at);
    // Se nel frattempo ci sono state altre modifiche, restano da caricare.
    if (get(DIRTY_AT) === startedDirty) set(DIRTY_AT, null);
  })();
  pushing = run;
  try {
    await run;
  } finally {
    pushing = null;
  }
}

export type ReconcileResult = "uploaded" | "downloaded" | "unchanged";

/**
 * Allinea i dati locali con quelli del profilo. Restituisce "downloaded"
 * quando ha sostituito i dati locali: in quel caso la pagina va ricaricata.
 *
 * `askKeepAccount` viene chiamata solo al primo accesso su un dispositivo
 * che ha già dati suoi, diversi da quelli dell'account: true = usa i dati
 * dell'account, false = carica sull'account quelli del dispositivo.
 */
export async function reconcile(
  uid: string,
  askKeepAccount: () => boolean,
): Promise<ReconcileResult> {
  const remote = await fetchRemote(uid);
  const local = snapshot();
  const owner = get(OWNER);

  if (!remote) {
    set(OWNER, uid);
    await push(uid);
    return "uploaded";
  }

  if (owner === uid) {
    const dirtyAt = get(DIRTY_AT);
    const syncedAt = get(SYNCED_AT);
    if (dirtyAt) {
      // Modifiche locali in sospeso: vince la più recente.
      if (!syncedAt || remote.updated_at === syncedAt || Date.parse(dirtyAt) > Date.parse(remote.updated_at)) {
        await push(uid);
        return "uploaded";
      }
    } else if (remote.updated_at === syncedAt || sameData(local, remote.data)) {
      set(SYNCED_AT, remote.updated_at);
      return "unchanged";
    }
  } else if (hasContent(local) && !sameData(local, remote.data)) {
    if (!askKeepAccount()) {
      set(OWNER, uid);
      await push(uid);
      return "uploaded";
    }
  }

  set(OWNER, uid);
  applySnapshot(remote.data);
  set(SYNCED_AT, remote.updated_at);
  set(DIRTY_AT, null);
  return sameData(local, remote.data) ? "unchanged" : "downloaded";
}

/**
 * Al logout i dati del profilo lasciano il dispositivo. Prima carica le
 * modifiche in sospeso: se non ci riesce lancia un errore e non cancella nulla.
 */
export async function forgetLocal(uid: string | null) {
  if (uid && get(OWNER) === uid && get(DIRTY_AT)) await push(uid);
  clearData();
  set(OWNER, null);
  set(SYNCED_AT, null);
  set(DIRTY_AT, null);
}

// ---------------------------------------------------------------------------
// Osserva le scritture "pm.*" e le carica sul profilo dopo un attimo.

let watcherUid: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let onPushResult: ((err: string | null) => void) | null = null;

export function watchChanges(uid: string | null, onResult?: (err: string | null) => void) {
  watcherUid = uid;
  onPushResult = onResult ?? null;
  installPatch();
  if (uid && get(OWNER) === uid && get(DIRTY_AT)) schedulePush();
}

function schedulePush() {
  clearTimeout(timer);
  timer = setTimeout(flush, PUSH_DELAY);
}

export async function flush() {
  clearTimeout(timer);
  const uid = watcherUid;
  if (!uid || get(OWNER) !== uid || !get(DIRTY_AT)) return;
  try {
    await push(uid);
    onPushResult?.(null);
  } catch (e) {
    onPushResult?.(e instanceof Error ? e.message : String(e));
  }
}

let patched = false;
function installPatch() {
  if (patched || typeof Storage === "undefined") return;
  patched = true;
  const proto = Storage.prototype;
  const origSet = proto.setItem;
  const origRemove = proto.removeItem;
  const touched = (store: Storage, key: string) => {
    if (suppress > 0 || !watcherUid || !key.startsWith(DATA_PREFIX)) return;
    if (store !== ls() || get(OWNER) !== watcherUid) return;
    set(DIRTY_AT, new Date().toISOString());
    schedulePush();
  };
  // Conta solo le scritture che cambiano davvero il valore: all'avvio l'app
  // riscrive gli stessi dati e non deve sembrare una modifica.
  proto.setItem = function (this: Storage, key: string, value: string) {
    const before = this.getItem(key);
    origSet.call(this, key, value);
    if (before !== String(value)) touched(this, key);
  };
  proto.removeItem = function (this: Storage, key: string) {
    const before = this.getItem(key);
    origRemove.call(this, key);
    if (before !== null) touched(this, key);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}
