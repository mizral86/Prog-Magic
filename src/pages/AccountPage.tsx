// Pagina "Account": accesso, registrazione e stato della sincronizzazione.

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { googleEnabled } from "../cloud";

type Mode = "login" | "signup" | "reset";

export default function AccountPage() {
  const auth = useAuth();

  if (auth.status === "disabled") {
    return (
      <div className="page">
        <h1 className="page-title">Account</h1>
        <div className="panel account-panel">
          <p>
            L'accesso con profilo non è ancora attivo su questa installazione: manca il
            collegamento al progetto Supabase.
          </p>
          <p className="muted small">
            Finché non è attivo, collezione e mazzi restano salvati solo su questo dispositivo.
          </p>
        </div>
      </div>
    );
  }

  if (auth.status === "loading") {
    return (
      <div className="page">
        <h1 className="page-title">Account</h1>
        <p className="muted">Caricamento…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Account</h1>
      {auth.status === "in" ? <Profile /> : <SignInForm />}
    </div>
  );
}

function Profile() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const user = auth.user!;
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "Profilo";

  return (
    <>
      <div className="panel account-panel">
        <div className="account-head">
          <span className="account-avatar" aria-hidden>
            {(name[0] ?? "?").toUpperCase()}
          </span>
          <div>
            <div className="account-name">{name}</div>
            {user.email && user.email !== name && <div className="muted small">{user.email}</div>}
          </div>
        </div>

        <div className="account-sync">
          {auth.syncing ? (
            <span>Sincronizzazione in corso…</span>
          ) : auth.syncError ? (
            <span className="account-error">Sincronizzazione non riuscita: {auth.syncError}</span>
          ) : auth.syncedAt ? (
            <span>
              ✓ Collezione, mazzi, wishlist e impostazioni salvati sul profilo
              <span className="muted small"> · {formatWhen(auth.syncedAt)}</span>
            </span>
          ) : (
            <span>In attesa della prima sincronizzazione…</span>
          )}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="ghost" disabled={auth.syncing} onClick={() => void auth.syncNow()}>
            Sincronizza ora
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await auth.signOut();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            }}
          >
            Esci
          </button>
        </div>
        {error && <p className="account-error">{error}</p>}
        <p className="muted small">
          Uscendo, i dati del profilo vengono tolti da questo dispositivo e restano salvati
          sull'account: li ritrovi accedendo di nuovo, anche da un altro telefono o computer.
        </p>
      </div>

      <form
        className="panel account-panel account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPwMsg(null);
          try {
            await auth.updatePassword(newPw);
            setNewPw("");
            setPwMsg("Password aggiornata.");
          } catch (err) {
            setPwMsg(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <h2>Cambia password</h2>
        <label className="field account-field">
          Nuova password
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </label>
        <button type="submit" className="ghost" style={{ justifySelf: "start" }}>
          Salva password
        </button>
        {pwMsg && <p className="muted small">{pwMsg}</p>}
      </form>
    </>
  );
}

function SignInForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Il pulsante Google compare solo se Google è attivo nel progetto Supabase.
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let alive = true;
    void googleEnabled().then((on) => alive && setGoogle(on));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") await auth.signIn(email, password);
      else if (mode === "signup") {
        const r = await auth.signUp(email, password);
        if (r === "confirm")
          setInfo(
            `Ti ho mandato un'email a ${email}: apri il link di conferma e poi accedi.`,
          );
      } else {
        await auth.resetPassword(email);
        setInfo("Se l'indirizzo è registrato, riceverai un'email con il link per entrare e cambiare password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel account-panel">
      <p className="muted">
        Accedi per salvare collezione, mazzi, wishlist e impostazioni sul tuo profilo e
        ritrovarli su ogni dispositivo.
      </p>

      <div className="view-toggle account-tabs" role="tablist">
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          Accedi
        </button>
        <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>
          Crea account
        </button>
      </div>

      <form onSubmit={submit} className="account-form">
        <label className="field account-field">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "reset" && (
          <label className="field account-field">
            Password
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {mode === "login" ? "Accedi" : mode === "signup" ? "Crea account" : "Mandami il link"}
        </button>
      </form>

      {mode === "login" && (
        <button type="button" className="link-btn" onClick={() => setMode("reset")}>
          Password dimenticata?
        </button>
      )}
      {mode === "reset" && (
        <button type="button" className="link-btn" onClick={() => setMode("login")}>
          ← Torna all'accesso
        </button>
      )}

      {google && (
        <>
          <div className="account-or">
            <span>oppure</span>
          </div>
          <button
            type="button"
            className="ghost account-google"
            disabled={busy}
            onClick={async () => {
              setError(null);
              try {
                await auth.signInWithGoogle();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <span aria-hidden className="g-mark">G</span> Continua con Google
          </button>
        </>
      )}

      {info && <p className="account-info">{info}</p>}
      {error && <p className="account-error">{error}</p>}
      <p className="muted small account-legal">
        <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a> ·{" "}
        <a href={`${import.meta.env.BASE_URL}termini.html`}>Termini</a>
      </p>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
