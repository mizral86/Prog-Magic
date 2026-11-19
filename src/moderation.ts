// Pannello segnalazioni per i moderatori (vedi supabase/moderation.sql).
// Per chi non è moderatore, o se il file SQL non è stato eseguito, tutto
// resta spento senza errori.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./cloud";

export interface AdminReport {
  id: number;
  reporter: string | null;
  reporter_username: string | null;
  reported: string | null;
  reported_username: string | null;
  reported_exists: boolean;
  reason: string;
  details: string | null;
  messages: { from: "reporter" | "reported"; body: string; at: string }[];
  status: "aperta" | "chiusa";
  created_at: string;
}

let adminCache: { uid: string; p: Promise<boolean> } | null = null;

/** Vero se l'account è un moderatore (una sola domanda al server per sessione). */
export function isAdmin(uid: string): Promise<boolean> {
  if (adminCache?.uid === uid) return adminCache.p;
  const sb = supabase();
  const p = sb
    ? Promise.resolve(sb.rpc("is_app_admin")).then(
        ({ data, error }) => !error && data === true,
        () => false,
      )
    : Promise.resolve(false);
  adminCache = { uid, p };
  return p;
}

export async function loadReports(onlyOpen: boolean): Promise<AdminReport[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_reports", { only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminReport[];
}

export async function setReportStatus(id: number, status: "aperta" | "chiusa") {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.rpc("admin_set_report", { rid: id, new_status: status });
  if (error) throw new Error(error.message);
  notify();
}

export async function deleteReportedUser(uid: string) {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.rpc("admin_delete_user", { target: uid });
  if (error) throw new Error(error.message);
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

/** Numero di segnalazioni aperte, o null se non sei moderatore. */
export function useOpenReports(uid: string | null): { count: number | null; reload: () => void } {
  const [count, setCount] = useState<number | null>(null);
  const reload = useCallback(() => {
    if (!uid) {
      setCount(null);
      return;
    }
    void isAdmin(uid).then(async (ok) => {
      if (!ok) return setCount(null);
      try {
        setCount((await loadReports(true)).length);
      } catch {
        setCount(null);
      }
    });
  }, [uid]);
  useEffect(() => {
    reload();
    listeners.add(reload);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);
  return { count, reload };
}
