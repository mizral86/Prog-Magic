// Un torneo del gruppo: turni con gli abbinamenti, risultati da segnare,
// turno successivo e classifica. Ogni membro del gruppo può segnare i
// risultati; i salvataggi contemporanei vengono riletti e riapplicati.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useFriends } from "../friendsContext";
import { GroupMember, updateTournament, useGroupsBackend } from "../groups";
import {
  canAdvance,
  champion,
  currentRound,
  dropPlayer,
  isFinished,
  kindLabel,
  nextRound,
  pct,
  playerName,
  ranking,
  roundName,
  setResult,
  TData,
  TMatch,
  Tournament,
  winsNeeded,
} from "../tournament";

interface Props {
  t: Tournament;
  members: GroupMember[];
  groupOwner: string;
  onChanged: (t: Tournament) => void;
  onDeleted: () => void;
}

export function TournamentView({ t, groupOwner, onChanged, onDeleted }: Props) {
  const fr = useFriends();
  const b = useGroupsBackend();
  const d = t.data;
  const cur = currentRound(d);
  const [roundN, setRoundN] = useState<number>(cur?.n ?? 1);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  // Quando si apre un nuovo turno, lo mostra.
  useEffect(() => {
    if (cur) setRoundN(cur.n);
  }, [cur?.n, d.rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const champ = champion(d, t.kind);
  const round = d.rounds.find((r) => r.n === roundN) ?? cur;
  const canDelete = t.created_by === fr.uid || groupOwner === fr.uid;
  // Nell'eliminazione i turni passati non si cambiano: il tabellone è già avanzato.
  const locked = t.kind === "elimination" && round != null && round.n < d.rounds.length;

  async function change(f: (data: TData, t: Tournament) => TData) {
    if (!b) return;
    setBusy(true);
    setErr(null);
    try {
      const saved = await updateTournament(b, t, (fresh) => {
        const data = f(fresh.data, fresh);
        return { data, status: isFinished(data, fresh.kind) ? "done" : "running" };
      });
      onChanged(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!b) return;
    try {
      await b.deleteTournament(t.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const st = ranking(d, t.kind);

  return (
    <>
      <section className="panel friends-section">
        <h2>{t.name}</h2>
        <div className="muted small">
          {kindLabel(t.kind)} · {d.bestOf === 1 ? "partita secca" : "al meglio di 3"} · {d.players.length} giocatori ·{" "}
          {t.kind === "elimination" ? "" : `${d.totalRounds} turni`}
        </div>
        {champ && (
          <div className="grp-champ">
            <span>🏆</span>
            <div>
              <div className="muted small">Vincitore del torneo</div>
              <b>{champ.name}</b>
            </div>
          </div>
        )}
      </section>

      {d.rounds.length > 0 && round && (
        <section className="panel friends-section">
          <div className="grp-rounds">
            {d.rounds.map((r) => (
              <button key={r.n} className={r.n === round.n ? "on" : ""} onClick={() => setRoundN(r.n)}>
                {roundName(t.kind, d, r.n)}
                {r.matches.every((m) => m.done) ? " ✓" : ""}
              </button>
            ))}
          </div>
          {round.matches.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              d={d}
              editing={editing === m.id}
              onEdit={() => !locked && setEditing(editing === m.id ? null : m.id)}
              busy={busy}
              onSave={(r) => {
                setEditing(null);
                void change((data, fresh) => setResult(data, m.id, r, fresh.kind));
              }}
              elimination={t.kind === "elimination"}
            />
          ))}
          {canAdvance(d, t.kind) && (
            <button className="primary lcs-start" disabled={busy} onClick={() => void change((data, fresh) => nextRound(data, fresh.kind))}>
              ▶ Sorteggia {roundName(t.kind, d, d.rounds.length + 1).toLowerCase()}
            </button>
          )}
          {!champ && !canAdvance(d, t.kind) && round.matches.some((m) => !m.done) && (
            <p className="muted small">
              Tocca un incontro per segnare il risultato. Se giocate col <Link to="/gioca">Segnapunti</Link>{" "}
              scegliendo questo gruppo e i due giocatori, a fine partita la vittoria si aggiunge qui da sola.
            </p>
          )}
        </section>
      )}

      <section className="panel friends-section">
        <h2>Classifica</h2>
        <table className="grp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Giocatore</th>
              {t.kind === "elimination" ? (
                <th>Stato</th>
              ) : (
                <>
                  <th className="num">Punti</th>
                  <th className="num">V-S-P</th>
                  <th className="num" title="Media vittorie degli avversari (spareggio)">Avv.</th>
                  <th className="num" title="Partite vinte (spareggio)">Part.</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {st.map((s, i) => (
              <tr key={s.player.id} className={s.player.dropped ? "dim" : ""}>
                <td>{champ && i === 0 ? "🏆" : i + 1}</td>
                <td>
                  {s.player.name}
                  {s.player.dropped && <span className="muted small"> (ritirato)</span>}
                </td>
                {t.kind === "elimination" ? (
                  <td className="small">
                    {s.outRound === Infinity
                      ? champ?.id === s.player.id
                        ? "Campione"
                        : "In gioco"
                      : `Fuori: ${roundName(t.kind, d, s.outRound).toLowerCase()}`}
                  </td>
                ) : (
                  <>
                    <td className="num">
                      <b>{s.points}</b>
                    </td>
                    <td className="num">
                      {s.wins}-{s.losses}-{s.draws}
                    </td>
                    <td className="num">{s.played ? pct(s.omw) : "–"}</td>
                    <td className="num">{s.played ? pct(s.gw) : "–"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {t.kind !== "elimination" && (
          <p className="muted small">
            Vittoria 3 punti, pareggio 1. A pari punti conta la media vittorie degli avversari (Avv.),
            poi la % di partite vinte (Part.).
          </p>
        )}
      </section>

      <section className="panel friends-section">
        {err && <p className="account-error">{err}</p>}
        {t.kind === "swiss" && !champ && (
          <>
            <button className="ghost" onClick={() => setShowPlayers((v) => !v)}>
              {showPlayers ? "Chiudi" : "Ritira un giocatore…"}
            </button>
            {showPlayers && (
              <div className="grp-picks" style={{ marginTop: 8 }}>
                {d.players.map((p) => (
                  <label key={p.id} className={`grp-pick ${p.dropped ? "" : "on"}`}>
                    <input
                      type="checkbox"
                      checked={!p.dropped}
                      disabled={busy}
                      onChange={(e) => void change((data) => dropPlayer(data, p.id, !e.target.checked))}
                    />
                    {p.name}
                  </label>
                ))}
                <p className="muted small">Chi è ritirato non viene più abbinato dal turno successivo.</p>
              </div>
            )}{" "}
          </>
        )}
        {canDelete &&
          (confirmDel ? (
            <div className="grp-danger-box">
              <p>Eliminare il torneo? Le partite registrate restano nel gruppo.</p>
              <button className="primary danger" onClick={() => void del()}>
                Elimina
              </button>{" "}
              <button className="ghost" onClick={() => setConfirmDel(false)}>
                Annulla
              </button>
            </div>
          ) : (
            <button className="ghost danger-text" onClick={() => setConfirmDel(true)}>
              🗑 Elimina torneo
            </button>
          ))}
      </section>
    </>
  );
}

function MatchRow({
  m,
  d,
  editing,
  onEdit,
  onSave,
  busy,
  elimination,
}: {
  m: TMatch;
  d: TData;
  editing: boolean;
  onEdit: () => void;
  onSave: (r: { winsA: number; winsB: number; draws: number }) => void;
  busy: boolean;
  elimination: boolean;
}) {
  const [a, setA] = useState(m.winsA);
  const [bw, setB] = useState(m.winsB);
  const [dr, setD] = useState(m.draws);
  useEffect(() => {
    setA(m.winsA);
    setB(m.winsB);
    setD(m.draws);
  }, [m.winsA, m.winsB, m.draws, editing]);

  if (m.b === null) {
    return (
      <div className="grp-match bye">
        <span className="grp-mp win">{playerName(d, m.a)}</span>
        <span className="muted small">riposa (vale come vittoria)</span>
      </div>
    );
  }
  const winA = m.done && m.winsA > m.winsB;
  const winB = m.done && m.winsB > m.winsA;
  const need = winsNeeded(d.bestOf);
  const invalid = elimination && a === bw && a + bw + dr >= d.bestOf;

  return (
    <div className={`grp-match ${m.done ? "done" : ""}`}>
      <button className="grp-match-main" onClick={onEdit} disabled={busy}>
        <span className={`grp-mp ${winA ? "win" : ""}`}>{playerName(d, m.a)}</span>
        <span className="grp-score">
          {m.winsA + m.winsB + m.draws === 0 && !m.done ? "vs" : `${m.winsA} - ${m.winsB}${m.draws ? ` (${m.draws}p)` : ""}`}
        </span>
        <span className={`grp-mp right ${winB ? "win" : ""}`}>{playerName(d, m.b)}</span>
      </button>
      {editing && (
        <div className="grp-result">
          <Step label={`Vinte da ${playerName(d, m.a)}`} v={a} max={need} set={setA} />
          <Step label={`Vinte da ${playerName(d, m.b)}`} v={bw} max={need} set={setB} />
          {!elimination && <Step label="Pareggi" v={dr} max={d.bestOf} set={setD} />}
          {invalid && <p className="muted small">Nell'eliminazione diretta serve un vincitore.</p>}
          <div className="row">
            {d.bestOf === 1 ? (
              <>
                <button className="primary small-btn" onClick={() => onSave({ winsA: 1, winsB: 0, draws: 0 })}>
                  🏆 {playerName(d, m.a)}
                </button>
                <button className="primary small-btn" onClick={() => onSave({ winsA: 0, winsB: 1, draws: 0 })}>
                  🏆 {playerName(d, m.b)}
                </button>
                {!elimination && (
                  <button className="ghost small-btn" onClick={() => onSave({ winsA: 0, winsB: 0, draws: 1 })}>
                    🤝 Pari
                  </button>
                )}
              </>
            ) : (
              <button className="primary small-btn" disabled={invalid} onClick={() => onSave({ winsA: a, winsB: bw, draws: dr })}>
                Salva risultato
              </button>
            )}
            {(m.done || m.winsA + m.winsB + m.draws > 0) && (
              <button className="ghost small-btn" onClick={() => onSave({ winsA: 0, winsB: 0, draws: 0 })}>
                Azzera
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ label, v, max, set }: { label: string; v: number; max: number; set: (n: number) => void }) {
  return (
    <div className="lc-step grp-step">
      <div className="lc-step-label">
        <span>{label}</span>
      </div>
      <button onClick={() => set(Math.max(0, v - 1))} aria-label="meno">
        −
      </button>
      <span className="lc-step-val">{v}</span>
      <button onClick={() => set(Math.min(max, v + 1))} aria-label="più">
        +
      </button>
    </div>
  );
}

