// Pannello "Problemi segnalati" in Account, visibile solo ai moderatori.

import { useEffect, useState } from "react";
import { locale } from "../i18n";
import { isAdmin } from "../moderation";
import { AdminFeedback, loadFeedback, loadFeedbackScreenshot, setFeedbackStatus } from "../feedback";

export default function FeedbackAdmin({ uid }: { uid: string }) {
  const [admin, setAdmin] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [list, setList] = useState<AdminFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void isAdmin(uid).then((ok) => alive && setAdmin(ok));
    return () => {
      alive = false;
    };
  }, [uid]);

  const reload = () => {
    setError(null);
    loadFeedback(onlyOpen)
      .then(setList)
      .catch((e) => {
        const m = e instanceof Error ? e.message : String(e);
        setError(/admin_feedback|could not find|schema cache/i.test(m) ? "Esegui supabase/feedback.sql per attivare le segnalazioni." : m);
      });
  };
  useEffect(() => {
    if (admin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, onlyOpen]);

  if (!admin) return null;

  return (
    <section className="panel account-panel reports-admin">
      <h2>
        Problemi segnalati
        {list && onlyOpen && <span className="muted small"> · {list.length} da vedere</span>}
      </h2>
      <p className="muted small">Bug e idee mandati dagli utenti con “Segnala un problema”.</p>
      <div className="view-toggle account-tabs" role="tablist">
        <button type="button" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(true)}>
          Da vedere
        </button>
        <button type="button" aria-pressed={!onlyOpen} onClick={() => setOnlyOpen(false)}>
          Tutte
        </button>
      </div>
      {error && <p className="account-error">{error}</p>}
      {list === null && !error && <p className="muted small">Caricamento…</p>}
      {list?.length === 0 && <p className="muted small">Nessuna segnalazione {onlyOpen ? "da vedere" : ""}.</p>}
      {list?.map((f) => <FeedbackCard key={f.id} f={f} onChange={reload} />)}
    </section>
  );
}

function FeedbackCard({ f, onChange }: { f: AdminFeedback; onChange: () => void }) {
  const [shot, setShot] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errs = Array.isArray(f.diag?.errori) ? (f.diag.errori as string[]) : [];

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`report-card${f.status === "chiusa" ? " closed" : ""}`}>
      <div className="report-card-head">
        <b>{f.kind === "idea" ? "💡 Idea" : "🐞 Problema"}</b>
        <span className="muted small">
          {" "}
          · {f.username ? `@${f.username}` : "senza account"} ·{" "}
          {new Date(f.created_at).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {f.page && <> · {f.page}</>}
        </span>
      </div>
      <p className="small report-details fb-msg">{f.message}</p>
      {errs.length > 0 && <p className="small account-error">{errs.length} errori registrati prima dell'invio</p>}
      {shot && (
        <a href={shot} target="_blank" rel="noreferrer">
          <img className="fb-admin-shot" src={shot} alt="Schermata allegata" />
        </a>
      )}
      {showDiag && <pre className="fb-diag-pre">{JSON.stringify(f.diag, null, 2)}</pre>}
      {error && <p className="account-error small">{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {f.has_screenshot && !shot && (
          <button
            type="button"
            className="ghost small-btn"
            disabled={busy}
            onClick={() => run(async () => setShot(await loadFeedbackScreenshot(f.id)))}
          >
            🖼 Schermata
          </button>
        )}
        <button type="button" className="ghost small-btn" onClick={() => setShowDiag((s) => !s)}>
          {showDiag ? "Nascondi dettagli" : "Dettagli tecnici"}
        </button>
        <button
          type="button"
          className="ghost small-btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await setFeedbackStatus(f.id, f.status === "aperta" ? "chiusa" : "aperta");
              onChange();
            })
          }
        >
          {f.status === "aperta" ? "✓ Vista, chiudi" : "Riapri"}
        </button>
      </div>
    </div>
  );
}
