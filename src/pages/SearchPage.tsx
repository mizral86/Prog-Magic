// Sezione "Cerca": ricerca carte su Scryfall con prezzi, filtri avanzati e dettaglio.

import { FormEvent, useMemo, useState } from "react";
import { searchCards, SortOrder } from "../scryfall";
import { CardInfo, Color, COLORS } from "../types";
import { formatPrice } from "../prices";
import { CardDetail } from "../components/CardDetail";

// --- Opzioni dei filtri avanzati -------------------------------------------

type ColorMode = ">=" | "=" | "<="; // includono / esatti / al massimo
type NumOp = ">=" | "=" | "<=" | ">" | "<";

const COLOR_LABELS: Record<Color | "C", string> = {
  W: "Bianco",
  U: "Blu",
  B: "Nero",
  R: "Rosso",
  G: "Verde",
  C: "Incolore",
};
const COLOR_KEYS: (Color | "C")[] = [...COLORS, "C"];

const TYPES: { key: string; label: string }[] = [
  { key: "creature", label: "Creatura" },
  { key: "instant", label: "Istantaneo" },
  { key: "sorcery", label: "Stregoneria" },
  { key: "artifact", label: "Artefatto" },
  { key: "enchantment", label: "Incantesimo" },
  { key: "planeswalker", label: "Planeswalker" },
  { key: "land", label: "Terra" },
  { key: "battle", label: "Battaglia" },
];

const RARITIES: { key: string; label: string }[] = [
  { key: "", label: "Qualsiasi" },
  { key: "common", label: "Comune" },
  { key: "uncommon", label: "Non comune" },
  { key: "rare", label: "Rara" },
  { key: "mythic", label: "Mitica" },
];

const FORMATS: { key: string; label: string }[] = [
  { key: "", label: "Qualsiasi" },
  { key: "standard", label: "Standard" },
  { key: "pioneer", label: "Pioneer" },
  { key: "modern", label: "Modern" },
  { key: "legacy", label: "Legacy" },
  { key: "vintage", label: "Vintage" },
  { key: "commander", label: "Commander" },
  { key: "pauper", label: "Pauper" },
];

const SORTS: { key: SortOrder; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "cmc", label: "Costo (CMC)" },
  { key: "rarity", label: "Rarità" },
  { key: "eur", label: "Prezzo" },
  { key: "released", label: "Uscita" },
];

interface Filters {
  colors: Set<Color | "C">;
  colorMode: ColorMode;
  types: Set<string>;
  cmcOp: NumOp;
  cmc: string;
  rarity: string;
  format: string;
  oracle: string;
}

const EMPTY: Filters = {
  colors: new Set(),
  colorMode: ">=",
  types: new Set(),
  cmcOp: "=",
  cmc: "",
  rarity: "",
  format: "",
  oracle: "",
};

