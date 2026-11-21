// Regole e casistiche ufficiali della carta, tradotte in italiano.

import { useEffect, useState } from "react";
import { getRulingsIt, Ruling } from "../rulings";

const SHOWN = 3;

function formatDate(d: string): string {
  const [y, m, g] = d.split("-");
  return y && m && g ? `${g}/${m}/${y}` : d;
}

export function CardRulings({
  name,
  printedName,
  scryfallId,
}: {
  name: string;
  printedName?: string;
  scryfallId?: string;
}) {
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [english, setEnglish] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRulings(null);
    setError(null);
    getRulingsIt({ name, printedName, scryfallId })
      .then((r) => !cancelled && setRulings(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // La stessa carta in un'altra edizione ha le stesse regole: niente ricarica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, attempt]);

  const untranslated = rulings?.some((r) => !r.it) ?? false;
  const list = rulings ? (all ? rulings : rulings.slice(0, SHOWN)) : [];

  return (
    <div className="rulings">
      <h3 className="mini-title">Regole e casistiche</h3>
      {!rulings && !error && <div className="muted small">Carico le regole della carta…</div>}
      {error && (
        <div className="status-line error">
          {error}{" "}
          <button type="button" className="link-btn" onClick={() => setAttempt((a) => a + 1)}>
            Riprova
          </button>
        </div>
      )}
      {rulings && rulings.length === 0 && (
        <div className="muted small">Nessuna regola particolare per questa carta.</div>
      )}
      {rulings && rulings.length > 0 && (
        <>
          <div className="ruling-head muted small">
            <span>
              {untranslated
                ? "Alcune regole non si sono potute tradurre: sono in inglese."
                : english
                  ? "Testo originale in inglese."
                  : "Tradotte automaticamente dall'inglese."}
            </span>
            <button type="button" className="link-btn" onClick={() => setEnglish((v) => !v)}>
              {english ? "Mostra in italiano" : "Originale inglese"}
            </button>
          </div>
          <ul className="ruling-list">
            {list.map((r, i) => (
              <li key={i} className="ruling">
                <span className="ruling-date">{formatDate(r.date)}</span>
                {english ? r.en : (r.it ?? r.en)}
              </li>
            ))}
          </ul>
          {rulings.length > SHOWN && (
            <button type="button" className="ghost ruling-more" onClick={() => setAll((v) => !v)}>
              {all ? "Mostra meno" : `Mostra tutte (${rulings.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
