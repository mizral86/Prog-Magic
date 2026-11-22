// Pannello "Segnalazioni" in Account, visibile solo ai moderatori.

import { locale } from "../i18n";
import { useEffect, useState } from "react";
import { REPORT_REASONS } from "../friends";
import { AdminReport, deleteReportedUser, isAdmin, loadReports, setReportStatus } from "../moderation";

export default function ReportsAdmin({ uid }: { uid: string }) {
  const [admin, setAdmin] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [list, setList] = useState<AdminReport[] | null>(null);
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
    loadReports(onlyOpen)
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    if (admin) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, onlyOpen]);

  if (!admin) return null;

  return (
    <section className="panel account-panel reports-admin">
      <h2>
        Segnalazioni
        {list && onlyOpen && <span className="muted small"> · {list.length} da vedere</span>}
      </h2>
      <p className="muted small">Lo vedi solo tu perché sei moderatore.</p>
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
      {list?.map((r) => <ReportCard key={r.id} r={r} onChange={reload} />)}
    </section>
  );
}

function ReportCard({ r, onChange }: { r: AdminReport; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = REPORT_REASONS.find((x) => x.id === r.reason)?.label ?? r.reason;
  const who = r.reported_username ? `@${r.reported_username}` : "utente";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`report-card${r.status === "chiusa" ? " closed" : ""}`}>
      <div className="report-card-head">
        <b>{who}</b>
        {!r.reported_exists && <span className="muted small"> (account eliminato)</span>}
        <span className="muted small"> · {new Date(r.created_at).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="small">
        <b>{reason}</b>
        {r.reporter_username && <span className="muted"> · da @{r.reporter_username}</span>}
      </div>
      {r.details && <p className="small report-details">“{r.details}”</p>}
      {r.messages.length > 0 && (
        <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)}>
          {open ? "Nascondi messaggi" : `Mostra ultimi ${r.messages.length} messaggi`}
        </button>
      )}
      {open && (
        <div className="report-msgs">
          {r.messages.map((m, i) => (
            <div key={i} className={`report-msg ${m.from}`}>
              <span className="muted small">
                {m.from === "reported" ? who : r.reporter_username ? `@${r.reporter_username}` : "chi segnala"}
              </span>{" "}
              {m.body}
            </div>
          ))}
        </div>
      )}
      {error && <p className="account-error small">{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {r.status === "aperta" ? (
          <button type="button" className="ghost small-btn" disabled={busy} onClick={() => run(() => setReportStatus(r.id, "chiusa"))}>
            ✓ Vista, chiudi
          </button>
        ) : (
          <button type="button" className="ghost small-btn" disabled={busy} onClick={() => run(() => setReportStatus(r.id, "aperta"))}>
            Riapri
          </button>
        )}
        {r.reported && r.reported_exists && (
          <button
            type="button"
            className="ghost danger small-btn"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Cancellare per sempre l'account di ${who}? Perde collezione, amici e messaggi. Non si può annullare.`,
                )
              )
                void run(() => deleteReportedUser(r.reported!));
            }}
          >
            Cancella account di {who}
          </button>
        )}
      </div>
    </div>
  );
}
