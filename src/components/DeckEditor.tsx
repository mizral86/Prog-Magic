// Editor di un singolo mazzo: aggiunta carte, import/export, statistiche,
// legalità e liste main/sideboard.

import { FormEvent, useMemo, useState } from "react";
import { Board, FORMATS, Format, useDecks } from "../decks";
import { CardInfo, COLORS } from "../types";
import { searchCards } from "../scryfall";
import { deckToText, parseAndResolve } from "../deckIO";
import { deckAnalysis, deckStats, legalityIssues } from "../deckStats";
import { formatMoney } from "../prices";
import { Bar } from "./Bar";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

export function DeckEditor({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const decks = useDecks();
  const deck = decks.get(deckId);

  const [target, setTarget] = useState<Board>("main");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);

  const stats = useMemo(() => (deck ? deckStats(deck) : null), [deck]);
  const analysis = useMemo(() => (deck ? deckAnalysis(deck) : null), [deck]);
  const issues = useMemo(() => (deck ? legalityIssues(deck) : []), [deck]);

  if (!deck) {
    return (
      <div className="page">
        <button className="ghost" onClick={onBack}>
          ← Indietro
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
          Mazzo non trovato.
        </p>
      </div>
    );
  }

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      setResults(await searchCards(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setImportMsg(null);
    try {
      const { cards, unresolved } = await parseAndResolve(importText);
      decks.replaceCards(deckId, cards);
      setImportMsg(
        `Importate ${cards.length} voci.` +
          (unresolved.length ? ` Non trovate: ${unresolved.join(", ")}` : ""),
      );
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const main = deck.cards.filter((c) => c.board === "main");
  const side = deck.cards.filter((c) => c.board === "side");

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 10 }}>
        ← Tutti i mazzi
      </button>

      <div className="deck-editor-head">
        <input
          className="deck-name-input"
          value={deck.name}
          onChange={(e) => decks.rename(deckId, e.target.value)}
          style={{ margin: 0, flex: 1, fontWeight: 700 }}
        />
        <select
          className="deck-name-input"
          style={{ margin: 0, width: "auto" }}
          value={deck.format}
          onChange={(e) => decks.setFormat(deckId, e.target.value as Format)}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
        <button
          className="ghost"
          onClick={() => {
            if (confirm(`Eliminare il mazzo "${deck.name}"?`)) {
              decks.remove(deckId);
              onBack();
            }
          }}
        >
          Elimina
        </button>
      </div>

      {/* Aggiunta carte */}
      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong style={{ fontSize: 14 }}>Aggiungi carte</strong>
          <span className="segmented">
            <button
              className={target === "main" ? "on" : ""}
              onClick={() => setTarget("main")}
            >
              Main
            </button>
            <button
              className={target === "side" ? "on" : ""}
              onClick={() => setTarget("side")}
            >
              Side
            </button>
          </span>
        </div>
        <form className="search-bar" style={{ marginTop: 8 }} onSubmit={doSearch}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca una carta da aggiungere…"
          />
          <button className="primary" type="submit" disabled={searching}>
            {searching ? "…" : "Cerca"}
          </button>
        </form>
        {results && (
          <div className="add-results">
            {results.slice(0, 24).map((c) => (
              <button
                key={c.scryfallId ?? c.name}
                type="button"
                className="add-result"
                onClick={() => decks.addCard(deckId, c, target)}
                title={`Aggiungi a ${target}`}
              >
                {c.imageSmallUrl && (
                  <img src={c.imageSmallUrl} alt={c.name} loading="lazy" />
                )}
                <span className="ar-name">{c.name}</span>
                <span className="ar-plus">+</span>
              </button>
            ))}
            {results.length === 0 && (
              <span className="muted small">Nessun risultato.</span>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button
            className="ghost"
            onClick={() => {
              setImportOpen((v) => !v);
              setExportText(null);
            }}
          >
            Importa lista
          </button>
          <button
            className="ghost"
            onClick={() => {
              setExportText(deckToText(deck));
              setImportOpen(false);
            }}
          >
            Esporta
          </button>
        </div>

        {importOpen && (
          <div style={{ marginTop: 8 }}>
            <textarea
              className="deck-input"
              style={{ minHeight: 120 }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"4 Lightning Bolt\n20 Mountain\n\nSideboard\n3 Abrade"}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="primary" onClick={doImport} disabled={busy}>
                {busy ? "Importo…" : "Sostituisci con questa lista"}
              </button>
              {importMsg && <span className="muted small">{importMsg}</span>}
            </div>
          </div>
        )}
        {exportText !== null && (
          <textarea
            className="deck-input"
            style={{ marginTop: 8, minHeight: 120 }}
            readOnly
            value={exportText}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </div>

      {/* Statistiche + legalità */}
      {stats && (
        <div className="results-grid" style={{ marginTop: 12 }}>
          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>Statistiche</h2>
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
                <div className="value">
                  {formatMoney(stats.totalPriceEur, "EUR")}
                </div>
                <div className="label">
                  Prezzo
                  {stats.missingPrice > 0 && ` · ${stats.missingPrice} senza`}
                </div>
              </div>
            </div>
            <div className="chart">
              <h3>Curva di mana (magie del main)</h3>
              {stats.curve.map((b) => (
                <Bar
                  key={b.label}
                  label={b.label}
                  value={b.count}
                  fraction={b.count / Math.max(1, ...stats.curve.map((x) => x.count))}
                  display={String(b.count)}
                />
              ))}
            </div>
            <div className="chart">
              <h3>Colori (copie)</h3>
              <div className="chips">
                {COLORS.map((c) => (
                  <span key={c} className="chip">
                    <span className={`color-dot ${c}`} /> {stats.colors[c]}
                  </span>
                ))}
                <span className="chip">Incolori: {stats.colorless}</span>
              </div>
            </div>
            <div className="chart">
              <h3>Tipi (copie main)</h3>
              <div className="chips">
                {stats.types.map((t) => (
                  <span key={t.label} className="chip">
                    {t.label}: {t.count}
                  </span>
                ))}
              </div>
            </div>
            {analysis && !analysis.empty && (
              <div className="chart">
                <h3>Analisi &amp; consistenza</h3>
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
                <p className="muted small" style={{ margin: "8px 0 0" }}>
                  Linee guida euristiche (mano iniziale via ipergeometrica), non
                  regole assolute.
                </p>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>
              Legalità · {FORMAT_LABEL[deck.format]}
            </h2>
            {issues.length === 0 ? (
              <div className="ok-badge">✓ Nessun problema rilevato</div>
            ) : (
              <ul className="issues">
                {issues.map((i, idx) => (
                  <li key={idx} className={i.level}>
                    {i.level === "error" ? "⛔" : "⚠️"} {i.text}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small" style={{ marginTop: 8 }}>
              Controlli basati sui dati di legalità di Scryfall e su regole base
              (copie, dimensione mazzo). Non copre ogni eccezione.
            </p>
          </div>
        </div>
      )}

      {/* Liste */}
      <CardList
        title={`Main (${stats?.mainCount ?? 0})`}
        cards={main}
        deckId={deckId}
        board="main"
      />
      {side.length > 0 && (
        <CardList
          title={`Sideboard (${stats?.sideCount ?? 0})`}
          cards={side}
          deckId={deckId}
          board="side"
        />
      )}
    </div>
  );
}

function CardList({
  title,
  cards,
  deckId,
  board,
}: {
  title: string;
  cards: import("../decks").DeckCard[];
  deckId: string;
  board: Board;
}) {
  const decks = useDecks();
  const sorted = [...cards].sort(
    (a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name),
  );
  return (
    <div style={{ marginTop: 14 }}>
      <h2 className="section-title" style={{ fontSize: 16 }}>
        {title}
      </h2>
      {sorted.length === 0 && <div className="muted small">Vuoto.</div>}
      <div className="deck-cardlist">
        {sorted.map((c) => (
          <div className="deck-line" key={c.id}>
            <span className="dl-qty">{c.qty}×</span>
            <span className="dl-name">{c.name}</span>
            <span className="stepper">
              <button
                type="button"
                onClick={() => decks.setQty(deckId, c.id, board, c.qty - 1)}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => decks.setQty(deckId, c.id, board, c.qty + 1)}
              >
                +
              </button>
            </span>
            <button
              type="button"
              className="ghost dl-remove"
              onClick={() => decks.removeCard(deckId, c.id, board)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
