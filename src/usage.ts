// Statistiche di utilizzo (vedi supabase/usage.sql).
//
// Mentre l'app è in primo piano conta i secondi di uso, divisi per sezione,
// e ogni minuto li manda a Supabase. Il dispositivo è riconosciuto da un
// codice casuale salvato in localStorage (prefisso "mm." così non viene
// sincronizzato sul profilo). Chi non vuole può spegnerle in Account.
// Se Supabase non è configurato o il file SQL non è stato eseguito, non
// succede nulla.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./cloud";

const DEVICE_KEY = "mm.device.v1";
const OFF_KEY = "mm.usage.off";
const PING_EVERY = 60_000;
const FIRST_PING = 10_000;
/** Dopo mezz'ora in secondo piano, al ritorno comincia una sessione nuova. */
const NEW_SESSION_AFTER = 30 * 60_000;

const SECTIONS = ["cerca", "collezione", "mazzi", "simula", "gioca", "scansiona", "amici", "gruppi", "account"];

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16 >> (Number(c) / 4))).toString(16),
  );
}

function deviceId(): string {
  const ls = store();
  let id = ls?.getItem(DEVICE_KEY) ?? null;
  if (!id) {
    id = uuid();
    try {
      ls?.setItem(DEVICE_KEY, id);
    } catch {
      /* memoria piena o bloccata: codice valido solo per questa apertura */
    }
  }
  return id;
}

export function usageEnabled(): boolean {
  return store()?.getItem(OFF_KEY) !== "1";
}

export function setUsageEnabled(on: boolean) {
  try {
    if (on) store()?.removeItem(OFF_KEY);
    else store()?.setItem(OFF_KEY, "1");
  } catch {
    /* ignora */
  }
  if (on) startUsageTracking();
  else stopUsageTracking();
}

function platform(): "android" | "ios" | "computer" {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "computer";
}

function installed(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function sectionOf(path: string): string | null {
  const seg = path.replace(/^\/+/, "").split("/")[0];
  return SECTIONS.includes(seg) ? seg : null;
}

// ---------------------------------------------------------------------------
// Stato della sessione in corso

interface Session {
  id: string;
  ms: number; // millisecondi in primo piano già contati
  bySection: Record<string, number>;
}

let session: Session | null = null;
let section: string | null = null;
let visibleSince: number | null = null; // da quando l'app è in primo piano
let hiddenAt: number | null = null;
let timer: number | null = null;
let running = false;
let failures = 0;

function newSession() {
  session = { id: uuid(), ms: 0, bySection: {} };
}

/** Aggiunge al conteggio il tempo passato in primo piano fino ad adesso. */
function flushTime() {
  if (!session || visibleSince === null) return;
  const now = Date.now();
  const delta = Math.max(0, Math.min(now - visibleSince, 5 * 60_000));
  session.ms += delta;
  if (section) session.bySection[section] = (session.bySection[section] ?? 0) + delta;
  visibleSince = now;
}

async function ping() {
  const sb = supabase();
  if (!sb || !session || !running) return;
  flushTime();
  const secs = Math.round(session.ms / 1000);
  if (secs < 5) return; // aperture di pochi secondi non contano
  const bySection: Record<string, number> = {};
  for (const [k, v] of Object.entries(session.bySection)) bySection[k] = Math.round(v / 1000);
  try {
    const { error } = await sb.rpc("usage_ping", {
      sid: session.id,
      device: deviceId(),
      secs,
      secs_by_section: bySection,
      is_installed: installed(),
      plat: platform(),
    });
    if (error) throw error;
    failures = 0;
  } catch {
    // Funzione mancante (SQL non eseguito) o rete assente: dopo 3 errori di
    // fila smette fino alla prossima apertura.
    if (++failures >= 3) stopUsageTracking();
  }
}

function schedule(delay: number) {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void ping().finally(() => {
      if (running && document.visibilityState === "visible") schedule(PING_EVERY);
    });
  }, delay);
}

function onVisibility() {
  if (!running) return;
  if (document.visibilityState === "visible") {
    if (hiddenAt !== null && Date.now() - hiddenAt > NEW_SESSION_AFTER) newSession();
    hiddenAt = null;
    visibleSince = Date.now();
    schedule(session && session.ms > 0 ? PING_EVERY : FIRST_PING);
  } else {
    flushTime();
    visibleSince = null;
    hiddenAt = Date.now();
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    void ping();
  }
}

export function startUsageTracking() {
  if (running || !supabase() || !usageEnabled()) return;
  running = true;
  failures = 0;
  newSession();
  document.addEventListener("visibilitychange", onVisibility);
  if (document.visibilityState === "visible") {
    visibleSince = Date.now();
    schedule(FIRST_PING);
  } else {
    hiddenAt = Date.now();
  }
}

export function stopUsageTracking() {
  running = false;
  document.removeEventListener("visibilitychange", onVisibility);
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  visibleSince = null;
  session = null;
}

/** Da chiamare a ogni cambio di pagina. */
export function trackSection(path: string) {
  flushTime();
  section = sectionOf(path);
}

// ---------------------------------------------------------------------------
// Pannello dei moderatori

export interface UsageStats {
  summary: {
    devices: number;
    accounts: number;
    sessions: number;
    seconds: number;
    installed_devices: number;
    new_devices: number;
    active_now: number;
  };
  days: { day: string; devices: number; sessions: number; seconds: number }[];
  sections: Record<string, number>;
  platforms: Record<string, number>;
  users: {
    username: string | null;
    display_name: string | null;
    sessions: number;
    seconds: number;
    devices: number;
    last_seen: string;
    top_sections: string[] | null;
  }[];
  guests: { devices: number; sessions: number; seconds: number };
}

export async function loadUsageStats(days: number): Promise<UsageStats> {
  const sb = supabase();
  if (!sb) throw new Error("Supabase non configurato");
  const { data, error } = await sb.rpc("admin_usage_stats", { days });
  if (error) {
    if (/admin_usage_stats|function/i.test(error.message))
      throw new Error("Manca lo script supabase/usage.sql: eseguilo nell'SQL Editor di Supabase.");
    throw new Error(error.message);
  }
  return data as UsageStats;
}

export function useUsageStats(days: number, enabled: boolean) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return;
    setError(null);
    loadUsageStats(days)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [days, enabled]);
  useEffect(reload, [reload]);
  return { stats, error, reload };
}

export interface RegisteredUser {
  email: string | null;
  username: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in: string | null;
  last_active: string | null;
  confirmed: boolean;
  sessions: number;
  seconds: number;
  top_sections: string[] | null;
}

export async function loadRegisteredUsers(): Promise<RegisteredUser[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_registered_users");
  if (error) {
    if (/admin_registered_users|function/i.test(error.message))
      throw new Error("Per vedere gli iscritti riesegui supabase/usage.sql nell'SQL Editor di Supabase.");
    throw new Error(error.message);
  }
  return (data ?? []) as RegisteredUser[];
}
