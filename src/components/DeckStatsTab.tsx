// Scheda "Statistiche" del mazzo: curva di mana per colore o tipo, costi e
// produzione di mana, tipi, tipi di creatura, pedine e analisi delle terre.

import { useMemo, useState } from "react";
import type { SavedDeck } from "../decks";
import {
  costPips,
  deckAnalysis,
  deckStats,
  deckTokens,
  manaProduction,
  stackedCurve,
  totalManaValue,
  typeLabel,
} from "../deckStats";
import { creatureTypeIt } from "../creatureTypes";
import { formatMoney } from "../prices";
import { TokenList } from "./DeckParts";

const COLOR_NAME: Record<string, string> = {
  W: "Bianco",
  U: "Blu",
  B: "Nero",
  R: "Rosso",
  G: "Verde",
  M: "Multicolore",
  C: "Incolore",
  generic: "Generico",
};
// Colori dei grafici: quelli del mana del tema (variabili --W…--G).
const COLOR_FILL: Record<string, string> = {
  W: "var(--W)",
  U: "var(--U)",
  B: "var(--B)",
  R: "var(--R)",
  G: "var(--G)",
  M: "var(--gold, #c9a54a)",
  C: "var(--C, #9a958f)",
  generic: "var(--panel-3)",
};
const TYPE_FILL: Record<string, string> = {
  creature: "var(--accent)",
  planeswalker: "var(--G)",
  instant: "var(--accent-2)",
  sorcery: "var(--R)",
  artifact: "var(--C, #9a958f)",
  enchantment: "var(--W)",
  battle: "var(--B)",
  other: "var(--panel-3)",
};

