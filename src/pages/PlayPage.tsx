// Sezione "Gioca": carica un mazzo e avanza turno per turno (solitario
// goldfish) con la visualizzazione del tavolo. Riusa il motore di simulazione
// giocando UNA partita riproducibile (seed) e mostrandone lo stato passo-passo.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDecks } from "../decks";
import { deckToText } from "../deckIO";
import { parseDecklist } from "../deckParser";
import { resolveCards } from "../scryfall";
import {
  DEFAULT_CONFIG,
  GameLog,
  playSingleGame,
  SimConfig,
} from "../sim/engine";
import { CardInfo, CardCategory } from "../types";
import { CardThumb } from "../components/CardThumb";
import { Tabletop } from "../components/Tabletop";
import { SAMPLE_A, SAMPLE_B } from "../sampleDecks";
import { LifeSetup } from "../components/LifeSetup";
import { Learn } from "../components/Learn";
import { useFriends } from "../friendsContext";
import { shownName } from "../friends";
import {
  clearSavedGame,
  DeckCard,
  inviteBody,
  loadSavedGame,
  newGameId,
  SavedGame,
  saveGame,
} from "../onlineGame";
import { useTableNet } from "../useTableNet";
import { TableState } from "../tabletop";

/** Partita in due in corso. */
interface OnlineSession {
  gameId: string;
  friendId: string;
  friendName: string;
  host: boolean;
  initial: TableState | null;
  active: string | null;
}

const SAMPLES: { id: string; label: string; text: string }[] = [
  { id: "sample:a", label: "Esempio · Mono-Red Aggro", text: SAMPLE_A },
  { id: "sample:b", label: "Esempio · Azorius Control", text: SAMPLE_B },
];

const PERM_CATS: CardCategory[] = [
  "creature",
  "artifact",
  "enchantment",
  "planeswalker",
  "battle",
];

function isPermanent(name: string, lookup: Map<string, CardInfo>): boolean {
  const cats = lookup.get(name.toLowerCase())?.categories ?? [];
  return cats.some((c) => PERM_CATS.includes(c));
}

interface BoardPerm {
  name: string;
  enteredTurn: number;
}

// Ricostruisce le zone del tavolo dai primi `idx` turni.
function boardAt(turns: GameLog["turns"], idx: number, lookup: Map<string, CardInfo>) {
  const lands: string[] = [];
  const permanents: BoardPerm[] = [];
  for (let i = 0; i < idx; i++) {
    const t = turns[i];
    if (t.playedLand) lands.push(t.playedLand);
    for (let r = 0; r < t.rampLands; r++) lands.push("Terra (ramp)");
    for (const n of t.cast)
      if (isPermanent(n, lookup)) permanents.push({ name: n, enteredTurn: t.turn });
  }
  return { lands, permanents };
}

function isCreature(name: string, lookup: Map<string, CardInfo>): boolean {
  return (lookup.get(name.toLowerCase())?.categories ?? []).includes("creature");
}

// Potenza che può attaccare al turno `current`: creature non malate (entrate
// in un turno precedente). Coerente col clock di danno del motore.
function attackPower(
  permanents: BoardPerm[],
  current: number,
  lookup: Map<string, CardInfo>,
): number {
  let p = 0;
  for (const perm of permanents) {
    if (perm.enteredTurn >= current) continue; // malattia da evocazione
    if (!isCreature(perm.name, lookup)) continue;
    p += Math.max(0, lookup.get(perm.name.toLowerCase())?.power ?? 0);
  }
  return p;
}

