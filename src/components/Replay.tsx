// Replay turno-per-turno di una partita rappresentativa (goldfish), con immagini.

import { useState } from "react";
import { GameLog } from "../sim/engine";
import { CardInfo } from "../types";
import { CardThumb } from "./CardThumb";

interface ReplayProps {
  game: GameLog;
  deckName: string;
  lookup: Map<string, CardInfo>;
}

export function Replay({ game, deckName, lookup }: ReplayProps) {
  const [upTo, setUpTo] = useState(game.turns.length);

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

          <div className="turn-detail">
            {t.drew && (
              <span style={{ marginRight: 8 }}>
                Pesca: <span className="mono">{t.drew}</span>
              </span>
            )}
            {!t.playedLand && (
              <span style={{ color: "var(--warn)" }}>nessuna terra giocata</span>
            )}
            {t.cast.length === 0 && t.playedLand && (
              <span style={{ color: "var(--muted)" }}>
                gioca terra, nessuna magia
              </span>
            )}
            {t.rampLands > 0 && (
              <span className="pill land" style={{ marginLeft: 6 }}>
                🌱 ramp: +{t.rampLands} terra
              </span>
            )}
          </div>

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
