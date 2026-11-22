// Chat con l'amico, compatta, da aprire sopra il tavolo durante la partita.

import { locale } from "../i18n";
import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Message } from "../friends";
import { useFriends } from "../friendsContext";
import { parseInvite } from "../onlineGame";

export function GameChat({
  friendId,
  friendName,
  onClose,
}: {
  friendId: string;
  friendName: string;
  onClose: () => void;
}) {
  const fr = useFriends();
  const { backend, uid } = fr;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!backend || !uid) return;
    let alive = true;
    fr.setActiveChat(friendId);
    fr.clearUnread(friendId);
    backend
      .conversation(uid, friendId)
      .then((m) => {
        if (!alive) return;
        setMessages(m.slice(-80));
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
      if (theirs && kind === "new") void backend.markRead(uid, friendId).catch(() => undefined);
    });
    return () => {
      alive = false;
      stop();
      fr.setActiveChat(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, uid, friendId]);

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

  return (
    <div className="tt-chat" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tt-chat-head">
        <strong>💬 {friendName}</strong>
        <button className="tt-btn" onClick={onClose} aria-label="Chiudi la chat">
          ✕
        </button>
      </div>
      <div className="chat-list tt-chat-list" ref={listRef}>
        {messages === null && !error && <p className="muted small chat-note">Caricamento…</p>}
        {messages?.length === 0 && <p className="muted small chat-note">Nessun messaggio.</p>}
        {messages?.map((m) => {
          const inv = parseInvite(m.body);
          return (
            <div key={m.id} className={`chat-bubble ${m.sender === uid ? "mine" : "theirs"}`}>
              <span className="chat-text" translate={inv ? undefined : "no"}>{inv ? `⚔ Sfida al Tavolo` : m.body}</span>
              <span className="chat-time">
                {new Date(m.created_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
      {error && <p className="account-error small">{error}</p>}
      <form className="chat-form" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Scrivi…"
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
