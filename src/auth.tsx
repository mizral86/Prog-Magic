// Stato dell'accesso (Supabase) e sincronizzazione del profilo.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloudConfigured } from "./cloudConfig";
import { flush, forgetLocal, lastSyncedAt, reconcile, supabase, watchChanges } from "./cloud";

export type AuthStatus = "disabled" | "loading" | "out" | "in";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  syncing: boolean;
  syncError: string | null;
  syncedAt: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<"confirm" | "done">;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const KEEP_ACCOUNT_MSG =
  "Il tuo account ha già dei dati salvati, diversi da quelli di questo dispositivo.\n\n" +
  "OK: usa i dati dell'account (quelli di questo dispositivo vengono sostituiti).\n" +
  "Annulla: carica sull'account i dati di questo dispositivo.";

/** Indirizzo a cui Supabase rimanda dopo conferma email o accesso Google. */
function redirectUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL + "account";
}

function italianError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o password non corrette.";
  if (m.includes("email not confirmed")) return "Devi prima confermare l'email: controlla la posta.";
  if (m.includes("user already registered")) return "Esiste già un account con questa email: accedi.";
  if (m.includes("password should be at least")) return "La password deve avere almeno 6 caratteri.";
  if (m.includes("unable to validate email") || m.includes("invalid format"))
    return "L'indirizzo email non è valido.";
  if (m.includes("rate limit")) return "Troppi tentativi: riprova tra qualche minuto.";
  if (m.includes("provider is not enabled")) return "L'accesso con Google non è ancora attivo.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Connessione assente: riprova.";
  return msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(cloudConfigured ? "loading" : "disabled");
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSyncedAt());
  const uidRef = useRef<string | null>(null);

  const sync = useCallback(async (uid: string) => {
    setSyncing(true);
    try {
      const res = await reconcile(uid, () => window.confirm(KEEP_ACCOUNT_MSG));
      setSyncError(null);
      setSyncedAt(lastSyncedAt());
      // I dati locali sono stati sostituiti: ricarica perché l'app li rilegga.
      if (res === "downloaded") window.location.reload();
    } catch (e) {
      setSyncError(italianError(e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      const prev = uidRef.current;
      uidRef.current = u?.id ?? null;
      setUser(u);
      setStatus(u ? "in" : "out");
      watchChanges(u?.id ?? null, (err) => {
        setSyncError(err ? italianError(err) : null);
        setSyncedAt(lastSyncedAt());
      });
      // Allinea all'avvio e quando cambia utente (non ad ogni rinnovo del token).
      if (u && (event === "INITIAL_SESSION" || (event === "SIGNED_IN" && prev !== u.id))) {
        // Fuori dal callback: Supabase sconsiglia chiamate al client qui dentro.
        setTimeout(() => void sync(u.id), 0);
      }
    });
    // Riaprendo l'app (es. dal telefono dopo aver usato il computer) riprende
    // le modifiche fatte altrove.
    const onVisible = () => {
      if (document.visibilityState === "visible" && uidRef.current) void sync(uidRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  const value: AuthValue = {
    status,
    user,
    syncing,
    syncError,
    syncedAt,
    async signIn(email, password) {
      const sb = supabase();
      if (!sb) return;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(italianError(error.message));
    },
    async signUp(email, password) {
      const sb = supabase();
      if (!sb) return "done";
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl() },
      });
      if (error) throw new Error(italianError(error.message));
      return data.session ? "done" : "confirm";
    },
    async signInWithGoogle() {
      const sb = supabase();
      if (!sb) return;
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl() },
      });
      if (error) throw new Error(italianError(error.message));
    },
    async resetPassword(email) {
      const sb = supabase();
      if (!sb) return;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      if (error) throw new Error(italianError(error.message));
    },
    async updatePassword(password) {
      const sb = supabase();
      if (!sb) return;
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(italianError(error.message));
    },
    async signOut() {
      const sb = supabase();
      if (!sb) return;
      try {
        await forgetLocal(uidRef.current);
      } catch (e) {
        throw new Error(
          "Non riesco a salvare le ultime modifiche sul profilo (" +
            italianError(e instanceof Error ? e.message : String(e)) +
            "). Riprova quando sei connesso.",
        );
      }
      await sb.auth.signOut();
      window.location.reload();
    },
    async syncNow() {
      if (!uidRef.current) return;
      await flush();
      await sync(uidRef.current);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth fuori da AuthProvider");
  return v;
}
