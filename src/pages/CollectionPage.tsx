// Sezione "Collezione": elenco carte possedute, valore e statistiche.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CardDetail } from "../components/CardDetail";
import { CardInfo } from "../types";
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
import { Shelf, ShelfBar, WishlistView } from "../components/Shelves";

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
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setViewState] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("pm.collectionView") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const setView = (v: "grid" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem("pm.collectionView", v);
    } catch {
      /* ignora */
    }
  };
  const [detail, setDetail] = useState<CardInfo | null>(null);
  const [shelf, setShelf] = useState<Shelf>("all");

  const entries = useMemo(
    () =>
      shelf === "all" || shelf === "wishlist"
        ? collection.entries
        : collection.entries.filter((e) => e.binder === shelf),
    [collection.entries, shelf],
  );
  const totals = useMemo(() => computeTotals(entries), [entries]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = !q
      ? [...entries]
      : entries.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            (e.setName ?? "").toLowerCase().includes(q) ||
            (e.setCode ?? "").toLowerCase() === q ||
            e.typeLine.toLowerCase().includes(q),
        );
    return list.sort(SORTERS[sort]);
  }, [entries, filter, sort]);

  const byColor = useMemo(() => colorStats(entries), [entries]);
  const byRarity = useMemo(() => rarityStats(entries), [entries]);

  const shelfBar = <ShelfBar shelf={shelf} onChange={setShelf} />;

  if (shelf === "wishlist") {
    return (
      <div className="page">
        <h1 className="page-title">Collezione</h1>
        {shelfBar}
        <WishlistView />
      </div>
    );
  }

  if (shelf !== "all" && entries.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">Collezione</h1>
        {shelfBar}
        <div className="coming-soon">
          <div className="cs-emoji">🗂</div>
          <h2>Raccoglitore vuoto</h2>
          <p className="muted">
            Apri una carta della collezione e scegli questo raccoglitore nella sua
            scheda.
          </p>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="page">
        <div className="page-title-row">
        <h1 className="page-title">Collezione</h1>
        <Link to="/scansiona" className="scan-cta">
          📷 Scansiona carte
        </Link>
      </div>
        {shelfBar}
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
      <div className="page-title-row">
        <h1 className="page-title">Collezione</h1>
        <Link to="/scansiona" className="scan-cta">
          📷 Scansiona
        </Link>
      </div>
      {shelfBar}

      <div className="stat-cards coll-stats">
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

      <CollectionTools />

      <details className="coll-more">
        <summary>Statistiche per colore e rarità</summary>
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
      </details>

      <div className="row" style={{ margin: "14px 0 8px", gap: 8, flexWrap: "wrap" }}>
        <input
          className="deck-name-input"
          style={{ margin: 0, flex: "1 1 180px" }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtra per nome, tipo o edizione…"
        />
        <select
          className="deck-name-input"
          style={{ margin: 0, width: "auto" }}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordina la collezione"
        >
          <option value="recent">Aggiunte di recente</option>
          <option value="name">Nome</option>
          <option value="value">Valore</option>
          <option value="set">Edizione</option>
        </select>
        <span className="view-toggle" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
            Griglia
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            Lista
          </button>
        </span>
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

      {view === "list" ? (
        <div className="collection-list">
          {filtered.map((e) => (
            <CollectionRow key={e.id} entry={e} />
          ))}
        </div>
      ) : (
        <div className="coll-grid">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              className="coll-tile"
              onClick={() => setDetail(entryToCard(e))}
            >
              <div className="ct-img">
                {e.imageSmallUrl || e.imageUrl ? (
                  <img src={e.imageUrl ?? e.imageSmallUrl} alt={e.name} loading="lazy" />
                ) : (
                  <div className="no-img small">{e.name}</div>
                )}
                <span className="ct-qty">×{e.qty + e.foilQty}</span>
                {e.foilQty > 0 && <span className="ct-foil">FOIL</span>}
              </div>
              <span className="ct-name">{e.name}</span>
              <span className="ct-meta">
                <span>{(e.setCode ?? "").toUpperCase()}</span>
                <strong>{lineValue(e) > 0 ? formatMoney(lineValue(e), "EUR") : "—"}</strong>
              </span>
            </button>
          ))}
        </div>
      )}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Dati minimi per aprire la scheda di una carta della collezione. */
function entryToCard(e: CollectionEntry): CardInfo {
  return {
    name: e.name,
    cmc: e.cmc,
    typeLine: e.typeLine,
    categories: [],
    colors: e.colors,
    colorIdentity: e.colorIdentity,
    isLand: e.isLand,
    producedMana: [],
    entersTapped: false,
    manaCost: "",
    pips: {},
    generic: 0,
    oracleText: "",
    imageUrl: e.imageUrl,
    imageSmallUrl: e.imageSmallUrl,
    scryfallId: e.id,
    rarity: e.rarity,
    setCode: e.setCode,
    setName: e.setName,
    collectorNumber: e.collectorNumber,
    prices: e.prices,
  };
}

type SortKey = "recent" | "name" | "value" | "set";

const lineValue = (e: CollectionEntry) =>
  e.qty * eurUnit(e) + e.foilQty * eurFoilUnit(e);

const SORTERS: Record<SortKey, (a: CollectionEntry, b: CollectionEntry) => number> = {
  recent: (a, b) => b.addedAt - a.addedAt,
  name: (a, b) => a.name.localeCompare(b.name, "it"),
  value: (a, b) => lineValue(b) - lineValue(a),
  set: (a, b) =>
    (a.setCode ?? "").localeCompare(b.setCode ?? "") ||
    (a.collectorNumber ?? "").localeCompare(b.collectorNumber ?? "", undefined, {
      numeric: true,
    }),
};

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
