// "Segnala un problema": foglio di invio, pulsante 🐞 che fotografa la
// schermata corrente e pannello in Account per iniziare.

import { useEffect, useRef, useState } from "react";
import {
  captureScreen,
  collectDiag,
  Diag,
  FeedbackKind,
  FeedbackUnavailable,
  feedbackAsText,
  imageFileToJpeg,
  NO_SHOT_ATTR,
  sendFeedback,
  setBugMode,
  useBugMode,
} from "../feedback";

interface SheetProps {
  /** Schermata già fatta (dal pulsante 🐞 o dalla pagina d'errore). */
  screenshot?: string | null;
  /** Errore della pagina, se si arriva dalla schermata "Qualcosa è andato storto". */
  error?: string;
  onClose: () => void;
}

export function FeedbackSheet({ screenshot: initialShot = null, error, onClose }: SheetProps) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<string | null>(initialShot);
  const [useShot, setUseShot] = useState(!!initialShot);
  const [useDiag, setUseDiag] = useState(true);
  const [diag] = useState<Diag>(() => collectDiag(error ? { errore_pagina: error.slice(0, 600) } : undefined));
  const [showDiag, setShowDiag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickImage(f: File | undefined) {
    if (!f) return;
    try {
      setShot(await imageFileToJpeg(f));
      setUseShot(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await sendFeedback({
        kind,
        message: message.trim(),
        diag: useDiag ? diag : null,
        screenshot: useShot ? shot : null,
      });
      setDone(true);
    } catch (e) {
      if (e instanceof FeedbackUnavailable) setUnavailable(true);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedbackAsText(kind, message.trim(), useDiag ? diag : null));
      setCopied(true);
    } catch {
      setErr("Non riesco a copiare: seleziona il testo a mano.");
    }
  }

  return (
    <div className="lcs-sheet-veil fb-veil" onClick={onClose} {...{ [NO_SHOT_ATTR]: "" }}>
      <div className="lcs-sheet grp-sheet fb-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lcs-sheet-head">
          <strong>{done ? "Grazie!" : "Segnala un problema"}</strong>
          <button className="ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>

        {done ? (
          <>
            <p>Segnalazione inviata. La leggiamo e, se serve, sistemiamo nella prossima versione.</p>
            <button className="primary lcs-start" onClick={onClose}>
              Torna all'app
            </button>
          </>
        ) : (
          <>
            <div className="lcs-pills fb-kind">
              <button type="button" className={kind === "bug" ? "on" : ""} onClick={() => setKind("bug")}>
                🐞 Qualcosa non va
              </button>
              <button type="button" className={kind === "idea" ? "on" : ""} onClick={() => setKind("idea")}>
                💡 Un'idea
              </button>
            </div>

            <label className="field grp-field">
              <span>{kind === "bug" ? "Cosa è successo?" : "Cosa ti piacerebbe?"}</span>
              <textarea
                className="fb-text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={
                  kind === "bug"
                    ? "es. Nel Tavolo ho trascinato una carta nel cimitero ed è sparita"
                    : "es. Vorrei vedere il prezzo totale della wishlist"
                }
              />
            </label>

            <div className="lcs-label">Schermata</div>
            {shot ? (
              <div className="fb-shot">
                <img src={shot} alt="Schermata da allegare" />
                <div className="fb-shot-side">
                  <label className="row fb-check">
                    <input type="checkbox" checked={useShot} onChange={(e) => setUseShot(e.target.checked)} />
                    <span>Allega la schermata</span>
                  </label>
                  <button type="button" className="ghost small-btn" onClick={() => fileRef.current?.click()}>
                    Usa un'altra immagine
                  </button>
                </div>
              </div>
            ) : (
              <div className="fb-noshot">
                <button type="button" className="ghost small-btn" onClick={() => fileRef.current?.click()}>
                  🖼 Allega un'immagine
                </button>
                <span className="muted small">
                  per esempio una schermata fatta col telefono, oppure usa “Fotografa una schermata” in Account.
                </span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <label className="row fb-check">
              <input type="checkbox" checked={useDiag} onChange={(e) => setUseDiag(e.target.checked)} />
              <span>
                Allega i dettagli tecnici{" "}
                <button type="button" className="link-btn small" onClick={() => setShowDiag((s) => !s)}>
                  {showDiag ? "nascondi" : "cosa sono?"}
                </button>
              </span>
            </label>
            {showDiag && (
              <div className="fb-diag">
                <p className="muted small">
                  Versione dell'app, browser, dimensione dello schermo e ultimi errori. Niente email, mazzi o
                  collezione: solo quante carte e quanti mazzi hai.
                </p>
                <pre>{feedbackAsText(kind, "", diag).split("\n").slice(2).join("\n")}</pre>
              </div>
            )}

            {err && <p className="account-error">{err}</p>}
            {err && !unavailable && (
              <button type="button" className="ghost small-btn fb-copy" onClick={copy} disabled={!message.trim()}>
                {copied ? "✓ Copiato" : "📋 Copia il testo da mandare in altro modo"}
              </button>
            )}
            {unavailable ? (
              <button className="primary lcs-start" onClick={copy} disabled={!message.trim()}>
                {copied ? "✓ Copiato: incollalo in un messaggio" : "📋 Copia il testo della segnalazione"}
              </button>
            ) : (
              <button className="primary lcs-start" onClick={send} disabled={busy || !message.trim()}>
                {busy ? "Invio…" : "Invia segnalazione"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Pulsante 🐞 che resta su ogni schermata finché la modalità "segnala" è attiva. */
export function BugButton() {
  const on = useBugMode();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ shot: string | null } | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    if (!on) return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 6000);
    return () => window.clearTimeout(t);
  }, [on]);

  if (!on && !sheet) return null;

  async function shoot() {
    setBusy(true);
    setHint(false);
    const shot = await captureScreen();
    setBusy(false);
    setSheet({ shot });
  }

  return (
    <>
      {on && !sheet && (
        <div className="fb-float" {...{ [NO_SHOT_ATTR]: "" }}>
          {hint && <div className="fb-hint">Vai sulla schermata col problema e tocca 🐞</div>}
          <button
            type="button"
            className="fb-float-close"
            onClick={() => setBugMode(false)}
            aria-label="Annulla la segnalazione"
            title="Annulla"
          >
            ✕
          </button>
          <button
            type="button"
            className="fb-float-btn"
            onClick={shoot}
            disabled={busy}
            aria-label="Fotografa questa schermata e segnala"
            title="Fotografa questa schermata e segnala"
          >
            {busy ? "…" : "🐞"}
          </button>
        </div>
      )}
      {sheet && (
        <FeedbackSheet
          screenshot={sheet.shot}
          onClose={() => {
            setSheet(null);
            setBugMode(false);
          }}
        />
      )}
    </>
  );
}

/** Riquadro in Account: avvia la segnalazione. */
export function FeedbackPanel() {
  const [sheet, setSheet] = useState(false);
  return (
    <div className="panel account-panel fb-panel">
      <h2>Segnala un problema</h2>
      <p className="muted small">
        Qualcosa non funziona o hai un'idea per l'app? Puoi allegare una schermata: tocca{" "}
        <b>Fotografa una schermata</b>, vai dove c'è il problema e premi il pulsante 🐞 che compare in basso.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" onClick={() => setBugMode(true)}>
          📸 Fotografa una schermata
        </button>
        <button type="button" className="ghost" onClick={() => setSheet(true)}>
          ✍ Scrivi senza schermata
        </button>
      </div>
      {sheet && <FeedbackSheet onClose={() => setSheet(false)} />}
    </div>
  );
}

/** Dalla schermata d'errore: fotografa subito e apre il foglio con l'errore. */
export function ReportErrorButton({ error }: { error: Error }) {
  const [sheet, setSheet] = useState<{ shot: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const shot = await captureScreen();
          setBusy(false);
          setSheet({ shot });
        }}
      >
        {busy ? "…" : "🐞 Segnala il problema"}
      </button>
      {sheet && (
        <FeedbackSheet
          screenshot={sheet.shot}
          error={`${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(0, 6).join("\n")}`}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
