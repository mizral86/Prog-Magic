// Sezione "Cerca": ricerca carte su Scryfall con prezzi, filtri avanzati e dettaglio.

import { FormEvent, useMemo, useState } from "react";
import { ManaCost } from "../components/ManaSymbol";
import { searchCards, SortOrder } from "../scryfall";
import { CardInfo, Color, COLORS } from "../types";
import { formatPrice } from "../prices";
import { CardDetail } from "../components/CardDetail";
import { ManaSymbol } from "../components/ManaSymbol";

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
  { key: "relevance", label: "Pertinenza" },
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
  // Costo di mana composto con i simboli: generico + simboli colorati/speciali.
  costGeneric: number;
  costSyms: string[];
  costMode: CostMode;
}

type CostMode = ">=" | "=";

// Simboli disponibili per comporre il costo di mana.
const COST_SYMS: { sym: string; label: string }[] = [
  { sym: "W", label: "Bianco" },
  { sym: "U", label: "Blu" },
  { sym: "B", label: "Nero" },
  { sym: "R", label: "Rosso" },
  { sym: "G", label: "Verde" },
  { sym: "C", label: "Incolore" },
  { sym: "X", label: "X" },
];
// Ibridi: prima i colori alleati, poi i nemici (notazione Scryfall {W/U}…).
const HYBRID_SYMS: { sym: string; label: string }[] = [
  { sym: "W/U", label: "Bianco/Blu" },
  { sym: "U/B", label: "Blu/Nero" },
  { sym: "B/R", label: "Nero/Rosso" },
  { sym: "R/G", label: "Rosso/Verde" },
  { sym: "G/W", label: "Verde/Bianco" },
  { sym: "W/B", label: "Bianco/Nero" },
  { sym: "U/R", label: "Blu/Rosso" },
  { sym: "B/G", label: "Nero/Verde" },
  { sym: "R/W", label: "Rosso/Bianco" },
  { sym: "G/U", label: "Verde/Blu" },
];
const GENERIC_MAX = 9;

const EMPTY: Filters = {
  colors: new Set(),
  colorMode: ">=",
  types: new Set(),
  cmcOp: "=",
  cmc: "",
  rarity: "",
  format: "",
  oracle: "",
  costGeneric: 0,
  costSyms: [],
  costMode: ">=",
};

