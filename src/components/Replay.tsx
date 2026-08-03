// Replay turno-per-turno di una partita rappresentativa (goldfish), con immagini.

import { useState } from "react";
import { GameLog } from "../sim/engine";
import { CardInfo } from "../types";
import { CardThumb } from "./CardThumb";

interface ReplayProps {
  game: GameLog;
  deckName: string;
  lookup: Map<string, CardInfo>;
  /** CMC "chiave": la prima magia con cmc ≥ questo segna il "deck attivo". */
  keyCmc?: number;
}

// "A", "A e B", "A, B e C".
function listWithAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Replay({ game, deckName, lookup, keyCmc }: ReplayProps) {
  const [upTo, setUpTo] = useState(game.turns.length);

  const cmcOf = (name: string) => lookup.get(name.toLowerCase())?.cmc ?? 0;

  // Primo turno in cui viene lanciata una magia "chiave" (cmc ≥ keyCmc).
  const activeTurn = keyCmc
    ? game.turns.find((t) => t.cast.some((n) => cmcOf(n) >= keyCmc))?.turn
    : undefined;

  // Narrazione leggibile di un turno.
  function narrate(t: GameLog["turns"][number]): string {
    const clauses: string[] = [];
    if (t.drew) clauses.push(`peschi ${t.drew}`);
    else if (t.turn === 1 && game.onThePlay)
      clauses.push("nessuna pescata (sei in gioco)");
    if (t.playedLand) clauses.push(`giochi ${t.playedLand}`);
    else clauses.push("niente terra da giocare");
    if (t.cast.length) clauses.push(`lanci ${listWithAnd(t.cast)}`);
    else clauses.push("nessuna magia");
    return capitalize(clauses.join(", ")) + ".";
  }

  return (
    <div className="replay">
      <div className="replay-controls">
        <strong style={{ fontSize: 14 }}>{deckName}</strong>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {game.mulligans === 0
            ? "Mano tenuta a 7"
            : `Mulligan a ${7 - game.mulligans}`}
          {" · "}
          {game.onThePlay ? "in gioco" : "in risposta"}
        </span>
      </div>

      <div className="turn-card">
        <div className="turn-head">
          <span>Mano iniziale</span>
        </div>
        <div className="thumb-row">
          {game.openingHand.map((n, i) => (
            <CardThumb key={i} name={n} lookup={lookup} />
          ))}
        </div>
      </div>

      <div className="replay-controls">
        <label className="field">
          Mostra fino al turno
          <input
            type="range"
            min={1}
            max={game.turns.length}
            value={upTo}
            onChange={(e) => setUpTo(Number(e.target.value))}
          />
        </label>
        <span className="mono">T{upTo}</span>
      </div>

      {game.turns.slice(0, upTo).map((t) => (
        <div className="turn-card" key={t.turn}>
          <div className="turn-head">
            <span>Turno {t.turn}</span>
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              {t.landsInPlay} terre · {t.manaAvailable} mana
              {t.colorsAvailable.length > 0 && (
                <span className="color-dots" style={{ marginLeft: 6 }}>
                  {t.colorsAvailable.map((c) => (
                    <span key={c} className={`color-dot ${c}`} />
                  ))}
                </span>
              )}
            </span>
          </div>

          <div className="turn-detail">{narrate(t)}</div>

          {(t.turn === activeTurn ||
            (!t.playedLand && t.landsInPlay < t.turn) ||
            t.rampLands > 0) && (
            <div className="turn-badges">
              {t.turn === activeTurn && (
                <span className="pill" title={`Prima magia con cmc ≥ ${keyCmc}`}>
                  🔑 deck attivo
                </span>
              )}
              {!t.playedLand && t.landsInPlay < t.turn && (
                <span className="pill warn">⚠ salti la terra</span>
              )}
              {t.rampLands > 0 && (
                <span className="pill land">🌱 ramp: +{t.rampLands} terra</span>
              )}
            </div>
          )}

          {(t.playedLand || t.cast.length > 0) && (
            <div className="thumb-row">
              {t.playedLand && (
                <div className="thumb-tagged">
                  <CardThumb name={t.playedLand} lookup={lookup} size={50} />
                  <span className="thumb-tag land">terra</span>
                </div>
              )}
              {t.cast.map((n, i) => (
                <div className="thumb-tagged" key={i}>
                  <CardThumb name={n} lookup={lookup} size={50} />
                  <span className="thumb-tag cast">lancio</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
