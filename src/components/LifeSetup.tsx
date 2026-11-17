// Preparazione del segnapunti (pagina Gioca): numero di giocatori, vita
// iniziale, nomi, colore o illustrazione di ciascuno. Poi apre il segnapunti
// a tutto schermo. La partita resta salvata nel telefono e si può riprendere.

import { useEffect, useState } from "react";
import { deckCoverUrl, useDecks } from "../decks";
import {
  LcGame,
  LcSetup,
  loadGame,
  loadSetup,
  newGame,
  saveLc,
  Tint,
  TINTS,
} from "../lifeCounter";
import { searchCards } from "../scryfall";
import { Group, GroupMember, memberName, useGroupsBackend } from "../groups";
import { useFriends } from "../friendsContext";
import { LifeCounter } from "./LifeCounter";

const LIFE_PRESETS = [
  { life: 20, label: "20", sub: "Standard, Modern…", commander: false },
  { life: 25, label: "25", sub: "Brawl", commander: true },
  { life: 30, label: "30", sub: "Due Teste", commander: false },
  { life: 40, label: "40", sub: "Commander", commander: true },
];

export function LifeSetup() {
  const [setup, setSetup] = useState<LcSetup>(loadSetup);
  const [game, setGame] = useState<LcGame | null>(loadGame);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);

  useEffect(() => saveLc(setup, game), [setup, game]);

  // Gruppi di amici: i giocatori si possono scegliere tra i membri, così la
  // partita si registra già con i nomi giusti.
  const fr = useFriends();
  const groupsBackend = useGroupsBackend();
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  useEffect(() => {
    if (!groupsBackend || !fr.uid) return;
    groupsBackend
      .myGroups(fr.uid)
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [groupsBackend, fr.uid]);
  const groupId = groups.some((g) => g.id === setup.groupId) ? setup.groupId : undefined;
  useEffect(() => {
    if (!groupsBackend || !groupId) return setMembers([]);
    let alive = true;
    groupsBackend
      .members(groupId)
      .then((ms) => alive && setMembers(ms))
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [groupsBackend, groupId]);

  const setPlayer = (i: number, patch: Partial<LcSetup["players"][number]>) =>
    setSetup((s) => ({
      ...s,
      players: s.players.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    }));

  function start() {
    setGame(newGame({ ...setup, groupId }));
    setOpen(true);
  }

  const customLife = !LIFE_PRESETS.some((p) => p.life === setup.startLife);

  return (
    <div className="lcs">
      {game && (
        <div className="lcs-resume">
          <div>
            <strong>Partita in corso</strong>
            <div className="muted small">
              {game.players.map((p) => `${p.name} ${p.life}`).join(" · ")}
            </div>
          </div>
          <button className="primary" onClick={() => setOpen(true)}>
            ↩ Riprendi
          </button>
        </div>
      )}

      <div className="lcs-block">
        <div className="lcs-label">Giocatori</div>
        <div className="lcs-pills">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              className={setup.count === n ? "on" : ""}
              onClick={() => setSetup((s) => ({ ...s, count: n }))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="lcs-block">
        <div className="lcs-label">Punti vita iniziali</div>
        <div className="lcs-pills wide">
          {LIFE_PRESETS.map((p) => (
            <button
              key={p.life}
              className={setup.startLife === p.life ? "on" : ""}
              onClick={() =>
                setSetup((s) => ({ ...s, startLife: p.life, commander: p.commander }))
              }
            >
              <b>{p.label}</b>
              <small>{p.sub}</small>
            </button>
          ))}
          <label className={`lcs-custom ${customLife ? "on" : ""}`}>
            <small>Altro</small>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              placeholder="…"
              value={customLife ? setup.startLife : ""}
              onChange={(e) =>
                setSetup((s) => ({
                  ...s,
                  startLife: Math.max(1, Math.min(999, Number(e.target.value) || 20)),
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="lcs-block lcs-checks">
        <label className="field">
          <input
            type="checkbox"
            checked={setup.commander}
            onChange={(e) => setSetup((s) => ({ ...s, commander: e.target.checked }))}
          />
          Danni da comandante e lanci del comandante
        </label>
        <label className="field">
          <input
            type="checkbox"
            checked={setup.rotate}
            onChange={(e) => setSetup((s) => ({ ...s, rotate: e.target.checked }))}
          />
          Gira i riquadri verso ogni giocatore (telefono al centro del tavolo)
        </label>
      </div>

      {groups.length > 0 && (
        <div className="lcs-block">
          <div className="lcs-label">Gruppo di amici</div>
          <select
            className="lcs-group"
            value={groupId ?? ""}
            onChange={(e) => setSetup((s) => ({ ...s, groupId: e.target.value || undefined }))}
          >
            <option value="">Nessuno (partita libera)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {groupId && (
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Scegli chi gioca tra i membri: a fine partita la registri nel gruppo con un tocco.
            </p>
          )}
        </div>
      )}

      <div className="lcs-block">
        <div className="lcs-label">Chi gioca</div>
        <div className="lcs-players">
          {setup.players.slice(0, setup.count).map((p, i) => (
            <div className="lcs-player" key={i}>
              <button
                className={`lcs-swatch tint-${p.tint}`}
                style={p.art ? { backgroundImage: `url("${p.art}")` } : undefined}
                onClick={() => setPicker(i)}
                title="Scegli colore o immagine"
              >
                <span>✎</span>
              </button>
              {groupId && members.length > 0 && (
                <select
                  className="lcs-member"
                  value={members.some((m) => m.user_id === p.uid) ? p.uid : ""}
                  onChange={(e) => {
                    const m = members.find((x) => x.user_id === e.target.value);
                    setPlayer(i, m ? { uid: m.user_id, name: memberName(m).slice(0, 18) } : { uid: undefined });
                  }}
                  aria-label={`Membro del gruppo per il giocatore ${i + 1}`}
                >
                  <option value="">Ospite</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberName(m)}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={p.name}
                maxLength={18}
                onChange={(e) => setPlayer(i, { name: e.target.value, uid: undefined })}
                onFocus={(e) => e.target.select()}
                aria-label={`Nome giocatore ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      <button className="primary lcs-start" onClick={start}>
        {game ? "▶ Nuova partita con questi giocatori" : "▶ Inizia la partita"}
      </button>
      <p className="muted small" style={{ marginTop: 8 }}>
        Nel segnapunti: tocca la metà sinistra di un riquadro per togliere vita,
        la destra per aggiungerla (tieni premuto per contare veloce). Sotto al
        numero ci sono veleno, energia e gli altri segnalini. Il simbolo ✦ al
        centro apre dadi, moneta e “chi inizia”.
      </p>

      {picker !== null && (
        <LookPicker
          tint={setup.players[picker].tint}
          art={setup.players[picker].art}
          name={setup.players[picker].name}
          onPick={(patch) => setPlayer(picker, patch)}
          onClose={() => setPicker(null)}
        />
      )}

      {open && game && (
        <LifeCounter game={game} onChange={setGame} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function LookPicker({
  tint,
  art,
  name,
  onPick,
  onClose,
}: {
  tint: Tint;
  art?: string;
  name: string;
  onPick: (p: { tint?: Tint; art?: string }) => void;
  onClose: () => void;
}) {
  const { decks } = useDecks();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const covers = decks
    .map((d) => ({ name: d.name, url: deckCoverUrl(d) }))
    .filter((c): c is { name: string; url: string } => !!c.url);

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await searchCards(q);
      const list = r
        .filter((c) => c.artCropUrl)
        .slice(0, 12)
        .map((c) => ({ name: c.printedName ?? c.name, url: c.artCropUrl! }));
      setResults(list);
      if (!list.length) setErr("Nessuna carta trovata.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lcs-sheet-veil" onClick={onClose}>
      <div className="lcs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lcs-sheet-head">
          <strong>Aspetto di {name}</strong>
          <button className="ghost" onClick={onClose}>
            Fatto
          </button>
        </div>

        <div className="lcs-label">Colore</div>
        <div className="lcs-tints">
          {TINTS.map((t) => (
            <button
              key={t.id}
              className={`lcs-tint tint-${t.id} ${tint === t.id ? "on" : ""}`}
              onClick={() => onPick({ tint: t.id })}
              title={t.label}
              aria-label={t.label}
            />
          ))}
        </div>

        <div className="lcs-label">
          Immagine di sfondo
          {art && (
            <button className="ghost small" onClick={() => onPick({ art: undefined })}>
              Togli immagine
            </button>
          )}
        </div>
        {covers.length > 0 && (
          <>
            <div className="muted small">Dai tuoi mazzi</div>
            <div className="lcs-arts">
              {covers.map((c) => (
                <button
                  key={c.name + c.url}
                  className={art === c.url ? "on" : ""}
                  style={{ backgroundImage: `url("${c.url}")` }}
                  onClick={() => onPick({ art: c.url })}
                  title={c.name}
                >
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <form
          className="lcs-search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca una carta (es. il tuo comandante)"
          />
          <button className="primary" disabled={busy}>
            {busy ? "…" : "Cerca"}
          </button>
        </form>
        {err && <div className="muted small">{err}</div>}
        {results.length > 0 && (
          <div className="lcs-arts">
            {results.map((c) => (
              <button
                key={c.url}
                className={art === c.url ? "on" : ""}
                style={{ backgroundImage: `url("${c.url}")` }}
                onClick={() => onPick({ art: c.url })}
                title={c.name}
              >
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
