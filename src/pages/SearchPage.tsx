// Sezione "Cerca": ricerca carte su Scryfall con prezzi e dettaglio.

import { FormEvent, useState } from "react";
import { searchCards } from "../scryfall";
import { CardInfo } from "../types";
import { formatPrice } from "../prices";
import { CardDetail } from "../components/CardDetail";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CardInfo | null>(null);

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchCards(q);
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
          Nessun risultato per "{query}".
        </div>
      )}

      {selected && (
        <CardDetail card={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