export function DeckStatsTab({ deck, enrichBusy }: { deck: SavedDeck; enrichBusy: boolean }) {
  const stats = useMemo(() => deckStats(deck), [deck]);
  const analysis = useMemo(() => deckAnalysis(deck), [deck]);
  const tokens = useMemo(() => deckTokens(deck), [deck]);
  const [by, setBy] = useState<"color" | "type">("color");
  const [withGeneric, setWithGeneric] = useState(false);
  const curve = useMemo(() => stackedCurve(deck, by), [deck, by]);
  const pips = useMemo(() => costPips(deck), [deck]);
  const prod = useMemo(() => manaProduction(deck), [deck]);
  const maxCurve = Math.max(1, ...curve.map((b) => b.total));
  const fill = by === "color" ? COLOR_FILL : TYPE_FILL;
  const legendKeys = [...new Set(curve.flatMap((b) => b.parts.map((p) => p.key)))];

  const costSlices = [
    ...Object.entries(pips.colors).map(([k, v]) => ({ key: k, value: v })),
    ...(withGeneric ? [{ key: "generic", value: pips.generic }] : []),
  ].filter((s) => s.value > 0);
  const prodSlices = Object.entries(prod)
    .map(([k, v]) => ({ key: k, value: v }))
    .filter((s) => s.value > 0);

  return (
    <div className="deck-stats">
      <div className="stat-cards">
        <div className="stat-card">
          <div className="value">{stats.mainCount}</div>
          <div className="label">Main ({stats.landCount} terre)</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.sideCount}</div>
          <div className="label">Sideboard</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.maybeCount}</div>
          <div className="label">
            Maybeboard
            {stats.maybeCount > 0 && ` · ${formatMoney(stats.maybePriceEur, "EUR")}`}
          </div>
        </div>
      </div>

      <div className="panel stat-panel">
        <h3 className="stat-title">Curva di mana</h3>
        <div className="mana-curve" role="img" aria-label="Curva di mana delle magie del main">
          {curve.map((b) => (
            <div key={b.label} className="mc-col">
              <span className="mc-n">{b.total || ""}</span>
              <span className="mc-stack" style={{ height: `${(b.total / maxCurve) * 100}%` }}>
                {b.parts.map((p) => (
                  <span
                    key={p.key}
                    className="mc-seg"
                    title={`${p.count} ${by === "color" ? COLOR_NAME[p.key] : typeLabel(p.key)}`}
                    style={{ flexGrow: p.count, background: fill[p.key] ?? "var(--panel-3)" }}
                  />
                ))}
              </span>
              <span className="mc-label">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="curve-foot">
          <div className="segmented">
            <button type="button" className={by === "color" ? "on" : ""} onClick={() => setBy("color")}>
              Colore
            </button>
            <button type="button" className={by === "type" ? "on" : ""} onClick={() => setBy("type")}>
              Tipo
            </button>
          </div>
          <div className="curve-nums">
            <span>
              Media <strong>{stats.avgCmc.toFixed(2)}</strong>
            </span>
            <span>
              Totale <strong>{totalManaValue(deck)}</strong>
            </span>
          </div>
        </div>
        <div className="chart-legend">
          {legendKeys.map((k) => (
            <span key={k}>
              <i style={{ background: fill[k] }} /> {by === "color" ? COLOR_NAME[k] : typeLabel(k)}
            </span>
          ))}
        </div>
      </div>

      <div className="pie-row">
        <div className="panel stat-panel">
          <h3 className="stat-title">Costi di mana</h3>
          <Pie slices={costSlices} empty="Nessun simbolo di mana." />
          <label className="switch-row">
            <input
              type="checkbox"
              checked={withGeneric}
              onChange={(e) => setWithGeneric(e.target.checked)}
            />
            Conta anche il mana generico
          </label>
        </div>
        <div className="panel stat-panel">
          <h3 className="stat-title">Produzione di mana</h3>
          <Pie
            slices={prodSlices}
            empty={enrichBusy ? "Carico i dati delle terre…" : "Nessuna carta produce mana."}
          />
          <p className="muted small" style={{ margin: "6px 0 0", textAlign: "center" }}>
            Copie del main che producono ogni colore (terre e acceleratori).
          </p>
        </div>
      </div>

      <div className="panel stat-panel">
        <h3 className="stat-title">Tipi (copie main)</h3>
        <div className="chips">
          {stats.types.map((t) => (
            <span key={t.label} className="chip">
              {t.label}: {t.count}
            </span>
          ))}
        </div>
        <h3 className="stat-title" style={{ marginTop: 14 }}>
          Tipi di creatura
        </h3>
        {stats.creatureTypes.length === 0 ? (
          <div className="muted small">Nessuna creatura nel main.</div>
        ) : (
          <div className="chips">
            {stats.creatureTypes.map((t) => (
              <span key={t.label} className="chip" title={t.label}>
                {creatureTypeIt(t.label)}: {t.count}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="panel stat-panel">
        <h3 className="stat-title">Pedine usate dal mazzo</h3>
        <TokenList tokens={tokens} loading={enrichBusy} />
      </div>

      {!analysis.empty && (
        <div className="panel stat-panel">
          <h3 className="stat-title">Terre e mano iniziale</h3>
          <div className="analysis-list">
            {analysis.items.map((it) => (
              <div key={it.label} className={`analysis-row ${it.verdict}`}>
                <span className="an-dot" />
                <span className="an-label">{it.label}</span>
                <span className="an-value">{it.value}</span>
                {it.note && <span className="an-note">{it.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Torta SVG con legenda (nome e numero per fetta). */
function Pie({ slices, empty }: { slices: { key: string; value: number }[]; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div className="muted small pie-empty">{empty}</div>;
  const R = 50;
  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const a = (s.value / total) * Math.PI * 2;
    const x1 = R + R * Math.cos(angle);
    const y1 = R + R * Math.sin(angle);
    angle += a;
    const x2 = R + R * Math.cos(angle);
    const y2 = R + R * Math.sin(angle);
    const large = a > Math.PI ? 1 : 0;
    const d =
      slices.length === 1
        ? `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z`
        : `M ${R} ${R} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    return <path key={s.key} d={d} style={{ fill: COLOR_FILL[s.key] }} className="pie-slice" />;
  });
  return (
    <div className="pie">
      <div className="chart-legend pie-legend">
        {slices.map((s) => (
          <span key={s.key}>
            <i style={{ background: COLOR_FILL[s.key] }} /> {COLOR_NAME[s.key]} {s.value}
          </span>
        ))}
      </div>
      <svg viewBox="0 0 100 100" className="pie-svg" role="img" aria-label="Grafico a torta">
        {paths}
      </svg>
    </div>
  );
}
