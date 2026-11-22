// Foglio "Com'è andata?": registra una partita nel diario del mazzo.
// Si apre dal Tavolo, dal Segnapunti o dalla scheda "Partite" del mazzo, con
// i dati già noti compilati (risultato, chi ha iniziato, mulligan…).

import { useMemo, useState } from "react";
import { useDecks } from "../decks";
import { metaList, useMeta } from "../metagame";
import {
  addMatch,
  knownOppDecks,
  knownOpponents,
  MatchResult,
  MatchSource,
  useMatches,
} from "../matchLog";

export interface MatchSeat {
  id: string;
  name: string;
  /** Già eliminato dalla partita. */
  out: boolean;
}

interface Props {
  source: MatchSource;
  /** Mazzo già noto (id) oppure il suo nome (dal Tavolo). */
  deckId?: string;
  deckName?: string;
  result?: MatchResult;
  onPlay?: boolean;
  mulligans?: number;
  opponent?: string;
  oppDeck?: string;
  players?: number;
  turns?: number;
  /** Segnapunti: chi siede al tavolo e chi ha iniziato. */
  seats?: MatchSeat[];
  firstSeat?: string;
  onSaved: () => void;
  onClose: () => void;
}

const RESULTS: { id: MatchResult; icon: string; label: string }[] = [
  { id: "win", icon: "🏆", label: "Vinta" },
  { id: "loss", icon: "💀", label: "Persa" },
  { id: "draw", icon: "🤝", label: "Pareggio" },
];

export function MatchRecord(props: Props) {
  const { decks } = useDecks();
  const matches = useMatches();
  const meta = useMeta();
  const [deckId, setDeckId] = useState<string>(() => {
    if (props.deckId && decks.some((d) => d.id === props.deckId)) return props.deckId;
    const byName = props.deckName
      ? decks.find((d) => d.name.trim().toLowerCase() === props.deckName!.trim().toLowerCase())
      : undefined;
    if (byName) return byName.id;
    // Altrimenti l'ultimo mazzo registrato, o il più recente.
    const last = matches.find((m) => decks.some((d) => d.id === m.deckId));
    return last?.deckId ?? decks[0]?.id ?? "";
  });
  const [me, setMe] = useState<string>("");
  const [result, setResult] = useState<MatchResult | null>(props.result ?? null);
  const [onPlay, setOnPlay] = useState<boolean | undefined>(props.onPlay);
  const [mull, setMull] = useState<number>(props.mulligans ?? 0);
  const [opponent, setOpponent] = useState(props.opponent ?? "");
  const [oppDeck, setOppDeck] = useState(props.oppDeck ?? "");
  const [note, setNote] = useState("");

  const deck = decks.find((d) => d.id === deckId);
  const oppSuggestions = useMemo(() => {
    const names = [...knownOppDecks(matches)];
    if (deck) for (const a of metaList(meta, deck.format)) names.push(a.name);
    return [...new Set(names)].slice(0, 60);
  }, [matches, meta, deck]);
  const personSuggestions = useMemo(() => knownOpponents(matches).slice(0, 40), [matches]);

  // Segnapunti: scelto "io sono…", risultato, inizio e avversari vengono da soli.
  function pickMe(id: string) {
    setMe(id);
    const seats = props.seats ?? [];
    const mine = seats.find((s) => s.id === id);
    if (!mine) return;
    const alive = seats.filter((s) => !s.out);
    if (mine.out) setResult("loss");
    else if (alive.length === 1) setResult("win");
    if (props.firstSeat) setOnPlay(props.firstSeat === id);
    const others = seats.filter((s) => s.id !== id).map((s) => s.name);
    if (!props.opponent) setOpponent(others.join(", "));
  }

  function save() {
    if (!deck || !result) return;
    addMatch({
      deckId: deck.id,
      deckName: deck.name,
      result,
      onPlay,
      mulligans: mull,
      opponent: opponent.trim() || undefined,
      oppDeck: oppDeck.trim() || undefined,
      players: props.players ?? (props.seats ? props.seats.length : 2),
      turns: props.turns,
      source: props.source,
      note: note.trim() || undefined,
    });
    props.onSaved();
  }

  return (
    <div className="lcs-sheet-veil" onClick={props.onClose}>
      <div className="lcs-sheet grp-sheet mr-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lcs-sheet-head">
          <strong>Com'è andata?</strong>
          <button className="ghost" onClick={props.onClose}>
            Chiudi
          </button>
        </div>
        <p className="muted small mr-intro">
          La partita finisce nel diario del mazzo: in Mazzi → scheda <b>Partite</b> trovi vittorie,
          inizio/pesca e avversari.
        </p>

        {decks.length === 0 ? (
          <p className="muted">Crea prima un mazzo in Mazzi: il diario si tiene per i tuoi mazzi.</p>
        ) : (
          <>
            <label className="field grp-field">
              <span>Il tuo mazzo</span>
              <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {props.seats && props.seats.length > 0 && (
              <>
                <div className="lcs-label">Tu chi sei?</div>
                <div className="lcs-pills mr-seats">
                  {props.seats.map((s) => (
                    <button key={s.id} type="button" className={me === s.id ? "on" : ""} onClick={() => pickMe(s.id)}>
                      {s.out ? "💀 " : ""}
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="lcs-label">Risultato</div>
            <div className="lcs-pills wide mr-results">
              {RESULTS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`mr-${r.id} ${result === r.id ? "on" : ""}`}
                  onClick={() => setResult(r.id)}
                >
                  {r.icon}
                  <small>{r.label}</small>
                </button>
              ))}
            </div>

            <div className="lcs-label">Chi ha iniziato?</div>
            <div className="lcs-pills mr-start">
              <button type="button" className={onPlay === true ? "on" : ""} onClick={() => setOnPlay(true)}>
                Io
              </button>
              <button type="button" className={onPlay === false ? "on" : ""} onClick={() => setOnPlay(false)}>
                L'avversario
              </button>
              <button type="button" className={onPlay === undefined ? "on" : ""} onClick={() => setOnPlay(undefined)}>
                Non ricordo
              </button>
            </div>

            <div className="lcs-label">Mulligan</div>
            <div className="lcs-pills">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" className={mull === n ? "on" : ""} onClick={() => setMull(n)}>
                  {n === 3 ? "3+" : n}
                </button>
              ))}
            </div>

            <label className="field grp-field">
              <span>Mazzo dell'avversario (facoltativo)</span>
              <input
                value={oppDeck}
                onChange={(e) => setOppDeck(e.target.value)}
                list="mr-opp-decks"
                maxLength={60}
                placeholder="es. Mono Red, Azorius Control"
              />
              <datalist id="mr-opp-decks">
                {oppSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="field grp-field">
              <span>Avversario (facoltativo)</span>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                list="mr-opponents"
                maxLength={80}
                placeholder="Nome di chi hai sfidato"
              />
              <datalist id="mr-opponents">
                {personSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="field grp-field">
              <span>Nota (facoltativa)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="es. senza terre al turno 3"
              />
            </label>

            <button className="primary lcs-start" onClick={save} disabled={!deck || !result}>
              {result ? "📊 Salva nel diario" : "Scegli il risultato"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
