// UI del solitario GIOCABILE: fai tu le scelte (mulligan, terra, magie).
// Gestisce un InteractiveGame in un ref e forza il re-render con un contatore.

import { useRef, useState } from "react";
import { InteractiveGame, PermInPlay } from "../sim/interactive";
import { CardInfo, Color } from "../types";
import { CardThumb } from "./CardThumb";

interface Props {
  deck: CardInfo[];
  lookup: Map<string, CardInfo>;
  onPlay: boolean;
}

export function InteractivePlay({ deck, lookup, onPlay }: Props) {
  const gameRef = useRef<InteractiveGame | null>(null);
  if (!gameRef.current) {
    gameRef.current = new InteractiveGame(deck, (Math.random() * 2 ** 32) >>> 0, onPlay);
  }
  const g = gameRef.current;
  const [, setV] = useState(0);
  const bump = () => setV((v) => v + 1);
  const s = g.snapshot();

  if (s.phase === "mulligan") {
    return (
      <div className="iplay">
        <div className="iplay-bar">
          <strong>Mano d'apertura</strong>
          {s.mulligansTaken > 0 && (
            <span className="muted small">
              mulligan {s.mulligansTaken} · terrai {7 - s.mulligansTaken}
            </span>
          )}
        </div>
        <div className="thumb-row">
          {s.hand.map((c, i) => (
            <CardThumb key={i} name={c.name} lookup={lookup} size={64} />
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button
            className="primary"
            onClick={() => {
              g.keep();
              bump();
            }}
          >
            Tieni ({7 - s.mulligansTaken})
          </button>
          <button
            className="ghost"
            onClick={() => {
              g.mulligan();
              bump();
            }}
            disabled={s.mulligansTaken >= 6}
          >
            Mulligan
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Mulligan alla londinese: peschi sempre 7; tenendo, le carte in eccesso
          (scelte in automatico) vanno in fondo.
        </p>
      </div>
    );
  }

  return (
    <div className="iplay">
      <div className="iplay-bar">
        <span className="play-turn">Turno {s.turn}</span>
        <span className="muted small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {s.availableMana} mana
          {s.availableColors.length > 0 && <ColorDots colors={s.availableColors} />}
          · libreria {s.libraryCount}
        </span>
        <button
          className="primary"
          onClick={() => {
            g.endTurn();
            bump();
          }}
        >
          Passa turno ⏭
        </button>
      </div>

      <Zone title="🌱 Terre" cards={s.lands.map((l) => l.card)} lookup={lookup} empty="nessuna terra" />
      <PermZone perms={s.permanents} lookup={lookup} />
      {s.graveyard.length > 0 && (
        <div className="muted small" style={{ margin: "4px 2px 8px" }}>
          🪦 Cimitero: {s.graveyard.length} (
          {s.graveyard.slice(-3).map((c) => c.name).join(", ")}
          {s.graveyard.length > 3 ? "…" : ""})
        </div>
      )}

      <div className="play-zone">
        <div className="play-zone-head">✋ Mano · {s.hand.length}</div>
        {s.hand.length === 0 ? (
          <div className="muted small play-zone-empty">mano vuota</div>
        ) : (
          <div className="ihand">
            {s.hand.map((c, i) => (
              <div className="ihand-card" key={i}>
                <CardThumb name={c.name} lookup={lookup} size={64} />
                {c.isLand ? (
                  <button
                    className="ghost ism"
                    disabled={!s.playableLand[i]}
                    onClick={() => {
                      g.playLand(i);
                      bump();
                    }}
                    title={s.landPlayedThisTurn ? "Terra già giocata questo turno" : "Gioca terra"}
                  >
                    Gioca
                  </button>
                ) : (
                  <button
                    className="ghost ism"
                    disabled={!s.castable[i]}
                    onClick={() => {
                      g.cast(i);
                      bump();
                    }}
                    title={s.castable[i] ? "Lancia" : "Mana insufficiente"}
                  >
                    Lancia {c.cmc > 0 ? `(${c.cmc})` : ""}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="explain" style={{ marginTop: 10 }}>
        <summary>Log delle mosse</summary>
        <div className="ilog">
          {s.log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ColorDots({ colors }: { colors: Color[] }) {
  return (
    <span className="color-dots">
      {colors.map((c) => (
        <span key={c} className={`color-dot ${c}`} />
      ))}
    </span>
  );
}

function Zone({
  title,
  cards,
  lookup,
  empty,
}: {
  title: string;
  cards: CardInfo[];
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
          {cards.map((c, i) => (
            <CardThumb key={i} name={c.name} lookup={lookup} size={50} />
          ))}
        </div>
      )}
    </div>
  );
}

function PermZone({
  perms,
  lookup,
}: {
  perms: PermInPlay[];
  lookup: Map<string, CardInfo>;
}) {
  return (
    <div className="play-zone">
      <div className="play-zone-head">
        🧱 Permanenti
        <span className="muted small"> · {perms.length}</span>
      </div>
      {perms.length === 0 ? (
        <div className="muted small play-zone-empty">nessun permanente</div>
      ) : (
        <div className="thumb-row">
          {perms.map((p, i) => {
            const creature = p.card.categories.includes("creature");
            return (
              <div className="thumb-tagged" key={i}>
                <CardThumb name={p.card.name} lookup={lookup} size={54} />
                {creature && p.card.power != null && (
                  <span className="thumb-tag">
                    {p.card.power}/{p.card.toughness ?? 0}
                  </span>
                )}
                {p.summoningSick && <span className="thumb-tag warn">malato</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
