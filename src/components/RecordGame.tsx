// Registra una partita in un gruppo di amici: dal segnapunti (giocatori,
// vita finale e vincitore già pronti) oppure a mano dalla pagina del gruppo.
// Se i due giocatori hanno un incontro aperto in un torneo del gruppo, la
// vittoria si può contare anche lì.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFriends } from "../friendsContext";
import {
  Group,
  GroupMember,
  memberName,
  NewGame,
  updateTournament,
  useGroupsBackend,
} from "../groups";
import {
  addGameToMatch,
  isFinished,
  openMatches,
  playerName,
  roundName,
  TMatch,
  Tournament,
} from "../tournament";

export interface DraftPlayer {
  uid?: string | null;
  name: string;
  life?: number | null;
  out?: string | null;
}

interface Props {
  players: DraftPlayer[];
  groupId?: string;
  startLife?: number | null;
  commander?: boolean;
  durationMin?: number | null;
  /** Dalla pagina del gruppo: niente scelta del gruppo e righe modificabili. */
  manual?: boolean;
  onSaved: (gameId: string, groupId: string) => void;
  onClose: () => void;
}

interface Row {
  uid: string | null;
  name: string;
  life: number | null;
  out: string | null;
}

const DRAW = "__pareggio";

export function RecordGame(props: Props) {
  const fr = useFriends();
  const backend = useGroupsBackend();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupId, setGroupId] = useState<string | undefined>(props.groupId);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [tours, setTours] = useState<Tournament[]>([]);
  const [rows, setRows] = useState<Row[]>(() =>
    props.players.map((p) => ({ uid: p.uid ?? null, name: p.name, life: p.life ?? null, out: p.out ?? null })),
  );
  const [winner, setWinner] = useState<string>(() => defaultWinner(props.players));
  const [note, setNote] = useState("");
  const [useTour, setUseTour] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!backend || !fr.uid) return;
    backend
      .myGroups(fr.uid)
      .then((gs) => {
        setGroups(gs);
        setGroupId((cur) => (cur && gs.some((g) => g.id === cur) ? cur : gs[0]?.id));
      })
      .catch((e) => {
        setGroups([]);
        setErr(e instanceof Error ? e.message : String(e));
      });
  }, [backend, fr.uid]);

  useEffect(() => {
    if (!backend || !groupId) return;
    let alive = true;
    Promise.all([backend.members(groupId), backend.tournaments(groupId)])
      .then(([ms, ts]) => {
        if (!alive) return;
        setMembers(ms);
        setTours(ts.filter((t) => t.status === "running"));
        // Riconosce i membri anche dal nome scritto nel segnapunti.
        setRows((rs) =>
          rs.map((r) => {
            if (r.uid && ms.some((m) => m.user_id === r.uid)) return r;
            const hit = ms.find((m) => sameName(memberName(m), r.name) || sameName(m.profile?.username ?? "", r.name));
            return hit ? { ...r, uid: hit.user_id } : { ...r, uid: null };
          }),
        );
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [backend, groupId]);

  // Incontro di torneo aperto tra i due giocatori, se c'è.
  const tourMatch = useMemo(() => {
    if (rows.length !== 2) return null;
    for (const t of tours) {
      const pid = (r: Row) =>
        t.data.players.find((p) => (r.uid ? p.uid === r.uid : !p.uid && sameName(p.name, r.name)))?.id;
      const a = pid(rows[0]);
      const b = pid(rows[1]);
      if (!a || !b) continue;
      const m = openMatches(t.data).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      if (m) return { t, m, ids: [a, b] as const };
    }
    return null;
  }, [rows, tours]);

  const keyOf = (i: number) => String(i);
  const winnerIdx = winner === DRAW ? -1 : Number(winner);

  if (fr.status !== "ready") {
    return (
      <Sheet title="Registra la partita" onClose={props.onClose}>
        <p>
          Per registrare le partite in un gruppo di amici serve un profilo con nome utente.{" "}
          <Link to="/amici">Vai ad Amici</Link>
        </p>
      </Sheet>
    );
  }

  if (groups && groups.length === 0) {
    return (
      <Sheet title="Registra la partita" onClose={props.onClose}>
        {err ? (
          <p className="account-error">{err}</p>
        ) : (
          <p>
            Non fai ancora parte di nessun gruppo. Creane uno in <Link to="/gruppi">Amici › Gruppi</Link>{" "}
            e aggiungi i tuoi amici: poi qui potrai salvare le partite.
          </p>
        )}
      </Sheet>
    );
  }

  async function save() {
    if (!backend || !fr.uid || !groupId) return;
    if (rows.some((r) => !r.name.trim())) return setErr("Manca il nome di un giocatore.");
    setBusy(true);
    setErr(null);
    try {
      const linked = useTour && tourMatch ? tourMatch : null;
      const g: NewGame = {
        group_id: groupId,
        played_at: new Date().toISOString(),
        players: rows.map((r, i) => ({
          uid: r.uid,
          name: r.uid ? memberName(members.find((m) => m.user_id === r.uid)) : r.name.trim(),
          life: r.life,
          winner: i === winnerIdx,
          out: r.out,
        })),
        start_life: props.startLife ?? null,
        commander: !!props.commander,
        duration_min: props.durationMin ?? null,
        note: note.trim() || null,
        tournament_id: linked?.t.id ?? null,
      };
      const saved = await backend.addGame(fr.uid, g);
      if (linked) {
        const winPid = winnerIdx >= 0 ? linked.ids[winnerIdx] : null;
        await updateTournament(backend, linked.t, (t) => {
          const data = addGameToMatch(t.data, linked.m.id, winPid, t.kind);
          return { data, status: isFinished(data, t.kind) ? "done" : t.status };
        });
      }
      props.onSaved(saved.id, groupId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const memberOptions = members.map((m) => ({ id: m.user_id, name: memberName(m) }));

  return (
    <Sheet title="Registra la partita" onClose={props.onClose}>
      {!groups ? (
        <p className="muted">Carico i tuoi gruppi…</p>
      ) : (
        <>
          {!props.manual && (
            <label className="field grp-field">
              <span>Gruppo</span>
              <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="lcs-label">Giocatori e vincitore</div>
          <div className="grp-rec-rows">
            {rows.map((r, i) => (
              <div key={i} className={`grp-rec-row ${i === winnerIdx ? "win" : ""}`}>
                <button
                  type="button"
                  className="grp-crown"
                  onClick={() => setWinner(keyOf(i))}
                  aria-label={`${r.name}: vincitore`}
                  title="Vincitore"
                >
                  {i === winnerIdx ? "🏆" : "○"}
                </button>
                <div className="grp-rec-who">
                  <select
                    value={r.uid ?? ""}
                    onChange={(e) => {
                      const uid = e.target.value || null;
                      const name = uid ? memberOptions.find((o) => o.id === uid)!.name : r.uid ? "" : r.name;
                      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, uid, name } : x)));
                    }}
                  >
                    {memberOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                    <option value="">Ospite (senza profilo)</option>
                  </select>
                  {!r.uid && (
                    <input
                      value={r.name}
                      placeholder="Nome dell'ospite"
                      maxLength={30}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                  )}
                </div>
                {r.life !== null && (
                  <span className={`grp-rec-life ${r.out ? "out" : ""}`} title={r.out ?? "Vita finale"}>
                    {r.out ? "💀" : "❤"} {r.life}
                  </span>
                )}
                {props.manual && rows.length > 2 && (
                  <button
                    type="button"
                    className="ghost small-btn"
                    aria-label="Togli giocatore"
                    onClick={() => {
                      setRows((rs) => rs.filter((_, j) => j !== i));
                      setWinner("0");
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="row grp-rec-actions">
            <button
              type="button"
              className={`ghost small-btn ${winner === DRAW ? "on" : ""}`}
              onClick={() => setWinner(DRAW)}
            >
              🤝 Pareggio
            </button>
            {props.manual && rows.length < 8 && (
              <button
                type="button"
                className="ghost small-btn"
                onClick={() => {
                  const used = new Set(rows.map((r) => r.uid));
                  const free = memberOptions.find((o) => !used.has(o.id));
                  setRows((rs) => [...rs, { uid: free?.id ?? null, name: free?.name ?? "", life: null, out: null }]);
                }}
              >
                ＋ Giocatore
              </button>
            )}
          </div>

          {tourMatch && (
            <label className="field grp-tour-link">
              <input type="checkbox" checked={useTour} onChange={(e) => setUseTour(e.target.checked)} />
              <span>
                Conta per il torneo <b>{tourMatch.t.name}</b> ·{" "}
                {roundName(tourMatch.t.kind, tourMatch.t.data, roundOf(tourMatch.t, tourMatch.m))}{" "}
                <span className="muted small">
                  ({playerName(tourMatch.t.data, tourMatch.m.a)} {tourMatch.m.winsA}-{tourMatch.m.winsB}{" "}
                  {playerName(tourMatch.t.data, tourMatch.m.b)})
                </span>
              </span>
            </label>
          )}

          <label className="field grp-field">
            <span>Nota (facoltativa)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="es. mazzi usati" />
          </label>

          {err && <p className="account-error">{err}</p>}
          <button className="primary lcs-start" onClick={save} disabled={busy || !groupId}>
            {busy ? "Salvo…" : "📒 Salva nel gruppo"}
          </button>
        </>
      )}
    </Sheet>
  );
}

function roundOf(t: Tournament, m: TMatch): number {
  return t.data.rounds.find((r) => r.matches.some((x) => x.id === m.id))?.n ?? 1;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="lcs-sheet-veil" onClick={onClose}>
      <div className="lcs-sheet grp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lcs-sheet-head">
          <strong>{title}</strong>
          <button className="ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function defaultWinner(ps: DraftPlayer[]): string {
  const alive = ps.map((p, i) => ({ p, i })).filter(({ p }) => !p.out);
  if (alive.length === 1) return String(alive[0].i);
  const withLife = ps.map((p, i) => ({ l: p.life ?? -Infinity, i }));
  if (withLife.every((x) => x.l === -Infinity)) return "0";
  return String(withLife.sort((a, b) => b.l - a.l)[0].i);
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== "";
}
