// Pannello "Top mazzi per formato": lista curata (indicativa) + link alle
// fonti live del metagame. Vedi metagame.ts per il disclaimer sui dati.

import { useState } from "react";
import { FORMATS, Format } from "../decks";
import {
  EDHREC_URL,
  goldfishUrl,
  META,
  META_UPDATED,
  mtgtop8Url,
} from "../metagame";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

export function MetaPanel({
  onCreateDeck,
}: {
  onCreateDeck: (name: string, format: Format) => void;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("modern");
  const list = META[format];

  return (
    <div className="panel meta-panel" style={{ marginTop: 16 }}>
      <button
        type="button"
        className="link-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Top mazzi per formato (meta)
      </button>

      {open && (
        <>
          <div className="row" style={{ gap: 8, margin: "10px 0", alignItems: "center" }}>
            <label className="field">
              Formato
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ol className="meta-list">
            {list.map((a, i) => (
              <li key={i}>
                <div className="meta-row">
                  <div>
                    <span className="meta-name">{a.name}</span>
                    {a.note && <span className="muted small"> — {a.note}</span>}
                  </div>
                  {!a.name.startsWith("Vedi") && (
                    <button
                      type="button"
                      className="ghost meta-create"
                      title="Crea un mazzo mio da questo archetipo"
                      onClick={() => onCreateDeck(a.name, format)}
                    >
                      + Crea mazzo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="meta-links">
            <span className="muted small">Metagame aggiornato:</span>
            <a href={goldfishUrl(format)} target="_blank" rel="noreferrer">
              MTGGoldfish
            </a>
            <a href={mtgtop8Url(format)} target="_blank" rel="noreferrer">
              MTGTop8
            </a>
            {format === "commander" && (
              <a href={EDHREC_URL} target="_blank" rel="noreferrer">
                EDHREC
              </a>
            )}
          </div>

          <p className="muted small meta-disclaimer">
            ⚠ Elenco <strong>indicativo</strong> (agg. {META_UPDATED}), non un
            dato live: gli archetipi cambiano. Per il metagame corrente usa i
            link qui sopra.
          </p>
        </>
      )}
    </div>
  );
}
