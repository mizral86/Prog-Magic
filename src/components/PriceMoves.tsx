// Voce "Spike e cali di prezzo" della Collezione: confronta il prezzo di oggi
// con quello di un mese fa, di inizio anno e del giorno di inserimento.

import { useMemo, useState } from "react";
import { CollectionEntry } from "../collection";
import { formatMoney } from "../prices";
import {
  computeMoves,
  isSignificant,
  MIN_DIFF_EUR,
  Period,
  PriceMove,
} from "../priceHistory";

const PERIODS: { id: Period; label: string; long: string }[] = [
  { id: "month", label: "Mese scorso", long: "rispetto a un mese fa" },
  { id: "year", label: "Inizio anno", long: "rispetto all'inizio dell'anno" },
  { id: "added", label: "Inserimento", long: "rispetto a quando l'hai aggiunta" },
];

const THRESHOLDS = [0.1, 0.2, 0.3, 0.5];
const PREF_KEY = "pm.priceMoves.prefs";

function loadPrefs(): { period: Period; threshold: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
    if (p && PERIODS.some((x) => x.id === p.period) && THRESHOLDS.includes(p.threshold))
      return p;
  } catch {
    /* ignora */
  }
  return { period: "month", threshold: 0.2 };
}

export function PriceMoves({
  entries,
  onOpen,
}: {
  entries: CollectionEntry[];
  onOpen: (e: CollectionEntry) => void;
}) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  };

  // I numeri nel titolo usano sempre tutti e tre i periodi, così si vede
  // subito se c'è qualcosa da guardare anche a pannello chiuso.
  const all = useMemo(() => {
    const out = {} as Record<Period, ReturnType<typeof computeMoves<CollectionEntry>>>;
    for (const p of PERIODS) out[p.id] = computeMoves(entries, p.id);
    return out;
  }, [entries]);

  const { moves, noRef } = all[prefs.period];
  const significant = moves.filter((m) => isSignificant(m, prefs.threshold));
  const ups = significant.filter((m) => m.diff > 0).sort((a, b) => b.pct - a.pct);
  const downs = significant.filter((m) => m.diff < 0).sort((a, b) => a.pct - b.pct);
  const valueDelta = moves.reduce((a, m) => a + m.diff * m.copies, 0);

  const count = (p: Period) => {
    const s = all[p].moves.filter((m) => isSignificant(m, prefs.threshold));
    return { up: s.filter((m) => m.diff > 0).length, down: s.filter((m) => m.diff < 0).length };
  };
  const head = count(prefs.period);
  const period = PERIODS.find((p) => p.id === prefs.period)!;

  return (
    <details className="coll-more price-moves">
      <summary>
        📈 Spike e cali di prezzo
        {(head.up > 0 || head.down > 0) && (
          <span className="pm-badges">
            {head.up > 0 && <span className="pm-badge up">▲ {head.up}</span>}
            {head.down > 0 && <span className="pm-badge down">▼ {head.down}</span>}
          </span>
        )}
      </summary>

      <div className="pm-controls">
        <span className="view-toggle" role="group" aria-label="Periodo di confronto">
          {PERIODS.map((p) => {
            const c = count(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={prefs.period === p.id}
                onClick={() => update({ period: p.id })}
              >
                {p.label}
                {c.up + c.down > 0 && <span className="pm-n">{c.up + c.down}</span>}
              </button>
            );
          })}
        </span>
        <label className="pm-threshold">
          Soglia
          <select
            value={prefs.threshold}
            onChange={(e) => update({ threshold: Number(e.target.value) })}
          >
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                ±{Math.round(t * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {moves.length > 0 && (
        <div className="muted small pm-total">
          Valore della collezione {period.long}:{" "}
          <strong className={valueDelta >= 0 ? "delta-up" : "delta-down"}>
            {valueDelta >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(valueDelta), "EUR")}
          </strong>
        </div>
      )}

      <div className="pm-cols">
        <MoveList title="▲ Spike" kind="up" moves={ups} onOpen={onOpen} />
        <MoveList title="▼ Cali" kind="down" moves={downs} onOpen={onOpen} />
      </div>

      <p className="muted small pm-note">
        Conta una variazione di almeno {Math.round(prefs.threshold * 100)}% e{" "}
        {formatMoney(MIN_DIFF_EUR, "EUR")} a copia (prezzi EUR Cardmarket da Scryfall).
        Scryfall non dà i prezzi passati, quindi lo storico lo registra l'app: i
        prezzi si aggiornano da soli una volta al giorno quando apri la Collezione.
        Finché lo storico non copre tutto il periodo, il confronto parte dal primo
        prezzo registrato (data in corsivo).
        {noRef > 0 &&
          ` ${noRef} ${noRef === 1 ? "stampa non ha" : "stampe non hanno"} ancora un prezzo precedente per questo confronto.`}
      </p>
    </details>
  );
}

function MoveList({
  title,
  kind,
  moves,
  onOpen,
}: {
  title: string;
  kind: "up" | "down";
  moves: PriceMove<CollectionEntry>[];
  onOpen: (e: CollectionEntry) => void;
}) {
  return (
    <div className={`pm-list ${kind}`}>
      <h3>
        {title} <span className="muted">({moves.length})</span>
      </h3>
      {moves.length === 0 ? (
        <div className="muted small">
          {kind === "up" ? "Nessun rialzo significativo." : "Nessun calo significativo."}
        </div>
      ) : (
        moves.map((m) => (
          <button
            key={m.entry.id + m.finish}
            type="button"
            className="pm-row"
            onClick={() => onOpen(m.entry)}
          >
            {m.entry.imageSmallUrl ? (
              <img src={m.entry.imageSmallUrl} alt="" loading="lazy" />
            ) : (
              <span className="pm-noimg" />
            )}
            <span className="pm-main">
              <span className="pm-name">
                {m.entry.name}
                {m.finish === "foil" && <span className="pm-foil">FOIL</span>}
              </span>
              <span className="muted small">
                {(m.entry.setCode ?? "").toUpperCase()} ·{" "}
                {formatMoney(m.ref.price, "EUR")} → {formatMoney(m.current, "EUR")} ·{" "}
                {m.ref.partial ? <em>dal {shortDate(m.ref.date)}</em> : `dal ${shortDate(m.ref.date)}`}
              </span>
            </span>
            <span className={`pm-pct ${kind}`}>
              {m.pct > 0 ? "+" : "−"}
              {Math.round(Math.abs(m.pct) * 100)}%
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function shortDate(d?: string): string {
  if (!d) return "?";
  const [y, m, g] = d.split("-");
  const thisYear = String(new Date().getFullYear());
  return y === thisYear ? `${g}/${m}` : `${g}/${m}/${y.slice(2)}`;
}
