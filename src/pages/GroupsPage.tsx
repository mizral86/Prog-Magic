// Pagina "Gruppi": gruppi di amici con classifica, partite registrate dal
// segnapunti (o a mano), tornei e membri.
//   /gruppi                    elenco e nuovo gruppo
//   /gruppi/:gid               un gruppo
//   /gruppi/:gid/torneo/:tid   un torneo

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { FriendsError } from "../friends";
import { useFriends } from "../friendsContext";
import {
  Group,
  GroupGame,
  GroupMember,
  groupStats,
  memberName,
  useGroupsBackend,
} from "../groups";
import { champion, createData, currentRound, KINDS, kindLabel, start, TKind, Tournament } from "../tournament";
import { RecordGame } from "../components/RecordGame";
import UserAvatar from "../components/UserAvatar";
import { TournamentView } from "../components/TournamentView";

export default function GroupsPage() {
  const fr = useFriends();
  const { gid, tid } = useParams();

  if (fr.status === "loading") return <Shell><p className="muted">Caricamento…</p></Shell>;
  if (fr.status !== "ready") {
    return (
      <Shell>
        <div className="panel friends-empty">
          <p>
            I gruppi sono fatti di amici: prima serve il profilo con nome utente nella sezione Amici.
          </p>
          <Link to="/amici" className="primary-link">
            Vai ad Amici
          </Link>
        </div>
      </Shell>
    );
  }
  if (gid) return <GroupView key={gid} gid={gid} tid={tid} />;
  return <GroupsHome />;
}

export function FriendsTabs() {
  return (
    <div className="segmented grp-switch">
      <NavLink to="/amici" end className={({ isActive }) => (isActive ? "on" : "")}>
        👤 Amici
      </NavLink>
      <NavLink to="/gruppi" className={({ isActive }) => (isActive ? "on" : "")}>
        👥 Gruppi
      </NavLink>
    </div>
  );
}

function Shell({ children, title = "Gruppi" }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="page friends-page grp-page">
      <h1 className="page-title">{title}</h1>
      <FriendsTabs />
      {children}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="panel friends-empty">
      <p>
        La sezione Gruppi non è ancora attiva sul server: va fatto una volta un passaggio su Supabase
        (incollare il file <code>supabase/groups.sql</code> nell'editor SQL, dopo friends.sql).
      </p>
    </div>
  );
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Elenco gruppi

function GroupsHome() {
  const fr = useFriends();
  const b = useGroupsBackend();
  const nav = useNavigate();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [setup, setSetup] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!b || !fr.uid) return;
    b.myGroups(fr.uid)
      .then(setGroups)
      .catch((e) => {
        if (e instanceof FriendsError && e.kind === "setup") setSetup(true);
        else setErr(errText(e));
        setGroups([]);
      });
  }, [b, fr.uid]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!b || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await b.createGroup(name.trim());
      nav(`/gruppi/${id}?tab=membri`);
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  }

  if (setup) return <Shell><SetupNotice /></Shell>;

  return (
    <Shell>
      <section className="panel friends-section">
        <h2>I tuoi gruppi</h2>
        {!groups ? (
          <p className="muted small">Carico…</p>
        ) : groups.length === 0 ? (
          <p className="muted small">
            Ancora nessun gruppo. Creane uno qui sotto (es. "Venerdì da Marco") e aggiungi i tuoi
            amici: nel gruppo trovate le partite registrate col segnapunti, la classifica e i tornei.
          </p>
        ) : (
          groups.map((g) => (
            <Link key={g.id} to={`/gruppi/${g.id}`} className="friend-row friend-link">
              <span className="friend-avatar grp-avatar" aria-hidden>
                {(g.name[0] ?? "?").toUpperCase()}
              </span>
              <div className="friend-names">
                <div className="friends-name">{g.name}</div>
                <div className="muted small">{g.owner === fr.uid ? "Creato da te" : "Membro"}</div>
              </div>
              <span className="friend-chat-hint" aria-hidden>
                ›
              </span>
            </Link>
          ))
        )}
      </section>

      <form className="panel friends-section grp-create" onSubmit={create}>
        <h2>Nuovo gruppo</h2>
        <div className="row">
          <input
            className="friends-search"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome del gruppo"
            maxLength={40}
          />
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? "Creo…" : "Crea"}
          </button>
        </div>
        {err && <p className="account-error">{err}</p>}
      </form>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Un gruppo

