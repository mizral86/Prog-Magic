// Sezione "Gioca": carica un mazzo e avanza turno per turno (solitario
// goldfish) con la visualizzazione del tavolo. Riusa il motore di simulazione
// giocando UNA partita riproducibile (seed) e mostrandone lo stato passo-passo.

import { useMemo, useState } from "react";
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
import { SAMPLE_A, SAMPLE_B } from "../sampleDecks";

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

  const [selId, setSelId] = useState(options[0]?.id ?? "sample:a");
  const [onPlay, setOnPlay] = useState(true);

  const [deck, setDeck] = useState<CardInfo[] | null>(null);
  const [deckLabel, setDeckLabel] = useState("");
  const [lookup, setLookup] = useState<Map<string, CardInfo>>(new Map());

  const [game, setGame] = useState<GameLog | null>(null);
  const [turnIdx, setTurnIdx] = useState(0); // 0 = solo mano iniziale
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setDeck(expanded);
      setDeckLabel(opt.label);
      setLookup(cards);
      setGame(playSingleGame(expanded, { ...cfg, onPlay }, freshSeed()));
      setTurnIdx(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function reshuffle() {
    if (!deck) return;
    setGame(playSingleGame(deck, { ...cfg, onPlay }, freshSeed()));
    setTurnIdx(0);
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
        Solitario goldfish: carica un mazzo e avanza turno per turno per vedere
        come si sviluppa il tavolo. Le scelte sono automatiche (stessa euristica
        del simulatore).
      </p>

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
        <label className="field">
          <input
            type="checkbox"
            checked={onPlay}
            onChange={(e) => setOnPlay(e.target.checked)}
          />
          In gioco (no pescata al T1)
        </label>
        <button className="primary" onClick={loadAndPlay} disabled={loading}>
          {loading ? "Carico…" : game ? "Cambia mazzo" : "Gioca"}
        </button>
      </div>

      {error && (
        <div className="status-line error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {game && (
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

function freshSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
