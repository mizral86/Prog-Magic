// Risultati del simulatore interattivo: win-rate reale + log di una partita.

import { BattleResult } from "../sim/battle";
import { CardInfo } from "../types";
import { CardThumb } from "./CardThumb";

interface Props {
  result: BattleResult;
  nameA: string;
  nameB: string;
  lookup: Map<string, CardInfo>;
}

export function BattleResultView({ result, nameA, nameB, lookup }: Props) {
  const a = Math.round(result.winRateA * 100);
  const b = 100 - a;

  return (
    <div className="comparison">
      <h2 style={{ marginTop: 0 }}>Win-rate simulata (partite interattive)</h2>
      <div className="versus">
        <div className="side">
          <div className="pct" style={{ color: "var(--accent)" }}>
            {a}%
          </div>
          <div style={{ fontSize: 13 }}>{nameA}</div>
        </div>
        <div className="vs">vs</div>
        <div className="side">
          <div className="pct" style={{ color: "var(--accent-2)" }}>
            {b}%
          </div>
          <div style={{ fontSize: 13 }}>{nameB}</div>
        </div>
      </div>
      <div className="prob-bar">
        <div className="a" style={{ width: `${a}%` }} />
        <div className="b" style={{ width: `${b}%` }} />
      </div>

      <div className="stat-cards" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <div className="value">{result.games.toLocaleString("it-IT")}</div>
          <div className="label">Partite giocate</div>
        </div>
        <div className="stat-card">
          <div className="value">{result.avgTurns.toFixed(1)}</div>
          <div className="label">Turni medi</div>
        </div>
        <div className="stat-card">
          <div className="value">{result.draws}</div>
          <div className="label">Pareggi (limite turni)</div>
        </div>
      </div>

      <details className="explain">
        <summary>Log di una partita di esempio</summary>
        <div className="battle-log">
          {result.sampleLog.map((line, i) => (
            <div key={i} className={`bl-line${line.head ? " bl-head" : ""}`}>
              <span className="bl-text">{line.text}</span>
              {line.cards && line.cards.length > 0 && (
                <span className="bl-thumbs">
                  {line.cards.map((n, j) => (
                    <CardThumb key={j} name={n} lookup={lookup} size={30} />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </details>

      <div className="disclaimer">
        <strong>Modello semplificato.</strong> Il motore gioca davvero (vita,
        creature, combattimento, rimozioni, spazzavia, counter, burn, ramp) ma
        deduce gli effetti dai ruoli/numeri delle carte: non conosce il testo
        specifico, le abilità attivate o i trigger complessi, e i planeswalker
        sono approssimati a creature. È una win-rate reale <em>nei limiti di
        questo modello</em>, non una simulazione di MTG completa.
      </div>
    </div>
  );
}
