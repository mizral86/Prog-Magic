// Pagina "Amici": nome utente, ricerca e richieste di amicizia, amici online
// e chat con ciascun amico (/amici/:id).

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import {
  Message,
  Profile,
  REPORT_REASONS,
  ReportReason,
  shownName,
  suggestUsername,
  validUsername,
} from "../friends";
import { FriendEntry, useFriends } from "../friendsContext";
import { parseInvite } from "../onlineGame";
import { FriendsTabs } from "./GroupsPage";
import AvatarPicker from "../components/AvatarPicker";
import UserAvatar from "../components/UserAvatar";

export default function FriendsPage() {
  const fr = useFriends();
  const auth = useAuth();
  const { id } = useParams();

  if (fr.status === "loading") {
    return (
      <Shell>
        <p className="muted">Caricamento…</p>
      </Shell>
    );
  }
  if (fr.status === "off") {
    return (
      <Shell>
        <div className="panel friends-empty">
          <p>Per aggiungere amici, vederli online e scrivergli serve un profilo.</p>
          {auth.status === "disabled" ? (
            <p className="muted small">L'accesso con profilo non è attivo su questa installazione.</p>
          ) : (
            <Link to="/account" className="primary-link">
              Accedi o crea un profilo
            </Link>
          )}
        </div>
      </Shell>
    );
  }
  if (fr.status === "setup") {
    return (
      <Shell>
        <div className="panel friends-empty">
          <p>
            La sezione Amici non è ancora attiva sul server: va fatto una volta un passaggio su
            Supabase (incollare il file <code>supabase/friends.sql</code> nell'editor SQL).
          </p>
        </div>
      </Shell>
    );
  }
  if (fr.status === "error") {
    return (
      <Shell>
        <div className="panel friends-empty">
          <p className="account-error">Non riesco a caricare gli amici: {fr.error}</p>
          <button type="button" className="ghost" onClick={() => window.location.reload()}>
            Riprova
          </button>
        </div>
      </Shell>
    );
  }
  if (fr.status === "needProfile") {
    return (
      <Shell>
        <ProfileForm />
      </Shell>
    );
  }
  if (id) return <Chat friendId={id} />;
  return <FriendsHome />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page friends-page">
      <h1 className="page-title">Amici</h1>
      <FriendsTabs />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nome utente

function ProfileForm({ onDone }: { onDone?: () => void }) {
  const fr = useFriends();
  const auth = useAuth();
  const meta = auth.user?.user_metadata ?? {};
  const fallbackName =
    (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? "";
  const [username, setUsername] = useState(
    fr.me?.username ?? suggestUsername(auth.user?.email ?? fallbackName ?? ""),
  );
  const [display, setDisplay] = useState(fr.me?.display_name ?? fallbackName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = validUsername(username);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await fr.saveProfile(username, display.trim() || null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel friends-profile-form" onSubmit={submit}>
      {!fr.me && (
        <p>
          Scegli il tuo <b>nome utente</b>: è quello che i tuoi amici cercano per aggiungerti. La tua
          email resta privata (ti trova per email solo chi la conosce già).
        </p>
      )}
      <label className="field account-field">
        <span>Nome utente</span>
        <div className="friends-at">
          <span>@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
            maxLength={20}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </div>
      </label>
      {!ok && (
        <p className="muted small">Da 3 a 20 caratteri: lettere minuscole, numeri, _ e punto.</p>
      )}
      <label className="field account-field">
        <span>Nome da mostrare (facoltativo)</span>
        <input value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={40} />
      </label>
      {error && <p className="account-error">{error}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={!ok || busy}>
          {busy ? "Salvo…" : fr.me ? "Salva" : "Continua"}
        </button>
        {onDone && fr.me && (
          <button type="button" className="ghost" onClick={onDone}>
            Annulla
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Elenco amici e richieste

function FriendsHome() {
  const fr = useFriends();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const me = fr.me!;

  return (
    <Shell>
      {editing ? (
        <ProfileForm onDone={() => setEditing(false)} />
      ) : (
        <div className="panel friends-me">
          <button
            type="button"
            className="avatar-edit"
            onClick={() => setPicking(true)}
            title="Cambia immagine profilo"
            aria-label="Cambia immagine profilo"
          >
            <Avatar profile={me} online />
            <span className="avatar-edit-badge" aria-hidden>✎</span>
          </button>
          <div className="friends-me-text">
            <div className="friends-name">{shownName(me)}</div>
            <div className="muted small">
              Il tuo nome utente: <b>@{me.username}</b>
            </div>
          </div>
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>
            Modifica
          </button>
        </div>
      )}

      {picking && (
        <AvatarPicker current={me.avatar} onPick={fr.saveAvatar} onClose={() => setPicking(false)} />
      )}

      {fr.error && <p className="account-error">{fr.error}</p>}

      <AddFriend />

      {fr.incoming.length > 0 && (
        <section className="panel friends-section">
          <h2>Richieste ricevute</h2>
          {fr.incoming.map((e) => (
            <div key={e.friendship.id} className="friend-row">
              <Avatar profile={e.profile} />
              <Names entry={e} />
              <ActionButton className="primary small-btn" onClick={() => fr.accept(e.friendship.id)}>
                Accetta
              </ActionButton>
              <ActionButton className="ghost small-btn" onClick={() => fr.remove(e.friendship.id)}>
                Rifiuta
              </ActionButton>
              <ActionButton
                className="link-btn small danger"
                onClick={async () => {
                  if (window.confirm(blockQuestion(e.profile))) await fr.block(e.id);
                }}
              >
                Blocca
              </ActionButton>
            </div>
          ))}
        </section>
      )}

      <section className="panel friends-section">
        <h2>
          I tuoi amici{" "}
          {fr.friends.length > 0 && (
            <span className="muted small">
              · {fr.friends.filter((f) => f.online).length} online su {fr.friends.length}
            </span>
          )}
        </h2>
        {fr.friends.length === 0 ? (
          <p className="muted small">
            Ancora nessun amico. Cercali qui sopra per nome utente o email: quando accettano la
            richiesta li vedi qui, con il pallino verde quando sono online.
          </p>
        ) : (
          fr.friends.map((e) => (
            <Link key={e.friendship.id} to={`/amici/${e.id}`} className="friend-row friend-link">
              <Avatar profile={e.profile} online={e.online} />
              <Names entry={e} />
              {e.unread > 0 ? (
                <span className="friends-unread" aria-label={`${e.unread} messaggi non letti`}>
                  {e.unread}
                </span>
              ) : (
                <span className="friend-chat-hint" aria-hidden>
                  💬
                </span>
              )}
            </Link>
          ))
        )}
      </section>

      {fr.outgoing.length > 0 && (
        <section className="panel friends-section">
          <h2>Richieste inviate</h2>
          {fr.outgoing.map((e) => (
            <div key={e.friendship.id} className="friend-row">
              <Avatar profile={e.profile} />
              <div className="friend-names">
                <div className="friends-name">{shownName(e.profile)}</div>
                <div className="muted small">In attesa che accetti</div>
              </div>
              <ActionButton className="ghost small-btn" onClick={() => fr.remove(e.friendship.id)}>
                Annulla
              </ActionButton>
            </div>
          ))}
        </section>
      )}

      {fr.blocked.length > 0 && (
        <section className="panel friends-section">
          <h2>Utenti bloccati</h2>
          <p className="muted small">
            Non possono scriverti, mandarti richieste né trovarti nella ricerca. Non ricevono avvisi
            del blocco.
          </p>
          {fr.blocked.map((p) => (
            <div key={p.id} className="friend-row">
              <Avatar profile={p} />
              <div className="friend-names">
                <div className="friends-name">{shownName(p)}</div>
                <div className="muted small">@{p.username}</div>
              </div>
              <ActionButton className="ghost small-btn" onClick={() => fr.unblock(p.id)}>
                Sblocca
              </ActionButton>
            </div>
          ))}
        </section>
      )}
    </Shell>
  );
}

function AddFriend() {
  const fr = useFriends();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      fr.search(t)
        .then((r) => {
          if (alive) {
            setResults(r);
            setError(null);
          }
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => alive && setSearching(false));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function relation(id: string): FriendEntry["friendship"] | undefined {
    return [...fr.friends, ...fr.incoming, ...fr.outgoing].find((e) => e.id === id)?.friendship;
  }

  return (
    <section className="panel friends-section">
      <h2>Aggiungi un amico</h2>
      <input
        className="friends-search"
        type="search"
        placeholder="Nome utente o email esatta"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {error && <p className="account-error">{error}</p>}
      {searching && <p className="muted small">Cerco…</p>}
      {!searching && results && results.length === 0 && (
        <p className="muted small">Nessuno trovato. Controlla il nome utente (lo trovi nella sua pagina Amici).</p>
      )}
      {results?.map((p) => {
        const f = relation(p.id);
        return (
          <div key={p.id} className="friend-row">
            <Avatar profile={p} />
            <div className="friend-names">
              <div className="friends-name">{shownName(p)}</div>
              <div className="muted small">@{p.username}</div>
            </div>
            {!f ? (
              <ActionButton className="primary small-btn" onClick={() => fr.sendRequest(p.id)}>
                Aggiungi
              </ActionButton>
            ) : f.status === "accepted" ? (
              <Link to={`/amici/${p.id}`} className="muted small">
                Già amici · Scrivi
              </Link>
            ) : f.requester === fr.uid ? (
              <span className="muted small">Richiesta inviata</span>
            ) : (
              <ActionButton className="primary small-btn" onClick={() => fr.accept(f.id)}>
                Accetta
              </ActionButton>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Names({ entry }: { entry: FriendEntry }) {
  return (
    <div className="friend-names">
      <div className="friends-name">{shownName(entry.profile)}</div>
      <div className="muted small">
        {entry.friendship.status === "pending" ? (
          entry.profile ? `@${entry.profile.username}` : ""
        ) : (
          <Presence online={entry.online} lastSeen={entry.profile?.last_seen} />
        )}
      </div>
    </div>
  );
}

function Presence({ online, lastSeen }: { online: boolean; lastSeen?: string | null }) {
  if (online) return <span className="friends-online-text">Online</span>;
  return <>{lastSeen ? `Visto ${formatAgo(lastSeen)}` : "Offline"}</>;
}

function Avatar({ profile, online }: { profile: Profile | undefined | null; online?: boolean }) {
  return <UserAvatar name={shownName(profile)} avatar={profile?.avatar} online={online} />;
}

function ActionButton({
  className,
  onClick,
  children,
}: {
  className: string;
  onClick: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="friend-action">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onClick();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && <span className="account-error small">{error}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chat

function Chat({ friendId }: { friendId: string }) {
  const fr = useFriends();
  const navigate = useNavigate();
  const entry = fr.friends.find((e) => e.id === friendId);
  const pending = [...fr.incoming, ...fr.outgoing].find((e) => e.id === friendId);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const blockedNow = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isFriend = !!entry;
  const { backend, uid } = fr;

  // Carica la conversazione e ascolta i messaggi nuovi.
  useEffect(() => {
    if (!backend || !uid || !isFriend) return;
    let alive = true;
    fr.setActiveChat(friendId);
    fr.clearUnread(friendId);
    backend
      .conversation(uid, friendId)
      .then((m) => {
        if (!alive) return;
        setMessages(m);
        if (m.some((x) => x.receiver === uid && !x.read_at))
          void backend.markRead(uid, friendId).catch(() => undefined);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    const stop = fr.onMessage((m, kind) => {
      const mine = m.sender === uid && m.receiver === friendId;
      const theirs = m.sender === friendId && m.receiver === uid;
      if (!mine && !theirs) return;
      setMessages((list) => {
        if (!list) return list;
        if (kind === "update") return list.map((x) => (x.id === m.id ? m : x));
        if (list.some((x) => x.id === m.id)) return list;
        return [...list, m];
      });
      if (theirs && kind === "new" && document.visibilityState === "visible")
        void backend.markRead(uid, friendId).catch(() => undefined);
    });
    // Tornando nell'app con la chat aperta: segna letti i messaggi arrivati.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void backend
        .conversation(uid, friendId)
        .then((m) => {
          if (!alive) return;
          setMessages(m);
          if (m.some((x) => x.receiver === uid && !x.read_at)) void backend.markRead(uid, friendId);
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      stop();
      fr.setActiveChat(null);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, uid, friendId, isFriend]);

  // Scorre in fondo quando arrivano messaggi.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !backend || !uid || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await backend.send(uid, friendId, body.slice(0, 2000));
      setText("");
      setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  async function blockFriend() {
    if (!entry) return;
    setMenu(false);
    if (!window.confirm(blockQuestion(entry.profile))) return;
    try {
      await fr.block(friendId);
      navigate("/amici");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeFriend() {
    if (!entry) return;
    setMenu(false);
    if (!window.confirm(`Togliere ${shownName(entry.profile)} dagli amici? Non potrete più scrivervi.`))
      return;
    try {
      await fr.remove(entry.friendship.id);
      navigate("/amici");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!entry) {
    return (
      <Shell>
        <div className="panel friends-empty">
          <p>
            {pending
              ? "Potete scrivervi quando la richiesta di amicizia è accettata."
              : "Questa persona non è tra i tuoi amici."}
          </p>
          <Link to="/amici" className="link-btn">
            ← Torna agli amici
          </Link>
        </div>
      </Shell>
    );
  }

  const lastMineIdx = messages ? messages.map((m) => m.sender === uid).lastIndexOf(true) : -1;

  return (
    <div className="page friends-page chat-page">
      <div className="chat-head">
        <Link to="/amici" className="icon-btn" aria-label="Torna agli amici">
          ←
        </Link>
        <Avatar profile={entry.profile} online={entry.online} />
        <div className="friend-names">
          <div className="friends-name">{shownName(entry.profile)}</div>
          <div className="muted small">
            <Presence online={entry.online} lastSeen={entry.profile?.last_seen} />
          </div>
        </div>
        <Link to={`/gioca?sfida=${friendId}`} className="primary-link small-btn" title="Gioca al Tavolo contro questo amico">
          ⚔ Sfida
        </Link>
        <div className="chat-menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-label="Altre azioni"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            ⋯
          </button>
          {menu && (
            <div className="chat-menu" role="menu">
              <button type="button" role="menuitem" onClick={removeFriend}>
                Togli amico
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setReporting(true);
                }}
              >
                Segnala
              </button>
              <button type="button" role="menuitem" className="danger" onClick={blockFriend}>
                Blocca
              </button>
            </div>
          )}
        </div>
      </div>

      {reporting && (
        <ReportDialog
          profile={entry.profile}
          onClose={() => {
            setReporting(false);
            if (blockedNow.current) {
              void fr.refresh();
              navigate("/amici");
            }
          }}
          onSend={async (reason, details, alsoBlock) => {
            await fr.report(friendId, reason, details, alsoBlock);
            blockedNow.current = alsoBlock;
          }}
        />
      )}

      <div className="chat-list" ref={listRef}>
        {messages === null && !error && <p className="muted small chat-note">Caricamento…</p>}
        {messages?.length === 0 && (
          <p className="muted small chat-note">
            Nessun messaggio. Scrivi il primo a {shownName(entry.profile)}!
          </p>
        )}
        {messages?.map((m, i) => {
          const mine = m.sender === uid;
          const inv = parseInvite(m.body);
          const day = dayLabel(m.created_at);
          const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== day;
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={`chat-bubble ${mine ? "mine" : "theirs"}`}>
                {inv ? (
                  <span className="chat-text chat-invite">
                    <span>{inv.text}</span>
                    {mine ? (
                      <Link to="/gioca">Apri il tavolo</Link>
                    ) : (
                      <Link to={`/gioca?partita=${inv.gameId}&contro=${m.sender}`}>⚔ Accetta la sfida</Link>
                    )}
                  </span>
                ) : (
                  <span className="chat-text">{m.body}</span>
                )}
                <span className="chat-time">{timeLabel(m.created_at)}</span>
              </div>
              {mine && i === lastMineIdx && m.read_at && <div className="chat-read">Letto</div>}
            </div>
          );
        })}
      </div>

      {error && <p className="account-error">{error}</p>}

      <form className="chat-form" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Scrivi un messaggio…"
          rows={1}
          maxLength={2000}
          aria-label="Messaggio"
        />
        <button type="submit" className="primary" disabled={!text.trim() || sending}>
          Invia
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocca e segnala

function blockQuestion(p: Profile | undefined | null): string {
  return (
    `Bloccare ${shownName(p)}? Non potrà più scriverti, mandarti richieste né trovarti nella ` +
    "ricerca, e non sarete più amici. Puoi sbloccarlo in fondo alla pagina Amici."
  );
}

function ReportDialog({
  profile,
  onClose,
  onSend,
}: {
  profile: Profile | undefined;
  onClose: () => void;
  onSend: (reason: ReportReason, details: string, alsoBlock: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(reason, details, alsoBlock);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal report-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h2>Segnala {shownName(profile)}</h2>
        {done ? (
          <>
            <p>Grazie, segnalazione inviata. La controlleremo il prima possibile.</p>
            <button type="button" className="primary" onClick={onClose}>
              Chiudi
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              Insieme alla segnalazione inviamo una copia degli ultimi messaggi tra voi, così possiamo
              verificare. {shownName(profile)} non saprà chi l'ha segnalato.
            </p>
            <fieldset className="report-reasons">
              <legend>Motivo</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.id}>
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label className="field account-field">
              <span>Dettagli (facoltativo)</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            <label className="report-block">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
              Blocca anche {shownName(profile)}
            </label>
            {error && <p className="account-error">{error}</p>}
            <div className="row">
              <button type="submit" className="primary danger" disabled={!reason || busy}>
                {busy ? "Invio…" : "Invia segnalazione"}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                Annulla
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date

function formatAgo(iso: string): string {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return "poco fa";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "un'ora fa" : `${h} ore fa`;
  const days = Math.round(h / 24);
  if (days === 1) return "ieri";
  if (days < 7) return `${days} giorni fa`;
  return `il ${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (d.toDateString() === yest.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