// Costo di mana in notazione Scryfall, es. {2}{R}{R}. X va per primo come
// sulle carte, poi il generico, poi i colori nell'ordine WUBRG.
function costString(f: Filters): string {
  const order = ["X", ...HYBRID_SYMS.map((h) => h.sym), "W", "U", "B", "R", "G", "C"];
  const syms = [...f.costSyms].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const xs = syms.filter((s) => s === "X");
  const rest = syms.filter((s) => s !== "X");
  const generic = f.costGeneric > 0 ? [String(f.costGeneric)] : [];
  return [...xs, ...generic, ...rest].map((s) => `{${s}}`).join("");
}

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

  const cost = costString(f);
  if (cost) parts.push(`m${f.costMode === "=" ? "=" : ">="}${cost}`);

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
  const [order, setOrder] = useState<SortOrder>("relevance");

  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CardInfo | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  // Vista dei risultati: lista (predefinita) o griglia di immagini.
  const [view, setViewState] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem("pm.searchView") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const setView = (v: "list" | "grid") => {
    setViewState(v);
    try {
      localStorage.setItem("pm.searchView", v);
    } catch {
      /* ignora */
    }
  };

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
    setFilters({ ...EMPTY, colors: new Set(), types: new Set(), costSyms: [] });
  }
  function addCostSym(sym: string) {
    setFilters((f) => ({ ...f, costSyms: [...f.costSyms, sym] }));
  }
  function removeCostSym(idx: number) {
    setFilters((f) => ({ ...f, costSyms: f.costSyms.filter((_, i) => i !== idx) }));
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
      {results === null && !loading && (
        <div className="hero-banner" aria-hidden="true">
          <img className="only-light" loading="lazy" src={`${import.meta.env.BASE_URL}menga-banner.webp`} alt="" />
          <img className="only-dark" loading="lazy" src={`${import.meta.env.BASE_URL}mmg-banner.webp`} alt="" />
          <div className="hero-text">
            <span className="hero-title">Menga Magic</span>
            <span className="hero-sub">More Magic Together</span>
          </div>
        </div>
      )}
      <h1 className="page-title">Cerca carte</h1>
      <form className="search-bar" onSubmit={doSearch}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome carta (es. Fulmine o Lightning Bolt)"
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
                  aria-label={COLOR_LABELS[c]}
                  aria-pressed={filters.colors.has(c)}
                >
                  <ManaSymbol sym={c} size={26} title={COLOR_LABELS[c]} />
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
            <span className="adv-label">Costo</span>
            <div className="mana-palette">
              {COST_SYMS.map(({ sym, label }) => (
                <button
                  key={sym}
                  type="button"
                  className="mana-btn"
                  onClick={() => addCostSym(sym)}
                  title={`Aggiungi ${label}`}
                  aria-label={`Aggiungi ${label}`}
                >
                  <ManaSymbol sym={sym} size={24} title={label} />
                </button>
              ))}
              <span className="mana-generic">
                <button
                  type="button"
                  className="mana-btn small"
                  onClick={() =>
                    patch({ costGeneric: Math.max(0, filters.costGeneric - 1) })
                  }
                  disabled={filters.costGeneric === 0}
                  aria-label="Meno mana generico"
                >
                  −
                </button>
                <ManaSymbol
                  sym={String(filters.costGeneric)}
                  size={24}
                  title="Mana generico"
                />
                <button
                  type="button"
                  className="mana-btn small"
                  onClick={() =>
                    patch({
                      costGeneric: Math.min(GENERIC_MAX, filters.costGeneric + 1),
                    })
                  }
                  disabled={filters.costGeneric >= GENERIC_MAX}
                  aria-label="Più mana generico"
                >
                  +
                </button>
              </span>
            </div>
          </div>
          <div className="adv-row">
            <span className="adv-label">Ibridi</span>
            <div className="mana-palette">
              {HYBRID_SYMS.map(({ sym, label }) => (
                <button
                  key={sym}
                  type="button"
                  className="mana-btn"
                  onClick={() => addCostSym(sym)}
                  title={`Aggiungi ${label}`}
                  aria-label={`Aggiungi ${label}`}
                >
                  <ManaSymbol sym={sym} size={24} title={label} />
                </button>
              ))}
            </div>
          </div>
          <div className="adv-row">
            <span className="adv-label" />
            <div className="mana-cost">
              {filters.costGeneric === 0 && filters.costSyms.length === 0 ? (
                <span className="muted small">
                  Tocca i simboli per comporre il costo (es. 2 + rosso + rosso)
                </span>
              ) : (
                <>
                  {filters.costGeneric > 0 && (
                    <button
                      type="button"
                      className="mana-btn"
                      onClick={() => patch({ costGeneric: 0 })}
                      title="Togli il mana generico"
                    >
                      <ManaSymbol sym={String(filters.costGeneric)} size={24} />
                    </button>
                  )}
                  {filters.costSyms.map((sym, i) => (
                    <button
                      key={i}
                      type="button"
                      className="mana-btn"
                      onClick={() => removeCostSym(i)}
                      title="Togli questo simbolo"
                    >
                      <ManaSymbol sym={sym} size={24} />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => patch({ costGeneric: 0, costSyms: [] })}
                  >
                    svuota
                  </button>
                </>
              )}
            </div>
            <div className="segmented">
              {(
                [
                  [">=", "contiene"],
                  ["=", "esatto"],
                ] as [CostMode, string][]
              ).map(([m, lab]) => (
                <button
                  key={m}
                  type="button"
                  className={filters.costMode === m ? "on" : ""}
                  onClick={() => patch({ costMode: m })}
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

      {error && (
        <div className="status-line error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {results && (
        <div className="results-head">
          <span className="muted small">{results.length} risultati</span>
          {results.length > 0 && (
            <span className="view-toggle" role="group" aria-label="Vista">
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                Lista
              </button>
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
                Griglia
              </button>
            </span>
          )}
        </div>
      )}

      {view === "list" ? (
        <div className="search-list">
          {results?.map((c) => (
            <button
              key={c.scryfallId ?? c.name}
              type="button"
              className="search-row"
              onClick={() => setSelected(c)}
            >
              {c.imageSmallUrl ? (
                <img src={c.imageSmallUrl} alt="" loading="lazy" />
              ) : (
                <div className="no-img small sr-img">{c.name}</div>
              )}
              <span className="sr-main">
                <span className="sr-top">
                  <span className="sr-name">{c.printedName ?? c.name}</span>
                  {c.manaCost && <ManaCost cost={c.manaCost} size={16} />}
                </span>
                {c.printedName && <span className="sr-sub">{c.name}</span>}
                <span className="sr-type">{c.typeLine}</span>
              </span>
              <span className="sr-price">{formatPrice(c)}</span>
            </button>
          ))}
        </div>
      ) : (
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
      )}

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