// Compone la query Scryfall a partire dal testo libero + i filtri avanzati.
function buildQuery(text: string, f: Filters): string {
  const parts: string[] = [];
  const t = text.trim();
  if (t) parts.push(t);

  if (f.colors.size) {
    const letters = COLOR_KEYS.filter((c) => f.colors.has(c))
      .join("")
      .toLowerCase();
    parts.push(`c${f.colorMode}${letters}`);
  }

  if (f.types.size) {
    const clauses = [...f.types].map((ty) => `t:${ty}`);
    parts.push(clauses.length > 1 ? `(${clauses.join(" or ")})` : clauses[0]);
  }

  if (f.cmc.trim() !== "" && !isNaN(Number(f.cmc))) {
    parts.push(`cmc${f.cmcOp}${f.cmc.trim()}`);
  }

  if (f.rarity) parts.push(`r:${f.rarity}`);
  if (f.format) parts.push(`f:${f.format}`);

  const oracle = f.oracle.trim();
  if (oracle) parts.push(`o:"${oracle.replace(/"/g, "")}"`);

  return parts.join(" ");
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [order, setOrder] = useState<SortOrder>("name");

  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CardInfo | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const composed = useMemo(
    () => (advanced ? buildQuery(query, filters) : query.trim()),
    [advanced, query, filters],
  );

  function patch(p: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...p }));
  }
  function toggleColor(c: Color | "C") {
    setFilters((f) => {
      const colors = new Set(f.colors);
      if (colors.has(c)) colors.delete(c);
      else colors.add(c);
      return { ...f, colors };
    });
  }
  function toggleType(ty: string) {
    setFilters((f) => {
      const types = new Set(f.types);
      if (types.has(ty)) types.delete(ty);
      else types.add(ty);
      return { ...f, types };
    });
  }
  function resetFilters() {
    setFilters({ ...EMPTY, colors: new Set(), types: new Set() });
  }

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = composed.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setLastQuery(q);
    try {
      const r = await searchCards(q, { order });
      setResults(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Cerca carte</h1>
      <form className="search-bar" onSubmit={doSearch}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome carta (es. Lightning Bolt) o sintassi Scryfall (es. t:dragon c:r)"
          autoFocus
        />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "…" : "Cerca"}
        </button>
      </form>

      <div className="search-tools">
        <button
          type="button"
          className="link-btn"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          {advanced ? "▾ Ricerca avanzata" : "▸ Ricerca avanzata"}
        </button>
        <label className="field">
          Ordina
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as SortOrder)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {advanced && (
        <div className="adv-panel">
          <div className="adv-row">
            <span className="adv-label">Colori</span>
            <div className="color-toggles">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-tog c-${c}${filters.colors.has(c) ? " on" : ""}`}
                  onClick={() => toggleColor(c)}
                  title={COLOR_LABELS[c]}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="segmented">
              {(
                [
                  [">=", "che includono"],
                  ["=", "esatti"],
                  ["<=", "al massimo"],
                ] as [ColorMode, string][]
              ).map(([m, lab]) => (
                <button
                  key={m}
                  type="button"
                  className={filters.colorMode === m ? "on" : ""}
                  onClick={() => patch({ colorMode: m })}
                >
                  {lab}
                </button>
              ))}
            </div>
          </div>

          <div className="adv-row">
            <span className="adv-label">Tipo</span>
            <div className="chips">
              {TYPES.map((ty) => (
                <button
                  key={ty.key}
                  type="button"
                  className={`chip toggle${filters.types.has(ty.key) ? " on" : ""}`}
                  onClick={() => toggleType(ty.key)}
                >
                  {ty.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adv-row">
            <label className="field">
              Costo (CMC)
              <select
                value={filters.cmcOp}
                onChange={(e) => patch({ cmcOp: e.target.value as NumOp })}
              >
                <option value="=">=</option>
                <option value="<=">≤</option>
                <option value=">=">≥</option>
                <option value="<">&lt;</option>
                <option value=">">&gt;</option>
              </select>
              <input
                type="number"
                min={0}
                value={filters.cmc}
                onChange={(e) => patch({ cmc: e.target.value })}
                placeholder="—"
                style={{ width: 64 }}
              />
            </label>

            <label className="field">
              Rarità
              <select
                value={filters.rarity}
                onChange={(e) => patch({ rarity: e.target.value })}
              >
                {RARITIES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Formato
              <select
                value={filters.format}
                onChange={(e) => patch({ format: e.target.value })}
              >
                {FORMATS.map((fm) => (
                  <option key={fm.key} value={fm.key}>
                    {fm.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="adv-row">
            <label className="field" style={{ flex: 1 }}>
              Testo contiene
              <input
                type="text"
                value={filters.oracle}
                onChange={(e) => patch({ oracle: e.target.value })}
                placeholder='es. "draw a card", vola, distruggi…'
                style={{ flex: 1, minWidth: 160 }}
              />
            </label>
            <button type="button" className="ghost" onClick={resetFilters}>
              Azzera filtri
            </button>
          </div>

          <div className="adv-preview">
            Query:{" "}
            <span className="mono">{composed || "(vuota)"}</span>
          </div>
        </div>
      )}

      {!advanced && (
        <div className="muted small" style={{ marginTop: 4 }}>
          Suggerimento: puoi usare la{" "}
          <a
            href="https://scryfall.com/docs/syntax"
            target="_blank"
            rel="noreferrer"
          >
            sintassi di Scryfall
          </a>{" "}
          (es. <span className="mono">c:u cmc=2 t:instant</span>).
        </div>
      )}

      {error && (
        <div className="status-line error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {results && (
        <div className="muted small" style={{ margin: "14px 0 6px" }}>
          {results.length} risultati
        </div>
      )}

      <div className="card-grid">
        {results?.map((c) => (
          <button
            key={c.scryfallId ?? c.name}
            type="button"
            className="card-cell"
            onClick={() => setSelected(c)}
          >
            {c.imageSmallUrl ? (
              <img src={c.imageSmallUrl} alt={c.name} loading="lazy" />
            ) : (
              <div className="no-img small">{c.name}</div>
            )}
            <span className="card-cell-price">{formatPrice(c)}</span>
          </button>
        ))}
      </div>

      {results && results.length === 0 && !loading && (
        <div className="muted" style={{ marginTop: 16 }}>
          Nessun risultato per <span className="mono">{lastQuery}</span>.
        </div>
      )}

      {selected && (
        <CardDetail card={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