export default function PlayPage() {
  const { decks } = useDecks();

  const options = useMemo(
    () => [
      ...decks.map((d) => ({ id: `deck:${d.id}`, label: d.name, text: deckToText(d) })),
      ...SAMPLES,
    ],
    [decks],
  );

  const fr = useFriends();
  const [params, setParams] = useSearchParams();
  const [selId, setSelId] = useState(options[0]?.id ?? "sample:a");
  // Avversario: "" = da solo, altrimenti l'id dell'amico da sfidare.
  const [vs, setVs] = useState("");
  // Sfida ricevuta (link dalla chat): partita da raggiungere.
  const [invite, setInvite] = useState<{ gameId: string; friendId: string } | null>(null);
  const [online, setOnline] = useState<OnlineSession | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(() => loadSavedGame(fr.uid));
  useEffect(() => setSaved(loadSavedGame(fr.uid)), [fr.uid]);
  const [onPlay, setOnPlay] = useState(true);

  const [deck, setDeck] = useState<CardInfo[] | null>(null);
  const [deckLabel, setDeckLabel] = useState("");
  const [lookup, setLookup] = useState<Map<string, CardInfo>>(new Map());

  const [game, setGame] = useState<GameLog | null>(null);
  const [turnIdx, setTurnIdx] = useState(0); // 0 = solo mano iniziale
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"interactive" | "auto" | "life" | "learn">(() => {
    if (params.get("sfida") || params.get("partita")) return "interactive";
    if (params.has("impara")) return "learn";
    const m = sessionStorage.getItem("mm.gioca.mode");
    return m === "life" || m === "learn" ? m : "interactive";
  });
  // Lezione da aprire subito (link "?impara=combattimento" da altre sezioni).
  const [learnStart, setLearnStart] = useState<string | null>(() => params.get("impara"));
  useEffect(() => {
    if (!params.has("impara")) return;
    setMode("learn");
    setLearnStart(params.get("impara"));
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Link da Amici o dalla chat (anche con la pagina già aperta); servono una volta sola.
  useEffect(() => {
    const sfida = params.get("sfida");
    const g = params.get("partita");
    const f = params.get("contro");
    if (!sfida && !g) return;
    setMode("interactive");
    // Sfida già accettata su questo telefono: si riprende quella partita.
    if (g && f && loadSavedGame(fr.uid)?.gameId !== g) setInvite({ gameId: g, friendId: f });
    else if (sfida) {
      setInvite(null);
      setVs(sfida);
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const friendName = (id: string) => shownName(fr.friends.find((f) => f.id === id)?.profile);
  const [intKey, setIntKey] = useState(0); // remonta il tavolo (nuova partita)
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("mm.gioca.mode", mode);
    if (mode !== "learn") setLearnStart(null);
  }, [mode]);

  const cfg: SimConfig = { ...DEFAULT_CONFIG, onPlay };

  async function loadAndPlay() {
    const opt = options.find((o) => o.id === selId);
    if (!opt) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = parseDecklist(opt.text);
      if (parsed.main.length === 0) {
        setError("Il mazzo selezionato non ha carte nel main.");
        return;
      }
      const { cards } = await resolveCards(parsed.main.map((l) => l.name));
      const expanded: CardInfo[] = [];
      for (const l of parsed.main) {
        const c = cards.get(l.name.toLowerCase());
        if (c) for (let i = 0; i < l.quantity; i++) expanded.push(c);
      }
      if (expanded.length < 7) {
        setError("Troppe poche carte risolte per giocare (controlla i nomi).");
        return;
      }
      // Partita con un amico: sfida accettata o nuova sfida (messaggio in chat).
      let session: OnlineSession | null = null;
      if (mode === "interactive" && invite) {
        session = {
          gameId: invite.gameId,
          friendId: invite.friendId,
          friendName: friendName(invite.friendId),
          host: false,
          initial: null,
          active: null,
        };
      } else if (mode === "interactive" && vs) {
        if (!fr.backend || !fr.uid) {
          setError("Per sfidare un amico devi aver fatto l'accesso.");
          return;
        }
        const gameId = newGameId();
        await fr.backend.send(fr.uid, vs, inviteBody(gameId, opt.label));
        session = { gameId, friendId: vs, friendName: friendName(vs), host: true, initial: null, active: null };
      }
      setDeck(expanded);
      setDeckLabel(opt.label);
      setLookup(cards);
      setOnline(session);
      setInvite(null);
      if (session) {
        const g: SavedGame = {
          uid: fr.uid!,
          gameId: session.gameId,
          friendId: session.friendId,
          friendName: session.friendName,
          host: session.host,
          deckLabel: opt.label,
          names: expanded.map((c) => c.name),
          state: null,
          active: null,
          savedAt: Date.now(),
        };
        saveGame(g);
        setSaved(g);
      }
      if (mode === "auto") {
        setGame(playSingleGame(expanded, { ...cfg, onPlay }, freshSeed()));
        setTurnIdx(0);
      } else {
        setGame(null);
        setIntKey((k) => k + 1);
        setTableOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Riprende la partita in due salvata su questo telefono.
  async function resume(g: SavedGame) {
    setLoading(true);
    setError(null);
    try {
      const { cards } = await resolveCards([...new Set(g.names)]);
      const expanded = g.names
        .map((n) => cards.get(n.toLowerCase()))
        .filter((c): c is CardInfo => !!c);
      setMode("interactive");
      setDeck(expanded);
      setDeckLabel(g.deckLabel);
      setLookup(cards);
      setGame(null);
      setInvite(null);
      setOnline({
        gameId: g.gameId,
        friendId: g.friendId,
        friendName: friendName(g.friendId) !== "Utente" ? friendName(g.friendId) : g.friendName,
        host: !!g.host,
        initial: g.state,
        active: g.active,
      });
      setIntKey((k) => k + 1);
      setTableOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function leaveOnline() {
    if (online && fr.uid) clearSavedGame(fr.uid, online.gameId);
    setSaved(null);
    setOnline(null);
    setTableOpen(false);
    setDeck(null);
  }

  function reshuffle() {
    if (!deck) return;
    if (mode === "auto") {
      setGame(playSingleGame(deck, { ...cfg, onPlay }, freshSeed()));
      setTurnIdx(0);
    } else {
      setIntKey((k) => k + 1);
    }
  }

  const turns = game?.turns ?? [];
  const maxIdx = turns.length;
  const snap = turnIdx > 0 ? turns[turnIdx - 1] : null;
  const board = game ? boardAt(turns, turnIdx, lookup) : { lands: [], permanents: [] };
  const hand = game ? (turnIdx === 0 ? game.openingHand : turns[turnIdx - 1].handAfter) : [];

  return (
    <div className="page">
      <h1 className="page-title">Gioca</h1>
      <p className="muted small" style={{ marginTop: -6 }}>
        <strong>Tavolo</strong> = solitario libero senza regole: trascini le
        carte dalla mano al campo, tappi, peschi;{" "}
        <strong>Automatico</strong> = guardi la partita giocata dall'euristica;{" "}
        <strong>Segnapunti</strong> = punti vita e segnalini per giocare dal
        vivo con gli amici, un solo telefono al centro del tavolo;{" "}
        <strong>Impara</strong> = le regole di Magic in brevi lezioni con esempi e quiz.
      </p>

      <div className="segmented" style={{ marginBottom: 10 }}>
        <button
          className={mode === "interactive" ? "on" : ""}
          onClick={() => setMode("interactive")}
        >
          🃏 Tavolo
        </button>
        <button
          className={mode === "auto" ? "on" : ""}
          onClick={() => setMode("auto")}
        >
          👁 Automatico
        </button>
        <button className={mode === "life" ? "on" : ""} onClick={() => setMode("life")}>
          ❤️ Segnapunti
        </button>
        <button className={mode === "learn" ? "on" : ""} onClick={() => setMode("learn")}>
          🎓 Impara
        </button>
      </div>

      {mode === "life" && <LifeSetup />}
      {mode === "learn" && <Learn start={learnStart} />}

      {mode !== "life" && mode !== "learn" && (
      <>

      {mode === "interactive" && saved && !online && !invite && (
        <div className="panel play-challenge">
          <p>
            ⚔ Partita in corso contro <b>{friendName(saved.friendId) !== "Utente" ? friendName(saved.friendId) : saved.friendName}</b>{" "}
            <span className="muted small">({saved.deckLabel})</span>
          </p>
          <div className="row">
            <button className="primary" onClick={() => resume(saved)} disabled={loading}>
              Riprendi
            </button>
            <button
              className="ghost"
              onClick={() => {
                clearSavedGame(saved.uid, saved.gameId);
                setSaved(null);
              }}
            >
              Chiudi la partita
            </button>
          </div>
        </div>
      )}

      {mode === "interactive" && invite && (
        <div className="panel play-challenge">
          <p>
            ⚔ <b>{friendName(invite.friendId)}</b> ti ha sfidato al Tavolo.
          </p>
          <p className="muted small">
            Scegli il tuo mazzo qui sotto e premi <b>Accetta la sfida</b>.{" "}
            <button className="link-btn" onClick={() => setInvite(null)}>
              Non ora
            </button>
          </p>
        </div>
      )}

      {mode === "interactive" && !invite && (
        <div className="play-vs">
          {fr.status === "ready" && fr.friends.length > 0 ? (
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              Contro
              <select value={vs} onChange={(e) => setVs(e.target.value)}>
                <option value="">Da solo (solitario)</option>
                <optgroup label="Sfida un amico">
                  {fr.friends.map((f) => (
                    <option key={f.id} value={f.id}>
                      {shownName(f.profile)}
                      {f.online ? " · online" : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          ) : (
            <span className="muted small">
              Vuoi giocare contro un amico?{" "}
              <Link to="/amici">Aggiungilo in Amici</Link>, poi sceglilo qui.
            </span>
          )}
        </div>
      )}

      <div className="play-setup">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          Mazzo
          <select
            value={selId}
            onChange={(e) => setSelId(e.target.value)}
            style={{ flex: 1 }}
          >
            {decks.length > 0 && (
              <optgroup label="I miei mazzi">
                {decks.map((d) => (
                  <option key={d.id} value={`deck:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Esempi">
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {!(mode === "interactive" && (vs || invite)) && (
          <label className="field">
            <input
              type="checkbox"
              checked={onPlay}
              onChange={(e) => setOnPlay(e.target.checked)}
            />
            In gioco (no pescata al T1)
          </label>
        )}
        <button className="primary" onClick={loadAndPlay} disabled={loading}>
          {loading
            ? "Carico…"
            : mode === "interactive" && invite
              ? "⚔ Accetta la sfida"
              : mode === "interactive" && vs
                ? "⚔ Sfida"
                : deck
                  ? "Ricarica"
                  : "Gioca"}
        </button>
      </div>

      {error && (
        <div className="status-line error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {mode === "interactive" && vs && !invite && !online && (
        <p className="muted small" style={{ marginTop: 6 }}>
          {friendName(vs)} riceve la sfida in chat: quando la accetta, vedete tutti e due il
          campo dell'altro e potete scrivervi dal tavolo (💬).
        </p>
      )}

      {deck && mode === "interactive" && online && fr.uid && (
        <>
          <div className="play-bar">
            <span className="play-turn">
              ⚔ {online.friendName} · {deckLabel}
            </span>
            <button className="primary" onClick={() => setTableOpen(true)}>
              🃏 Apri il tavolo
            </button>
          </div>
          <OnlineTable
            key={`${online.gameId}-${intKey}`}
            session={online}
            uid={fr.uid}
            myName={fr.me ? shownName(fr.me) : "Amico"}
            devMode={fr.devMode}
            names={deck.map((c) => c.name)}
            lookup={lookup}
            deckLabel={deckLabel}
            open={tableOpen}
            onClose={() => setTableOpen(false)}
            onLeave={leaveOnline}
          />
        </>
      )}

      {deck && mode === "interactive" && !online && (
        <>
          <div className="play-bar">
            <span className="play-turn">{deckLabel}</span>
            <button className="primary" onClick={() => setTableOpen(true)}>
              🃏 Apri il tavolo
            </button>
            <button
              className="ghost"
              onClick={() => {
                setIntKey((k) => k + 1);
                setTableOpen(true);
              }}
              title="Nuova partita (rimescola)"
            >
              🔀 Nuova partita
            </button>
          </div>
          <Tabletop
            key={intKey}
            names={deck.map((c) => c.name)}
            lookup={lookup}
            onPlay={onPlay}
            title={deckLabel}
            open={tableOpen}
            onClose={() => setTableOpen(false)}
          />
        </>
      )}

      {game && mode === "auto" && (
        <>
          <div className="play-bar">
            <button
              className="ghost"
              onClick={() => setTurnIdx((i) => Math.max(0, i - 1))}
              disabled={turnIdx === 0}
            >
              ◀ Indietro
            </button>
            <span className="play-turn">
              {turnIdx === 0 ? "Mano iniziale" : `Turno ${turnIdx}`}
              <span className="muted"> / {maxIdx}</span>
            </span>
            <button
              className="ghost"
              onClick={() => setTurnIdx((i) => Math.min(maxIdx, i + 1))}
              disabled={turnIdx >= maxIdx}
            >
              Avanza ▶
            </button>
            <button className="ghost" onClick={reshuffle} title="Nuova partita">
              🔀 Rimescola
            </button>
          </div>

          <div className="muted small" style={{ marginBottom: 8 }}>
            {deckLabel}
            {" · "}
            {game.mulligans === 0 ? "mano a 7" : `mulligan a ${7 - game.mulligans}`}
            {" · "}
            {game.onThePlay ? "in gioco" : "in risposta"}
          </div>

          {snap && (
            <div className="turn-card" style={{ marginBottom: 10 }}>
              <div className="turn-head">
                <span>Turno {snap.turn}</span>
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {snap.landsInPlay} terre · {snap.manaAvailable} mana
                  {snap.colorsAvailable.length > 0 && (
                    <span className="color-dots" style={{ marginLeft: 6 }}>
                      {snap.colorsAvailable.map((c) => (
                        <span key={c} className={`color-dot ${c}`} />
                      ))}
                    </span>
                  )}
                </span>
              </div>
              <div className="turn-detail">
                {snap.drew ? `Peschi ${snap.drew}. ` : ""}
                {snap.playedLand ? `Giochi ${snap.playedLand}. ` : "Niente terra. "}
                {snap.cast.length ? `Lanci: ${snap.cast.join(", ")}.` : "Nessuna magia."}
              </div>
            </div>
          )}

          <PlayZone title="🌱 Terre in gioco" cards={board.lands} lookup={lookup} empty="nessuna terra" />
          <PermZone
            permanents={board.permanents}
            currentTurn={turnIdx}
            lookup={lookup}
            attack={attackPower(board.permanents, turnIdx, lookup)}
          />
          <PlayZone
            title={`✋ Mano (${hand.length})`}
            cards={hand}
            lookup={lookup}
            empty="mano vuota"
          />
        </>
      )}
      </>
      )}
    </div>
  );
}

function PlayZone({
  title,
  cards,
  lookup,
  empty,
}: {
  title: string;
  cards: string[];
  lookup: Map<string, CardInfo>;
  empty: string;
}) {
  return (
    <div className="play-zone">
      <div className="play-zone-head">
        {title}
        <span className="muted small"> · {cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <div className="muted small play-zone-empty">{empty}</div>
      ) : (
        <div className="thumb-row">
          {cards.map((n, i) => (
            <CardThumb key={i} name={n} lookup={lookup} size={54} />
          ))}
        </div>
      )}
    </div>
  );
}

function PermZone({
  permanents,
  currentTurn,
  lookup,
  attack,
}: {
  permanents: BoardPerm[];
  currentTurn: number;
  lookup: Map<string, CardInfo>;
  attack: number;
}) {
  return (
    <div className="play-zone">
      <div className="play-zone-head">
        🧱 Permanenti
        <span className="muted small"> · {permanents.length}</span>
        {attack > 0 && (
          <span className="pill cast" style={{ marginLeft: 8 }}>
            ⚔ attacco: {attack}
          </span>
        )}
      </div>
      {permanents.length === 0 ? (
        <div className="muted small play-zone-empty">nessun permanente</div>
      ) : (
        <div className="thumb-row">
          {permanents.map((perm, i) => {
            const card = lookup.get(perm.name.toLowerCase());
            const creature = (card?.categories ?? []).includes("creature");
            const sick = perm.enteredTurn >= currentTurn;
            return (
              <div className="thumb-tagged" key={i}>
                <CardThumb name={perm.name} lookup={lookup} size={54} />
                {creature && card?.power != null && (
                  <span className="thumb-tag">
                    {card.power}/{card.toughness ?? 0}
                  </span>
                )}
                {sick && <span className="thumb-tag warn">malato</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tavolo collegato all'amico: rete + salvataggio sul telefono.
function OnlineTable({
  session,
  uid,
  myName,
  devMode,
  names,
  lookup,
  deckLabel,
  open,
  onClose,
  onLeave,
}: {
  session: OnlineSession;
  uid: string;
  myName: string;
  devMode: boolean;
  names: string[];
  lookup: Map<string, CardInfo>;
  deckLabel: string;
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  const cards = useMemo<DeckCard[]>(() => {
    const out: DeckCard[] = [];
    for (const n of new Set(names)) {
      const c = lookup.get(n.toLowerCase());
      out.push({
        name: n,
        printed: c?.printedName,
        img: c?.imageUrl ?? c?.imageSmallUrl,
        big: c?.imageLargeUrl,
        type: c?.typeLine,
      });
    }
    return out;
  }, [names, lookup]);

  const net = useTableNet({
    gameId: session.gameId,
    uid,
    friendId: session.friendId,
    friendName: session.friendName,
    myName,
    deckLabel,
    cards,
    host: session.host,
    initialActive: session.active,
    devMode,
  });

  const latest = useMemo(() => ({ state: session.initial as TableState | null }), [session]);
  const store = (state: TableState | null) =>
    saveGame({
      uid,
      gameId: session.gameId,
      friendId: session.friendId,
      friendName: net.friendName,
      host: session.host,
      deckLabel,
      names,
      state,
      active: net.active,
      savedAt: Date.now(),
    });

  useEffect(() => {
    if (latest.state) store(latest.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.active]);

  return (
    <Tabletop
      names={names}
      lookup={lookup}
      onPlay
      title={deckLabel}
      open={open}
      onClose={onClose}
      net={net}
      initial={session.initial}
      onState={(s) => {
        latest.state = s;
        store(s);
      }}
      onLeave={onLeave}
    />
  );
}

function freshSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
