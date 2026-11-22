// Scheda "Partite" del mazzo: diario delle partite giocate e statistiche
// (vittorie, inizio o pesca, mulligan, avversari) più il confronto con gli
// altri mazzi.

import { useMemo, useState } from "react";
import type { SavedDeck } from "../decks";
import { useDecks } from "../decks";
import { locale } from "../i18n";
import {
  MatchEntry,
  MatchResult,
  matchStats,
  removeMatch,
  Tally,
  tally,
  useMatches,
  winRate,
} from "../matchLog";
import { MatchRecord } from "./MatchRecord";

const RESULT_ICON: Record<MatchResult, string> = { win: "V", loss: "S", draw: "P" };
const RESULT_LABEL: Record<MatchResult, string> = { win: "Vinta", loss: "Persa", draw: "Pareggio" };
const SOURCE_LABEL: Record<MatchEntry["source"], string> = {
  tavolo: "Tavolo",
  online: "Tavolo in due",
  segnapunti: "Segnapunti",
  manuale: "A mano",
};

export function DeckMatchesTab({ deck }: { deck: SavedDeck }) {
  const all = useMatches();
  const { decks } = useDecks();
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const mine = useMemo(() => all.filter((m) => m.deckId === deck.id), [all, deck.id]);
  const st = useMemo(() => matchStats(mine), [mine]);
  const ranking = useMemo(() => {
    const byDeck = new Map<string, MatchEntry[]>();
    for (const m of all) {
      const list = byDeck.get(m.deckId) ?? [];
      list.push(m);
      byDeck.set(m.deckId, list);
    }
    return [...byDeck.entries()]
      .map(([id, list]) => ({
        id,
        name: decks.find((d) => d.id === id)?.name ?? list[0].deckName,
        gone: !decks.some((d) => d.id === id),
        t: tally(list),
      }))
      .sort((a, b) => (winRate(b.t) ?? 0) - (winRate(a.t) ?? 0) || b.t.n - a.t.n);
  }, [all, decks]);

  const list = showAll ? mine : mine.slice(0, 8);

  return (
    <div className="deck-matches">
      <div className="panel dm-head">
        <div className="dm-big">
          <span className="dm-rate">{pct(st.all)}</span>
          <span className="muted small">vittorie</span>
        </div>
        <div className="dm-record">
          <b>{st.all.w}</b>V · <b>{st.all.l}</b>S{st.all.d > 0 && <> · <b>{st.all.d}</b>P</>}
          <div className="muted small">
            {st.all.n === 1 ? "1 partita" : `${st.all.n} partite`}
            {st.streak && st.streak.n >= 2 && st.streak.result !== "draw" && (
              <> · {st.streak.result === "win" ? `🔥 ${st.streak.n} vittorie di fila` : `${st.streak.n} sconfitte di fila`}</>
            )}
          </div>
          {st.form.length > 0 && (
            <div className="dm-form" aria-label="Ultime partite">
              {st.form.map((r, i) => (
                <span key={i} className={`dm-dot ${r}`} title={RESULT_LABEL[r]}>
                  {RESULT_ICON[r]}
                </span>
              ))}
            </div>
          )}
        </div>
        <button className="primary dm-add" onClick={() => setAdding(true)}>
          ＋ Registra partita
        </button>
      </div>

      {st.all.n === 0 ? (
        <div className="panel">
          <p className="muted">
            Ancora nessuna partita con questo mazzo. Puoi registrarle da qui, oppure a fine partita dal
            Tavolo (menu ⋯ → <b>Com'è andata?</b>) e dal Segnapunti (menu ✦ → <b>Diario del mazzo</b>).
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <h3 className="dm-title">Inizi o peschi?</h3>
            <div className="dm-bars">
              <Bar label="Inizio io" t={st.play} />
              <Bar label="Pesco io" t={st.draw} />
            </div>
            {st.known < st.all.n && (
              <p className="muted small">
                {st.all.n - st.known} {st.all.n - st.known === 1 ? "partita" : "partite"} senza sapere chi ha
                iniziato.
              </p>
            )}
            <h3 className="dm-title">Mulligan</h3>
            <div className="dm-bars">
              <Bar label="Mano tenuta" t={st.noMull} />
              <Bar label="Con mulligan" t={st.withMull} />
            </div>
            {st.avgMulligans !== null && (
              <p className="muted small">
                In media {st.avgMulligans.toLocaleString(locale(), { maximumFractionDigits: 1 })} mulligan a
                partita.
              </p>
            )}
          </div>

          <div className="panel">
            <h3 className="dm-title">Contro quali mazzi</h3>
            <div className="dm-bars">
              {st.byOpp.slice(0, 12).map((o) => (
                <Bar key={o.name} label={o.name} t={o.t} />
              ))}
            </div>
          </div>

          <div className="panel">
            <h3 className="dm-title">Diario</h3>
            <ul className="dm-list">
              {list.map((m) => (
                <li key={m.id} className="dm-row">
                  <span className={`dm-dot ${m.result}`}>{RESULT_ICON[m.result]}</span>
                  <div className="dm-row-main">
                    <div>
                      {m.oppDeck ? <>contro <b>{m.oppDeck}</b></> : RESULT_LABEL[m.result]}
                      {m.opponent && <span className="muted"> · {m.opponent}</span>}
                    </div>
                    <div className="muted small">
                      {new Date(m.playedAt).toLocaleDateString(locale(), { day: "numeric", month: "short" })}
                      {" · "}
                      {SOURCE_LABEL[m.source]}
                      {m.onPlay !== undefined && (m.onPlay ? " · iniziavo io" : " · pescavo io")}
                      {!!m.mulligans && ` · mulligan ${m.mulligans}`}
                      {m.turns ? ` · ${m.turns} turni` : ""}
                      {m.note && ` · ${m.note}`}
                    </div>
                  </div>
                  {confirmDel === m.id ? (
                    <button className="ghost small-btn danger" onClick={() => removeMatch(m.id)}>
                      Elimina
                    </button>
                  ) : (
                    <button
                      className="ghost small-btn"
                      aria-label="Elimina partita"
                      onClick={() => setConfirmDel(m.id)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {mine.length > 8 && (
              <button className="ghost small-btn" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Mostra meno" : `Mostra tutte (${mine.length})`}
              </button>
            )}
          </div>
        </>
      )}

      {ranking.length > 1 && (
        <div className="panel">
          <h3 className="dm-title">Tutti i tuoi mazzi</h3>
          <div className="dm-bars">
            {ranking.map((r) => (
              <Bar
                key={r.id}
                label={r.gone ? `${r.name} (eliminato)` : r.name}
                t={r.t}
                current={r.id === deck.id}
              />
            ))}
          </div>
        </div>
      )}

      {adding && (
        <MatchRecord
          source="manuale"
          deckId={deck.id}
          onSaved={() => setAdding(false)}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function pct(t: Tally): string {
  const r = winRate(t);
  return r === null ? "–" : `${r}%`;
}

function Bar({ label, t, current }: { label: string; t: Tally; current?: boolean }) {
  const r = winRate(t);
  return (
    <div className={`dm-bar ${current ? "current" : ""}`}>
      <span className="dm-bar-label" title={label}>
        {label}
      </span>
      <span className="dm-bar-track">
        {r !== null && <span className="dm-bar-fill" style={{ width: `${Math.max(r, 2)}%` }} />}
      </span>
      <span className="dm-bar-val">
        {r === null ? "–" : `${r}%`}
        <small className="muted">
          {" "}
          {t.w}-{t.l}
          {t.d ? `-${t.d}` : ""}
        </small>
      </span>
    </div>
  );
}
