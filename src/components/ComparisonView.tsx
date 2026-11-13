// Confronto tra due mazzi: percentuale stimata + spiegazione dei fattori.

import { Comparison } from "../compare";

interface ComparisonViewProps {
  comparison: Comparison;
  nameA: string;
  nameB: string;
  title: string;
  /** probabilità A del confronto precedente, per mostrare il delta (post-side). */
  prevProbA?: number;
}

export function ComparisonView({
  comparison,
  nameA,
  nameB,
  title,
  prevProbA,
}: ComparisonViewProps) {
  const a = Math.round(comparison.probAFavored * 100);
  const b = 100 - a;
  const delta =
    prevProbA !== undefined
      ? Math.round((comparison.probAFavored - prevProbA) * 100)
      : undefined;

  return (
    <div className="comparison">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="versus">
        <div className="side">
          <div className="pct" style={{ color: "var(--accent)" }}>
            {a}%
          </div>
          <div style={{ fontSize: 13 }}>{nameA}</div>
        </div>
        <div className="vs">
          vs
          {delta !== undefined && delta !== 0 && (
            <div
              className={delta > 0 ? "delta-up" : "delta-down"}
              style={{ fontSize: 12, marginTop: 4 }}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% post-side
            </div>
          )}
        </div>
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

      <details className="explain">
        <summary>Perché questi numeri? (fattori del confronto)</summary>
        <div className="factors-legend">
          <span className="fav-a">A</span> = {nameA} ·{" "}
          <span className="fav-b">B</span> = {nameB}
        </div>
        <div className="factors-wrap">
          <table className="factors">
            <thead>
              <tr>
                <th>Fattore</th>
                <th className="num fav-a">A</th>
                <th className="num fav-b">B</th>
                <th className="num">Peso</th>
                <th>Favorisce</th>
              </tr>
            </thead>
            <tbody>
              {comparison.factors.map((f) => {
                const favA = f.contribA > f.contribB + 0.05;
                const favB = f.contribB > f.contribA + 0.05;
                return (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td className="num">{f.a.toFixed(1)}</td>
                    <td className="num">{f.b.toFixed(1)}</td>
                    <td className="num">×{f.weight}</td>
                    <td className={favA ? "fav-a" : favB ? "fav-b" : ""}>
                      {favA ? "A" : favB ? "B" : "pari"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <strong>Punteggio totale</strong>
                </td>
                <td className="num">
                  <strong>{comparison.scoreA.toFixed(1)}</strong>
                </td>
                <td className="num">
                  <strong>{comparison.scoreB.toFixed(1)}</strong>
                </td>
                <td className="num" />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="explain-text" style={{ marginTop: 8 }}>
          La percentuale nasce dalla differenza dei punteggi totali passata in
          una curva logistica (differenze piccole → vicino a 50/50, differenze
          grandi → si allontanano). I punteggi sommano quattro fattori, ciascuno
          moltiplicato per il suo peso.
        </div>
      </details>

      <div className="disclaimer">
        <strong>⚠️ Non è una win-rate reale.</strong> È una stima che combina la
        velocità/consistenza in solitaria (goldfish) con l'interazione sulla
        carta (rimozioni, counter, spazzavia vs minacce). Non simula la partita
        vera con blocchi, sequenze e decisioni: usala per confrontare i motori e
        capire il matchup, non come previsione dell'esito. Il mana include ora
        terre e ramp (mana dork/rock e ricerca terre), in modo semplificato.
      </div>
    </div>
  );
}
