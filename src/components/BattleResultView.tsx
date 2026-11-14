// Risultati del simulatore interattivo: win-rate reale + log di una partita.

import { Fragment, useEffect, useState } from "react";
import { BattleResult, TOKEN_A, TOKEN_B } from "../sim/battle";
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
  const [pick, setPick] = useState(0);
  useEffect(() => setPick(0), [result]);
  const scenarios = result.scenarios ?? [];
  const scen = scenarios[pick] ?? scenarios[0];
  const lines = scen ? scen.lines : result.sampleLog;
  const nameOf = (w: "A" | "B") => (w === "A" ? nameA : nameB);
  const pct = (w: number, g: number) =>
    g > 0 ? `${Math.round((w / g) * 100)}%` : "—";
  const pl = result.play;

  // Sostituisce i segnaposto dei giocatori con i nomi colorati dei mazzi.
  const render = (text: string) =>
    text.split(/(⟦A⟧|⟦B⟧)/).map((part, i) =>
      part === TOKEN_A ? (
        <strong key={i} className="bl-a">
          {nameA}
        </strong>
      ) : part === TOKEN_B ? (
        <strong key={i} className="bl-b">
          {nameB}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );

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
          <div className="value" style={{ color: "var(--accent)" }}>
            {result.winsA.toLocaleString("it-IT")}
          </div>
          <div className="label">Vinte da {nameA}</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: "var(--accent-2)" }}>
            {result.winsB.toLocaleString("it-IT")}
          </div>
          <div className="label">Vinte da {nameB}</div>
        </div>
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

      {pl && pl.aPlayGames + pl.aDrawGames > 0 && (
        <div className="play-draw small">
          <div>
            <strong className="bl-a">{nameA}</strong> vince il{" "}
            {pct(pl.aPlayWins, pl.aPlayGames)} quando inizia e il{" "}
            {pct(pl.aDrawWins, pl.aDrawGames)} quando pesca.
          </div>
          <div>
            <strong className="bl-b">{nameB}</strong> vince il{" "}
            {pct(pl.aDrawGames - pl.aDrawWins, pl.aDrawGames)} quando inizia e
            il {pct(pl.aPlayGames - pl.aPlayWins, pl.aPlayGames)} quando pesca.
          </div>
        </div>
      )}

      <div className="panel scen-box">
        <h3 className="stat-title">Partite di esempio</h3>
        <p className="muted small" style={{ margin: "0 0 8px" }}>
          Tre partite tipiche, vinte in proporzione alla win-rate e di durata
          vicina alla media. Turno per turno, i due mazzi si rispondono.
        </p>
        {scenarios.length > 0 && (
          <select
            className="scen-select"
            value={pick}
            onChange={(e) => setPick(Number(e.target.value))}
            aria-label="Partita di esempio"
          >
            {scenarios.map((sc, i) => (
              <option key={i} value={i}>
                {`Partita ${i + 1}: ${
                  sc.winner === "draw"
                    ? "pareggio"
                    : `vince ${nameOf(sc.winner)}`
                } al turno ${sc.turns} · inizia ${nameOf(sc.onPlay)}`}
              </option>
            ))}
          </select>
        )}
        <div className="battle-log">
          {lines.map((line, i) => (
            <div key={i} className={`bl-line${line.head ? " bl-head" : ""}`}>
              <span className="bl-text">{render(line.text)}</span>
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
      </div>

      <div className="disclaimer">
        <strong>Modello semplificato.</strong> Il motore gioca davvero (mani
        iniziali e mulligan, terre, vita, creature, combattimento con blocchi,
        rimozioni, spazzavia, counter, burn, ramp, prospero, rapidità, lampo,
        volare, legame vitale, tocco letale, cautela, attacchi alla mano,
        trigger "quando entra" e "ogni volta che una creatura entra") ma deduce
        gli effetti dai ruoli/numeri delle carte: non conosce ogni testo
        specifico, le abilità attivate o i trigger complessi (es. blink), e i
        planeswalker sono approssimati a creature.
      </div>
    </div>
  );
}
