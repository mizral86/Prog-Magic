// Sezione Simula: carte suggerite dal pool del formato per migliorare ciascun
// mazzo contro l'avversario. On-demand (serve un formato + una ricerca).

import { useState } from "react";
import { searchCards } from "../scryfall";
import { CardInfo, DeckEntry } from "../types";
import { formatPrice } from "../prices";
import { CardThumb } from "./CardThumb";
import { FORMATS, Format } from "../decks";
import {
  classifyDeck,
  MATCHUP_LABEL,
  MatchupType,
  suggestGroups,
} from "../formatSuggest";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

interface Group {
  reason: string;
  cards: CardInfo[];
}
interface SideResult {
  opp: MatchupType;
  groups: Group[];
}

interface Props {
  entriesA: DeckEntry[];
  entriesB: DeckEntry[];
  nameA: string;
  nameB: string;
  lookup: Map<string, CardInfo>;
}

function namesOf(entries: DeckEntry[]): Set<string> {
  const s = new Set<string>();
  for (const e of entries) if (e.card) s.add(e.card.name.toLowerCase());
  return s;
}

// Identità colore del mazzo (es. "wu", "r"), per suggerire solo carte on-color.
function colorsOf(entries: DeckEntry[]): string {
  const s = new Set<string>();
  for (const e of entries)
    if (e.card) for (const c of e.card.colorIdentity) s.add(c.toLowerCase());
  return [...s].join("");
}

async function fetchFor(
  opp: MatchupType,
  format: Format,
  own: Set<string>,
  colors: string,
): Promise<SideResult> {
  const groups: Group[] = [];
  for (const g of suggestGroups(opp, format)) {
    // Limita alle carte giocabili nell'identità colore del mazzo.
    const query = colors ? `${g.query} id<=${colors}` : g.query;
    let cards: CardInfo[] = [];
    try {
      // dir asc: rank EDHREC 1 = carta più giocata (le staple prima).
      cards = await searchCards(query, { order: "edhrec", dir: "asc" });
    } catch {
      cards = [];
    }
    const filtered = cards
      .filter((c) => !own.has(c.name.toLowerCase()))
      .slice(0, 4);
    groups.push({ reason: g.reason, cards: filtered });
  }
  return { opp, groups };
}

export function FormatSuggestions({
  entriesA,
  entriesB,
  nameA,
  nameB,
  lookup,
}: Props) {
  const [format, setFormat] = useState<Format>("modern");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ a: SideResult; b: SideResult } | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // A migliora contro B (e viceversa), restando nell'identità colore.
      const a = await fetchFor(
        classifyDeck(entriesB),
        format,
        namesOf(entriesA),
        colorsOf(entriesA),
      );
      const b = await fetchFor(
        classifyDeck(entriesA),
        format,
        namesOf(entriesB),
        colorsOf(entriesB),
      );
      setRes({ a, b });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fmt-suggest">
      <h2 className="section-title">Carte suggerite dal formato</h2>
      <p className="section-sub">
        Proposte di carte legali nel formato per rispondere all'altro mazzo
        (euristico: classifica l'avversario e cerca risposte adatte).
      </p>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label className="field">
          Formato
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
            disabled={loading}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? "Cerco…" : "Trova carte"}
        </button>
      </div>

      {error && (
        <div className="status-line error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {res && (
        <div className="advice-grid">
          <SideColumn title={nameA} data={res.a} lookup={lookup} />
          <SideColumn title={nameB} data={res.b} lookup={lookup} />
        </div>
      )}
    </div>
  );
}

function SideColumn({
  title,
  data,
  lookup,
}: {
  title: string;
  data: SideResult;
  lookup: Map<string, CardInfo>;
}) {
  // Le carte suggerite arrivano da Scryfall (non sono nel lookup dei mazzi):
  // aggiungiamole a una mappa locale così le miniature mostrano l'immagine.
  const map = new Map(lookup);
  for (const g of data.groups)
    for (const c of g.cards) map.set(c.name.toLowerCase(), c);

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        {title}
        <span className="muted small"> · contro {MATCHUP_LABEL[data.opp]}</span>
      </h3>
      {data.groups.map((g, i) => (
        <div key={i} className="fmt-group">
          <div className="fmt-reason">{g.reason}</div>
          {g.cards.length === 0 ? (
            <div className="muted small">Nessun suggerimento trovato.</div>
          ) : (
            <div className="thumb-row">
              {g.cards.map((c) => (
                <div className="thumb-tagged" key={c.scryfallId ?? c.name}>
                  <CardThumb name={c.name} lookup={map} size={54} />
                  <span className="thumb-tag">{formatPrice(c)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
