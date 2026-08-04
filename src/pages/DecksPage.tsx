// Sezione "Mazzi": elenco dei mazzi salvati, creazione, apertura editor.

import { useState } from "react";
import { deckCoverUrl, FORMATS, Format, useDecks } from "../decks";
import { deckStats } from "../deckStats";
import { formatMoney } from "../prices";
import { parseAndResolve } from "../deckIO";
import { DeckEditor } from "../components/DeckEditor";
import { MetaPanel } from "../components/MetaPanel";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

export default function DecksPage() {
  const decks = useDecks();
  const [selected, setSelected] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState<Format>("modern");

  if (selected) {
    return <DeckEditor deckId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="page">
      <h1 className="page-title">Mazzi</h1>

      <div className="panel">
        <strong style={{ fontSize: 14 }}>Nuovo mazzo</strong>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <select
            className="deck-name-input"
            style={{ margin: 0, width: "auto" }}
            value={newFormat}
            onChange={(e) => setNewFormat(e.target.value as Format)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={() => {
              const id = decks.create("Nuovo mazzo", newFormat);
              setSelected(id);
            }}
          >
            + Crea
          </button>
        </div>
      </div>

      {decks.decks.length === 0 ? (
        <div className="coming-soon">
          <div className="cs-emoji">🗂️</div>
          <h2>Nessun mazzo</h2>
          <p className="muted">
            Crea il tuo primo mazzo qui sopra, poi aggiungi carte con la ricerca
            o incollando una lista.
          </p>
        </div>
      ) : (
        FORMATS.filter((f) => decks.decks.some((d) => d.format === f)).map((f) => {
          const group = decks.decks.filter((d) => d.format === f);
          return (
            <div key={f} className="format-group">
              <h2 className="format-heading">
                {FORMAT_LABEL[f]}
                <span className="muted small"> · {group.length}</span>
              </h2>
              <div className="deck-cards">
                {group.map((d) => {
                  const s = deckStats(d);
                  const cover = deckCoverUrl(d);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="deck-card-item"
                      onClick={() => setSelected(d.id)}
                    >
                      {cover ? (
                        <span
                          className="dci-cover"
                          style={{ backgroundImage: `url(${cover})` }}
                        />
                      ) : (
                        <span className="dci-cover dci-cover--empty">🗂️</span>
                      )}
                      <div className="dci-main">
                        <div className="dci-name">{d.name}</div>
                        <div className="muted small">
                          {s.mainCount} main
                          {s.sideCount > 0 && ` · ${s.sideCount} side`}
                        </div>
                      </div>
                      <div className="dci-price">
                        {formatMoney(s.totalPriceEur, "EUR")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <MetaPanel
        onCreateDeck={(name, format, deck) => {
          const id = decks.create(name, format);
          setSelected(id);
          if (deck) {
            parseAndResolve(deck)
              .then(({ cards }) => decks.replaceCards(id, cards))
              .catch(() => {
                /* import fallito: resta il mazzo vuoto, l'utente riprova */
              });
          }
        }}
      />
    </div>
  );
}
