// Sezione "Collezione": elenco carte possedute, valore e statistiche.

import { useMemo, useState } from "react";
import {
  CollectionEntry,
  computeTotals,
  eurFoilUnit,
  eurUnit,
  useCollection,
} from "../collection";
import { Color, COLORS } from "../types";
import { formatMoney } from "../prices";
import { CollectionTools } from "../components/CollectionTools";

const COLOR_NAMES: Record<Color, string> = {
  W: "Bianco",
  U: "Blu",
  B: "Nero",
  R: "Rosso",
  G: "Verde",
};

export default function CollectionPage() {
  const collection = useCollection();
  const [filter, setFilter] = useState("");

  const entries = collection.entries;
  const totals = useMemo(() => computeTotals(entries), [entries]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.setName ?? "").toLowerCase().includes(q),
    );
  }, [entries, filter]);

  const byColor = useMemo(() => colorStats(entries), [entries]);
  const byRarity = useMemo(() => rarityStats(entries), [entries]);

  if (entries.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Collezione</h1>
        <CollectionTools />
        <div className="coming-soon">
          <div className="cs-emoji">📚</div>
          <h2>Collezione vuota</h2>
          <p className="muted">
            Aggiungi carte da <strong>Cerca</strong> (apri una carta →
            <em> + Aggiungi</em>), oppure <strong>importa una lista</strong> o
            <strong> sfoglia un set</strong> qui sopra. I dati restano salvati
            sul dispositivo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Collezione</h1>
      <CollectionTools />

      <div className="stat-cards">
        <div className="stat-card">
          <div className="value">{totals.cards}</div>
          <div className="label">Carte totali</div>
        </div>
        <div className="stat-card">
          <div className="value">{totals.unique}</div>
          <div className="label">Stampe uniche</div>
        </div>
        <div className="stat-card">
          <div className="value">{formatMoney(totals.valueEur, "EUR")}</div>
          <div className="label">
            Valore stimato
            {totals.missingPrice > 0 &&
              ` · ${totals.missingPrice} senza prezzo`}
          </div>
        </div>
      </div>

      <div className="chart">
        <h3>Per colore (copie)</h3>
        <div className="chips">
          {COLORS.map((c) => (
            <span key={c} className="chip">
              <span className={`color-dot ${c}`} /> {COLOR_NAMES[c]}: {byColor[c]}
            </span>
          ))}
          <span className="chip">Incolori: {byColor.colorless}</span>
          <span className="chip">Multicolore: {byColor.multi}</span>
        </div>
      </div>

      <div className="chart">
        <h3>Per rarità (copie)</h3>
        <div className="chips">
          {Object.entries(byRarity).map(([r, n]) => (
            <span key={r} className="chip">
              {r}: {n}
            </span>
          ))}
        </div>
      </div>

      <div className="row" style={{ margin: "14px 0 8px", gap: 8 }}>
        <input
          className="deck-name-input"
          style={{ margin: 0, flex: 1 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtra per nome o edizione…"
        />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            if (confirm("Svuotare tutta la collezione? L'azione è irreversibile."))
              collection.clear();
          }}
        >
          Svuota
        </button>
      </div>

      <div className="collection-list">
        {filtered.map((e) => (
          <CollectionRow key={e.id} entry={e} />
        ))}
      </div>
    </div>
  );
}

function CollectionRow({ entry }: { entry: CollectionEntry }) {
  const collection = useCollection();
  const lineValue = entry.qty * eurUnit(entry) + entry.foilQty * eurFoilUnit(entry);

  return (
    <div className="collection-row">
      {entry.imageSmallUrl ? (
        <img src={entry.imageSmallUrl} alt={entry.name} loading="lazy" />
      ) : (
        <div className="no-img small" style={{ width: 46 }}>
          {entry.name}
        </div>
      )}
      <div className="cr-main">
        <div className="cr-name">{entry.name}</div>
        <div className="muted small">
          {(entry.setCode ?? "").toUpperCase()}
          {entry.collectorNumber ? ` #${entry.collectorNumber}` : ""}
          {entry.rarity ? ` · ${entry.rarity}` : ""}
        </div>
        <div className="cr-steppers">
          <Stepper
            label="N"
            value={entry.qty}
            onChange={(v) => collection.setQty(entry.id, v)}
          />
          <Stepper
            label="Foil"
            value={entry.foilQty}
            onChange={(v) => collection.setFoilQty(entry.id, v)}
          />
        </div>
      </div>
      <div className="cr-right">
        <div className="cr-value">
          {lineValue > 0 ? formatMoney(lineValue, "EUR") : "—"}
        </div>
        <button
          type="button"
          className="ghost cr-remove"
          onClick={() => collection.remove(entry.id)}
          aria-label="Rimuovi"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="stepper">
      <span className="stepper-label">{label}</span>
      <button type="button" onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="stepper-val">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

// --- statistiche ---
function colorStats(entries: CollectionEntry[]) {
  const out: Record<Color, number> & { colorless: number; multi: number } = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    colorless: 0,
    multi: 0,
  };
  for (const e of entries) {
    const copies = e.qty + e.foilQty;
    const cols = e.colors ?? [];
    if (cols.length === 0) out.colorless += copies;
    else if (cols.length > 1) out.multi += copies;
    for (const c of cols) out[c] += copies;
  }
  return out;
}

function rarityStats(entries: CollectionEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const r = e.rarity ?? "sconosciuta";
    out[r] = (out[r] ?? 0) + e.qty + e.foilQty;
  }
  return out;
}
