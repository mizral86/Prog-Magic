// Pannello statistiche di un singolo mazzo.

import { COLORS } from "../types";
import { SimStats } from "../sim/engine";
import { Bar } from "./Bar";

export interface CurveBucket {
  label: string;
  count: number;
}

interface StatsViewProps {
  stats: SimStats;
  curve: CurveBucket[];
  landCount: number;
  deckSize: number;
}

const COLOR_NAMES: Record<string, string> = {
  W: "Bianco",
  U: "Blu",
  B: "Nero",
  R: "Rosso",
  G: "Verde",
};

export function StatsView({ stats, curve, landCount, deckSize }: StatsViewProps) {
  const maxTurns = stats.config.maxTurns;
  const turns = Array.from({ length: maxTurns }, (_, i) => i + 1);
  const maxCurve = Math.max(1, ...curve.map((c) => c.count));
  const maxMana = Math.max(maxTurns, ...stats.avgManaByTurn);

  // Colori effettivamente presenti nel mazzo (ultimo turno > 0).
  const activeColors = COLORS.filter(
    (c) => stats.colorAvailByTurn[c][maxTurns] > 0.001,
  );

  return (
    <div>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="value">{(stats.keepableRate * 100).toFixed(0)}%</div>
          <div className="label">Mani tenute a 7</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.avgMulligans.toFixed(2)}</div>
          <div className="label">Mulligan medi</div>
        </div>
        <div className="stat-card">
          <div className="value">{formatTurn(stats.avgOnlineTurn, maxTurns)}</div>
          <div className="label">
            Turno medio "attivo" (cmc ≥ {stats.keyCmc})
          </div>
        </div>
        <div className="stat-card">
          <div className="value">
            {landCount}
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {" "}
              /{deckSize}
            </span>
          </div>
          <div className="label">Terre nel mazzo</div>
        </div>
      </div>

      <div className="chart">
        <h3>Curva di mana (magie per CMC)</h3>
        {curve.map((b) => (
          <Bar
            key={b.label}
            label={b.label}
            value={b.count}
            fraction={b.count / maxCurve}
            display={String(b.count)}
          />
        ))}
      </div>

      <div className="chart">
        <h3>Terre in gioco per turno (media)</h3>
        {turns.map((t) => (
          <Bar
            key={t}
            label={`T${t}`}
            value={stats.avgLandsByTurn[t]}
            fraction={stats.avgLandsByTurn[t] / maxTurns}
            display={stats.avgLandsByTurn[t].toFixed(1)}
          />
        ))}
      </div>

      <div className="chart">
        <h3>Mana disponibile per turno (terre + ramp)</h3>
        {turns.map((t) => (
          <Bar
            key={t}
            label={`T${t}`}
            value={stats.avgManaByTurn[t]}
            fraction={stats.avgManaByTurn[t] / maxMana}
            display={stats.avgManaByTurn[t].toFixed(1)}
          />
        ))}
      </div>

      <div className="chart">
        <h3>Probabilità "deck attivo" entro il turno</h3>
        {turns.map((t) => (
          <Bar
            key={t}
            label={`T${t}`}
            value={stats.onlineRateByTurn[t]}
            fraction={stats.onlineRateByTurn[t]}
            display={`${(stats.onlineRateByTurn[t] * 100).toFixed(0)}%`}
          />
        ))}
      </div>

      {activeColors.length > 0 && (
        <div className="chart">
          <h3>Disponibilità colore (prob. fonte entro il turno)</h3>
          {activeColors.map((c) => (
            <div key={c} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 2,
                }}
              >
                <span className={`color-dot ${c}`} /> {COLOR_NAMES[c]}
              </div>
              <div className="row" style={{ gap: 3 }}>
                {turns.map((t) => (
                  <span
                    key={t}
                    title={`T${t}: ${(
                      stats.colorAvailByTurn[c][t] * 100
                    ).toFixed(0)}%`}
                    style={{
                      flex: 1,
                      height: 18,
                      borderRadius: 3,
                      background: `rgba(124,92,255,${
                        0.12 + stats.colorAvailByTurn[c][t] * 0.85
                      })`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Da T1 (sinistra) a T{maxTurns} (destra); più intenso = più probabile.
          </div>
        </div>
      )}
    </div>
  );
}

function formatTurn(t: number, maxTurns: number): string {
  if (t > maxTurns) return `>${maxTurns}`;
  return `T${t.toFixed(1)}`;
}