type Tab = "classifica" | "partite" | "tornei" | "membri";
const TABS: { id: Tab; label: string }[] = [
  { id: "classifica", label: "🏆 Classifica" },
  { id: "partite", label: "📒 Partite" },
  { id: "tornei", label: "⚔ Tornei" },
  { id: "membri", label: "👥 Membri" },
];

function GroupView({ gid, tid }: { gid: string; tid?: string }) {
  const fr = useFriends();
  const b = useGroupsBackend();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((t) => t.id === q) ? (q as Tab) : "classifica";
  });
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [games, setGames] = useState<GroupGame[]>([]);
  const [tours, setTours] = useState<Tournament[]>([]);
  const [setup, setSetup] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!b || !fr.uid) return;
    try {
      const gs = await b.myGroups(fr.uid);
      const g = gs.find((x) => x.id === gid) ?? null;
      setGroup(g);
      if (!g) return;
      const [ms, gm, ts] = await Promise.all([b.members(gid), b.games(gid), b.tournaments(gid)]);
      setMembers(ms);
      setGames(gm);
      setTours(ts);
      setErr(null);
    } catch (e) {
      if (e instanceof FriendsError && e.kind === "setup") setSetup(true);
      else setErr(errText(e));
      setGroup((g) => (g === undefined ? null : g));
    }
  }, [b, fr.uid, gid]);

  useEffect(() => {
    void load();
    if (!b) return;
    const stop = b.live(gid, () => void load());
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [b, gid, load]);

  if (setup) return <Shell><SetupNotice /></Shell>;
  if (group === undefined) return <Shell><p className="muted">Caricamento…</p></Shell>;
  if (group === null)
    return (
      <Shell>
        <div className="panel friends-empty">
          <p>{err ?? "Questo gruppo non esiste più o non ne fai parte."}</p>
          <Link to="/gruppi">← I tuoi gruppi</Link>
        </div>
      </Shell>
    );

  if (tid) {
    const t = tours.find((x) => x.id === tid);
    return (
      <Shell title={group.name}>
        <Link to={`/gruppi/${gid}?tab=tornei`} className="grp-back">
          ← Tornei di {group.name}
        </Link>
        {t ? (
          <TournamentView t={t} members={members} groupOwner={group.owner} onChanged={(nt) => setTours((ts) => ts.map((x) => (x.id === nt.id ? nt : x)))} onDeleted={() => nav(`/gruppi/${gid}?tab=tornei`)} />
        ) : (
          <p className="muted">Torneo non trovato.</p>
        )}
      </Shell>
    );
  }

  return (
    <Shell title={group.name}>
      <Link to="/gruppi" className="grp-back">
        ← I tuoi gruppi
      </Link>
      <div className="segmented grp-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {err && <p className="account-error">{err}</p>}
      {tab === "classifica" && <Leaderboard games={games} members={members} tours={tours} onGo={setTab} />}
      {tab === "partite" && <Games gid={gid} games={games} members={members} group={group} onChange={load} />}
      {tab === "tornei" && <Tournaments gid={gid} tours={tours} members={members} onCreated={(t) => { setTours((ts) => [t, ...ts]); nav(`/gruppi/${gid}/torneo/${t.id}`); }} />}
      {tab === "membri" && <Members group={group} members={members} onChange={load} />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Classifica del gruppo

function Leaderboard({
  games,
  members,
  tours,
  onGo,
}: {
  games: GroupGame[];
  members: GroupMember[];
  tours: Tournament[];
  onGo: (t: Tab) => void;
}) {
  const [period, setPeriod] = useState<"all" | "month">("all");
  const list = useMemo(() => {
    if (period === "all") return games;
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return games.filter((g) => new Date(g.played_at) >= from);
  }, [games, period]);
  const stats = groupStats(list, members);
  const titles = new Map<string, number>();
  for (const t of tours) {
    const c = champion(t.data, t.kind);
    if (c) {
      const k = c.uid ?? `ospite:${c.name.trim().toLowerCase()}`;
      titles.set(k, (titles.get(k) ?? 0) + 1);
    }
  }

  return (
    <section className="panel friends-section">
      <div className="grp-head-row">
        <h2>Classifica</h2>
        <div className="segmented small">
          <button className={period === "all" ? "on" : ""} onClick={() => setPeriod("all")}>
            Sempre
          </button>
          <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>
            Ultimi 30 giorni
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="muted small">
          Nessuna partita registrata{period === "month" ? " negli ultimi 30 giorni" : ""}. Giocate col{" "}
          <Link to="/gioca">Segnapunti</Link> (scegliendo questo gruppo) e a fine partita toccate
          “Registra”, oppure aggiungetele a mano in{" "}
          <button className="link-btn" onClick={() => onGo("partite")}>
            Partite
          </button>
          .
        </p>
      ) : (
        <table className="grp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Giocatore</th>
              <th className="num">Vinte</th>
              <th className="num">Giocate</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.key} className={s.games === 0 ? "dim" : ""}>
                <td>{i < 3 && s.wins > 0 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                <td>
                  {s.name}
                  {!s.uid && <span className="muted small"> (ospite)</span>}
                  {titles.get(s.key) ? (
                    <span className="grp-titles" title="Tornei vinti">
                      {" "}
                      🏆×{titles.get(s.key)}
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  <b>{s.wins}</b>
                </td>
                <td className="num">{s.games}</td>
                <td className="num">{s.games ? Math.round((s.wins / s.games) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Partite

function Games({
  gid,
  games,
  members,
  group,
  onChange,
}: {
  gid: string;
  games: GroupGame[];
  members: GroupMember[];
  group: Group;
  onChange: () => Promise<void>;
}) {
  const fr = useFriends();
  const b = useGroupsBackend();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function del(id: string) {
    if (!b) return;
    try {
      await b.deleteGame(id);
      setConfirm(null);
      await onChange();
    } catch (e) {
      setErr(errText(e));
    }
  }

  return (
    <>
      <section className="panel friends-section">
        <div className="grp-head-row">
          <h2>Partite ({games.length})</h2>
          <button className="primary small-btn" onClick={() => setAdding(true)}>
            ＋ Registra
          </button>
        </div>
        {err && <p className="account-error">{err}</p>}
        {games.length === 0 && (
          <p className="muted small">
            Le partite giocate col <Link to="/gioca">Segnapunti</Link> si registrano dal menu ✦ o dal
            pulsante che compare a fine partita. Puoi anche aggiungerle a mano con “Registra”.
          </p>
        )}
        {games.map((g) => {
          const canDelete = g.created_by === fr.uid || group.owner === fr.uid;
          return (
            <div key={g.id} className="grp-game">
              <div className="grp-game-head">
                <span>{formatDate(g.played_at)}</span>
                <span className="muted small">
                  {[
                    g.players.length > 2 ? `${g.players.length} giocatori` : null,
                    g.commander ? "Commander" : null,
                    g.duration_min ? `${g.duration_min} min` : null,
                    g.tournament_id ? "⚔ torneo" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {canDelete &&
                  (confirm === g.id ? (
                    <span className="grp-confirm">
                      <button className="ghost small-btn danger" onClick={() => void del(g.id)}>
                        Elimina
                      </button>
                      <button className="ghost small-btn" onClick={() => setConfirm(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button className="link-btn small" onClick={() => setConfirm(g.id)} aria-label="Elimina partita">
                      🗑
                    </button>
                  ))}
              </div>
              <div className="grp-game-players">
                {g.players.map((p, i) => (
                  <span key={i} className={`grp-gp ${p.winner ? "win" : ""}`}>
                    {p.winner ? "🏆 " : ""}
                    {p.name}
                    {p.life !== null && <small> {p.out ? "💀" : "❤"}{p.life}</small>}
                  </span>
                ))}
                {!g.players.some((p) => p.winner) && <span className="muted small">🤝 Pareggio</span>}
              </div>
              {g.note && <div className="muted small grp-note">{g.note}</div>}
            </div>
          );
        })}
      </section>
      {adding && (
        <RecordGame
          manual
          groupId={gid}
          players={[
            ...members.slice(0, 2).map((m) => ({ uid: m.user_id as string | null, name: memberName(m) })),
            { uid: null, name: "" },
            { uid: null, name: "" },
          ].slice(0, 2)}
          onSaved={() => {
            setAdding(false);
            void onChange();
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tornei

function Tournaments({
  gid,
  tours,
  members,
  onCreated,
}: {
  gid: string;
  tours: Tournament[];
  members: GroupMember[];
  onCreated: (t: Tournament) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <section className="panel friends-section">
        <div className="grp-head-row">
          <h2>Tornei</h2>
          {!creating && (
            <button className="primary small-btn" onClick={() => setCreating(true)}>
              ＋ Nuovo torneo
            </button>
          )}
        </div>
        {tours.length === 0 && !creating && (
          <p className="muted small">
            Nessun torneo. Creane uno: scegli chi partecipa (anche ospiti senza profilo) e il formato;
            l'app fa gli abbinamenti turno per turno e tiene la classifica.
          </p>
        )}
        {tours.map((t) => {
          const c = champion(t.data, t.kind);
          return (
            <Link key={t.id} to={`/gruppi/${gid}/torneo/${t.id}`} className="friend-row friend-link">
              <span className="friend-avatar grp-avatar" aria-hidden>
                {t.status === "done" ? "🏆" : "⚔"}
              </span>
              <div className="friend-names">
                <div className="friends-name">{t.name}</div>
                <div className="muted small">
                  {kindLabel(t.kind)} · {t.data.players.length} giocatori ·{" "}
                  {t.status === "done"
                    ? `vinto da ${c?.name ?? "?"}`
                    : `turno ${currentRound(t.data)?.n ?? 1} di ${t.data.totalRounds}`}
                </div>
              </div>
              <span className="friend-chat-hint" aria-hidden>
                ›
              </span>
            </Link>
          );
        })}
      </section>
      {creating && <NewTournament gid={gid} members={members} onCancel={() => setCreating(false)} onCreated={onCreated} />}
    </>
  );
}

function NewTournament({
  gid,
  members,
  onCancel,
  onCreated,
}: {
  gid: string;
  members: GroupMember[];
  onCancel: () => void;
  onCreated: (t: Tournament) => void;
}) {
  const fr = useFriends();
  const b = useGroupsBackend();
  const [name, setName] = useState(() => `Torneo del ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`);
  const [kind, setKind] = useState<TKind>("swiss");
  const [bestOf, setBestOf] = useState<1 | 3>(3);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(members.map((m) => m.user_id)));
  const [guests, setGuests] = useState<string[]>([]);
  const [guest, setGuest] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const players = [
    ...members.filter((m) => picked.has(m.user_id)).map((m) => ({ uid: m.user_id, name: memberName(m) })),
    ...guests.map((g) => ({ uid: null, name: g })),
  ];

  async function create() {
    if (!b || !fr.uid) return;
    if (players.length < 2) return setErr("Servono almeno 2 giocatori.");
    if (players.length > 32) return setErr("Massimo 32 giocatori.");
    setBusy(true);
    setErr(null);
    try {
      const data = start(createData(players, kind, bestOf), kind);
      const t = await b.createTournament(fr.uid, gid, name.trim() || "Torneo", kind, data);
      onCreated(t);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  function addGuest() {
    const g = guest.trim();
    if (!g || guests.some((x) => x.toLowerCase() === g.toLowerCase())) return;
    setGuests((gs) => [...gs, g]);
    setGuest("");
  }

  return (
    <section className="panel friends-section grp-new-tour">
      <h2>Nuovo torneo</h2>
      <label className="field grp-field">
        <span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      <div className="lcs-label">Formato</div>
      <div className="grp-kinds">
        {KINDS.map((k) => (
          <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
            <b>{k.label}</b>
            <small>{k.hint}</small>
          </button>
        ))}
      </div>

      <div className="lcs-label">Incontri</div>
      <div className="lcs-pills wide">
        <button className={bestOf === 1 ? "on" : ""} onClick={() => setBestOf(1)}>
          <b>Partita secca</b>
          <small>1 partita</small>
        </button>
        <button className={bestOf === 3 ? "on" : ""} onClick={() => setBestOf(3)}>
          <b>Al meglio di 3</b>
          <small>vince chi ne fa 2</small>
        </button>
      </div>

      <div className="lcs-label">Partecipanti ({players.length})</div>
      <div className="grp-picks">
        {members.map((m) => (
          <label key={m.user_id} className={`grp-pick ${picked.has(m.user_id) ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={picked.has(m.user_id)}
              onChange={(e) =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(m.user_id);
                  else n.delete(m.user_id);
                  return n;
                })
              }
            />
            {memberName(m)}
          </label>
        ))}
        {guests.map((g) => (
          <span key={g} className="grp-pick on">
            {g} <small className="muted">(ospite)</small>
            <button className="link-btn" onClick={() => setGuests((gs) => gs.filter((x) => x !== g))} aria-label={`Togli ${g}`}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <form
        className="row grp-guest"
        onSubmit={(e) => {
          e.preventDefault();
          addGuest();
        }}
      >
        <input
          className="friends-search"
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          placeholder="Aggiungi un ospite senza profilo"
          maxLength={30}
        />
        <button type="submit" className="ghost" disabled={!guest.trim()}>
          ＋
        </button>
      </form>
      {players.length >= 2 && (
        <p className="muted small">
          {kind === "roundrobin"
            ? `${players.length % 2 === 0 ? players.length - 1 : players.length} turni, ognuno gioca contro tutti.`
            : kind === "swiss"
              ? `${Math.ceil(Math.log2(players.length))} turni.`
              : `${Math.ceil(Math.log2(players.length))} turni fino alla finale.`}
          {players.length % 2 === 1 && kind !== "elimination" && " Con un numero dispari, a ogni turno uno riposa (vale come vittoria)."}
        </p>
      )}
      {err && <p className="account-error">{err}</p>}
      <div className="row">
        <button className="primary" onClick={create} disabled={busy || players.length < 2}>
          {busy ? "Creo…" : "⚔ Crea e sorteggia il primo turno"}
        </button>
        <button className="ghost" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Membri

function Members({
  group,
  members,
  onChange,
}: {
  group: Group;
  members: GroupMember[];
  onChange: () => Promise<void>;
}) {
  const fr = useFriends();
  const b = useGroupsBackend();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const isOwner = group.owner === fr.uid;
  const inGroup = new Set(members.map((m) => m.user_id));
  const addable = fr.friends.filter((f) => !inGroup.has(f.id));

  async function run(key: string, f: () => Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await f();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="panel friends-section">
        <h2>Membri ({members.length})</h2>
        {members.map((m) => {
          const online = fr.friends.find((f) => f.id === m.user_id)?.online || m.user_id === fr.uid;
          return (
            <div key={m.user_id} className="friend-row">
              <UserAvatar name={memberName(m)} avatar={m.profile?.avatar} online={online} />
              <div className="friend-names">
                <div className="friends-name">
                  {memberName(m)} {m.user_id === fr.uid && <span className="muted small">(tu)</span>}
                </div>
                <div className="muted small">
                  {m.profile ? `@${m.profile.username}` : ""}
                  {m.user_id === group.owner ? " · ha creato il gruppo" : ""}
                </div>
              </div>
              {isOwner && m.user_id !== fr.uid && (
                <button
                  className="ghost small-btn"
                  disabled={busy === m.user_id}
                  onClick={() =>
                    void run(m.user_id, async () => {
                      await b!.removeMember(group.id, m.user_id);
                      await onChange();
                    })
                  }
                >
                  Togli
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel friends-section">
        <h2>Aggiungi amici</h2>
        {addable.length === 0 ? (
          <p className="muted small">
            {fr.friends.length === 0 ? (
              <>
                Non hai ancora amici: aggiungili in <Link to="/amici">Amici</Link>.
              </>
            ) : (
              "Tutti i tuoi amici sono già nel gruppo."
            )}
          </p>
        ) : (
          addable.map((f) => (
            <div key={f.id} className="friend-row">
              <UserAvatar
                name={f.profile?.display_name || f.profile?.username || "?"}
                avatar={f.profile?.avatar}
                online={f.online}
              />
              <div className="friend-names">
                <div className="friends-name">{f.profile?.display_name || f.profile?.username}</div>
                <div className="muted small">@{f.profile?.username}</div>
              </div>
              <button
                className="primary small-btn"
                disabled={busy === f.id}
                onClick={() =>
                  void run(f.id, async () => {
                    await b!.addMember(group.id, fr.uid!, f.id);
                    await onChange();
                  })
                }
              >
                Aggiungi
              </button>
            </div>
          ))
        )}
        <p className="muted small">
          Nel gruppo puoi aggiungere solo i tuoi amici; ogni membro può aggiungere i propri.
        </p>
      </section>

      {err && <p className="account-error">{err}</p>}

      <section className="panel friends-section">
        <h2>Gruppo</h2>
        {isOwner &&
          (rename !== null ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void run("rename", async () => {
                  await b!.renameGroup(group.id, rename.trim());
                  setRename(null);
                  await onChange();
                });
              }}
            >
              <input className="friends-search" value={rename} onChange={(e) => setRename(e.target.value)} maxLength={40} />
              <button className="primary" disabled={!rename.trim()}>
                Salva
              </button>
            </form>
          ) : (
            <button className="ghost" onClick={() => setRename(group.name)}>
              ✎ Rinomina
            </button>
          ))}{" "}
        {confirm ? (
          <div className="grp-danger-box">
            <p>
              {confirm === "delete"
                ? "Eliminare il gruppo con tutte le partite e i tornei? Non si può annullare."
                : "Uscire dal gruppo? Per rientrare un membro dovrà aggiungerti di nuovo."}
            </p>
            <button
              className="primary danger"
              onClick={() =>
                void run("bye", async () => {
                  if (confirm === "delete") await b!.deleteGroup(group.id);
                  else await b!.removeMember(group.id, fr.uid!);
                  nav("/gruppi");
                })
              }
            >
              {confirm === "delete" ? "Elimina il gruppo" : "Esci"}
            </button>{" "}
            <button className="ghost" onClick={() => setConfirm(null)}>
              Annulla
            </button>
          </div>
        ) : isOwner ? (
          <button className="ghost danger-text" onClick={() => setConfirm("delete")}>
            🗑 Elimina il gruppo
          </button>
        ) : (
          <button className="ghost danger-text" onClick={() => setConfirm("leave")}>
            Esci dal gruppo
          </button>
        )}
      </section>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
