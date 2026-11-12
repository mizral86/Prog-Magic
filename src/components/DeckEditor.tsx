// Editor di un singolo mazzo: copertina, aggiunta carte con la ricerca,
// import/export, statistiche (curva, tipi di creatura, pedine, maybeboard),
// legalità e liste main / sideboard / maybeboard.

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  autoCover,
  Board,
  BOARD_LABEL,
  BOARDS,
  deckCoverUrl,
  FORMATS,
  Format,
  isScryfallId,
  useDecks,
} from "../decks";
import { setCompareSlot } from "../compareTray";
import { CardInfo, COLORS } from "../types";
import { CardIdentifier, resolveIdentifiers, searchCards } from "../scryfall";
import { deckToText, parseAndResolve } from "../deckIO";
import { deckAnalysis, deckStats, deckTokens, legalityIssues } from "../deckStats";
import { formatMoney, formatPrice } from "../prices";
import { ownedByName, useCollection } from "../collection";
import { useWishlist } from "../wishlist";
import { creatureTypeIt } from "../creatureTypes";
import type { DeckCard, SavedDeck } from "../decks";
import { ManaCost } from "./ManaSymbol";
import { CardDetail } from "./CardDetail";
import { DeckCardSheet } from "./DeckCardSheet";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

const BOARD_TITLE: Record<Board, string> = {
  main: "Main",
  side: "Sideboard",
  maybe: "Maybeboard",
};

export function DeckEditor({ deckId, onBack }: { deckId: string; onBack: () => void }) {
  const decks = useDecks();
  const navigate = useNavigate();
  const deck = decks.get(deckId);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: string; board: Board } | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);

  const stats = useMemo(() => (deck ? deckStats(deck) : null), [deck]);
  const analysis = useMemo(() => (deck ? deckAnalysis(deck) : null), [deck]);
  const issues = useMemo(() => (deck ? legalityIssues(deck) : []), [deck]);
  const tokens = useMemo(() => (deck ? deckTokens(deck) : []), [deck]);
  const collection = useCollection();
  const owned = useMemo(() => ownedByName(collection.entries), [collection.entries]);
  const missing = useMemo(() => (deck ? missingCards(deck, owned) : null), [deck, owned]);
  const wishlist = useWishlist();
  const [wishMsg, setWishMsg] = useState<string | null>(null);

  // Mazzi creati prima di questa versione non hanno pedine, illustrazioni ed
  // edizione: si scaricano una volta da Scryfall (in gruppi da 75).
  const enriching = useRef(new Set<string>());
  const [enrichBusy, setEnrichBusy] = useState(false);
  useEffect(() => {
    if (!deck) return;
    const todo = deck.cards.filter(
      (c) => c.tokens === undefined && !enriching.current.has(c.id),
    );
    if (todo.length === 0) return;
    todo.forEach((c) => enriching.current.add(c.id));
    const ids: CardIdentifier[] = todo.map((c) =>
      isScryfallId(c.id) ? { id: c.id } : { name: c.name },
    );
    setEnrichBusy(true);
    resolveIdentifiers(ids)
      .then((cards) => decks.refreshCards(deckId, cards))
      .catch(() => undefined)
      .finally(() => setEnrichBusy(false));
  }, [deck, deckId, decks]);

  function missingToWishlist() {
    if (!deck || !missing) return;
    let n = 0;
    for (const m of missing.list) {
      const c = m.card;
      wishlist.add(
        {
          name: c.name,
          scryfallId: isScryfallId(c.id) ? c.id : undefined,
          imageSmallUrl: c.imageSmallUrl,
          imageUrl: c.imageUrl,
          prices: c.prices,
        },
        m.lack,
      );
      n += m.lack;
    }
    setWishMsg(`Aggiunte ${n} carte alla wishlist.`);
  }

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

  async function doImport() {
    setBusy(true);
    setImportMsg(null);
    try {
      const { cards, unresolved } = await parseAndResolve(importText);
      // La maybeboard resta: la lista importata sostituisce main e side.
      const maybe = deck!.cards.filter((c) => c.board === "maybe");
      decks.replaceCards(deckId, [...cards, ...maybe]);
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

  const byBoard = (b: Board) => deck.cards.filter((c) => c.board === b);
  const main = byBoard("main");
  const cover = deckCoverUrl(deck);

  function sendToSim(slot: "A" | "B") {
    if (!deck) return;
    setCompareSlot(slot, { name: deck.name, text: deckToText(deck) });
    navigate("/simula");
  }

  const maxCurve = Math.max(1, ...(stats?.curve.map((b) => b.count) ?? [1]));

  return (
    <div className="page">
      <button className="ghost" onClick={onBack} style={{ marginBottom: 10 }}>
        ← Tutti i mazzi
      </button>

      {/* Copertina */}
      <div
        className={`deck-hero${cover ? "" : " deck-hero--empty"}`}
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      >
        <button type="button" className="deck-hero-btn" onClick={() => setCoverOpen(true)}>
          🖼 Cambia immagine
        </button>
      </div>

      <div className="deck-editor-head" style={{ marginTop: 10 }}>
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

      <div className="row compare-row" style={{ marginTop: 10, gap: 8 }}>
        <span className="muted small">Confronta in Simula:</span>
        <button
          type="button"
          className="ghost"
          onClick={() => sendToSim("A")}
          disabled={main.length === 0}
          title="Invia questo mazzo allo slot A del simulatore"
        >
          ⚔ come Mazzo A
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => sendToSim("B")}
          disabled={main.length === 0}
          title="Invia questo mazzo allo slot B del simulatore"
        >
          ⚔ come Mazzo B
        </button>
      </div>

      {/* Aggiunta carte */}
      <div className="panel" style={{ marginTop: 12 }}>
        <AddCardSearch deckId={deckId} />

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

      {/* Liste */}
      <p className="muted small" style={{ margin: "14px 0 0" }}>
        Tocca una carta per cambiarne l'edizione, spostarla o vedere carte simili.
        Le frecce la spostano subito di una copia.
      </p>
      {BOARDS.map((b) => (
        <CardList
          key={b}
          title={`${BOARD_TITLE[b]} (${
            b === "main" ? stats?.mainCount : b === "side" ? stats?.sideCount : stats?.maybeCount
          })`}
          cards={byBoard(b)}
          deck={deck}
          board={b}
          owned={owned}
          onOpen={(c) => setSheet({ id: c.id, board: b })}
        />
      ))}

      {/* Statistiche + legalità */}
      {stats && (
        <div className="results-grid" style={{ marginTop: 16 }}>
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
                <div className="value">{stats.maybeCount}</div>
                <div className="label">
                  Maybeboard
                  {stats.maybeCount > 0 && ` · ${formatMoney(stats.maybePriceEur, "EUR")}`}
                </div>
              </div>
              <div className="stat-card">
                <div className="value">{formatMoney(stats.totalPriceEur, "EUR")}</div>
                <div className="label">
                  Prezzo main + side
                  {stats.missingPrice > 0 && ` · ${stats.missingPrice} senza`}
                </div>
              </div>
              {missing && (
                <div className="stat-card">
                  <div
                    className="value"
                    style={{ color: missing.copies > 0 ? "var(--bad)" : "var(--good)" }}
                  >
                    {missing.copies > 0 ? missing.copies : "✓"}
                  </div>
                  <div className="label">
                    {missing.copies > 0
                      ? `Da procurare · ${formatMoney(missing.valueEur, "EUR")}`
                      : "Hai tutte le carte"}
                  </div>
                  {missing.copies > 0 && (
                    <button
                      type="button"
                      className="ghost"
                      style={{ marginTop: 6, padding: "5px 9px", fontSize: 12 }}
                      onClick={missingToWishlist}
                    >
                      ♡ Metti le mancanti in wishlist
                    </button>
                  )}
                  {wishMsg && <div className="muted small">{wishMsg}</div>}
                </div>
              )}
            </div>

            <div className="chart">
              <h3>
                Curva di mana{" "}
                <span className="muted small">
                  · magie del main · CMC medio {stats.avgCmc.toFixed(2)}
                </span>
              </h3>
              <div className="mana-curve" role="img" aria-label="Curva di mana">
                {stats.curve.map((b) => (
                  <div key={b.label} className="mc-col" title={`${b.count} carte (${b.creatures} creature) a costo ${b.label}`}>
                    <span className="mc-n">{b.count || ""}</span>
                    <span className="mc-bar" style={{ height: `${(b.count / maxCurve) * 100}%` }}>
                      <span
                        className="mc-cre"
                        style={{ height: b.count ? `${(b.creatures / b.count) * 100}%` : 0 }}
                      />
                    </span>
                    <span className="mc-label">{b.label}</span>
                  </div>
                ))}
              </div>
              <div className="mc-legend muted small">
                <span><i className="mc-swatch cre" /> creature</span>
                <span><i className="mc-swatch oth" /> altre magie</span>
              </div>
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
            <div className="chart">
              <h3>Tipi di creatura (copie main)</h3>
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
            <div className="chart">
              <h3>Pedine usate dal mazzo</h3>
              <TokenList tokens={tokens} loading={enrichBusy} />
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
              (copie, dimensione mazzo). La maybeboard non conta.
            </p>
          </div>
        </div>
      )}

      {sheet && (
        <DeckCardSheet
          deckId={deckId}
          cardId={sheet.id}
          board={sheet.board}
          onMoved={(id, board) => setSheet({ id, board })}
          onClose={() => setSheet(null)}
        />
      )}
      {coverOpen && <CoverPicker deck={deck} onClose={() => setCoverOpen(false)} />}
    </div>
  );
}

// --- Ricerca e aggiunta di carte singole -------------------------------------

function AddCardSearch({ deckId }: { deckId: string }) {
  const decks = useDecks();
  const deck = decks.get(deckId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [opened, setOpened] = useState<CardInfo | null>(null);

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      setResults((await searchCards(q)).slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function add(c: CardInfo, b: Board) {
    decks.addCard(deckId, c, b);
    setLastAdded(`${c.printedName ?? c.name} → ${BOARD_TITLE[b]}`);
  }

  const inDeck = (name: string, b: Board) =>
    (deck?.cards ?? [])
      .filter((c) => c.board === b && c.name === name)
      .reduce((s, c) => s + c.qty, 0);

  return (
    <>
      <strong style={{ fontSize: 14 }}>🔍 Aggiungi carta</strong>
      <form className="row add-card-form" style={{ marginTop: 8 }} onSubmit={doSearch}>
        <input
          type="search"
          className="deck-name-input"
          style={{ margin: 0 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome della carta, anche in italiano…"
          aria-label="Cerca una carta da aggiungere al mazzo"
        />
        <button className="primary" type="submit" disabled={searching || !query.trim()}>
          {searching ? "Cerco…" : "Cerca"}
        </button>
      </form>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        <strong>+Main</strong>, <strong>+Side</strong> o <strong>+Maybe</strong> aggiungono
        una copia. Tocca la carta per vederla e sceglierne l'edizione.
      </p>
      {error && <div className="status-line error" style={{ marginTop: 8 }}>{error}</div>}
      {lastAdded && <div className="add-card-ok small">✓ Aggiunta: {lastAdded}</div>}
      {results && results.length === 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>
          Nessuna carta trovata.
        </div>
      )}
      {results && results.length > 0 && (
        <div className="add-card-results">
          {results.map((c) => {
            const counts = BOARDS.map((b) => [b, inDeck(c.name, b)] as const).filter(
              ([, n]) => n > 0,
            );
            return (
              <div key={c.scryfallId ?? c.name} className="add-card-row deck-add-row">
                <button type="button" className="acr-open" onClick={() => setOpened(c)}>
                  {c.imageSmallUrl ? (
                    <img src={c.imageSmallUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="acr-noimg" />
                  )}
                  <span className="acr-main">
                    <span className="acr-name">
                      {c.printedName ?? c.name}{" "}
                      {c.manaCost && <ManaCost cost={c.manaCost} size={13} />}
                    </span>
                    <span className="muted small">
                      {c.printedName ? `${c.name} · ` : ""}
                      {(c.setCode ?? "").toUpperCase()} · {formatPrice(c)}
                      {counts.length > 0 &&
                        ` · nel mazzo: ${counts.map(([b, n]) => `${n} ${BOARD_LABEL[b]}`).join(", ")}`}
                    </span>
                  </span>
                </button>
                <span className="dar-btns">
                  {BOARDS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`ghost${b === "main" ? " dar-main" : ""}`}
                      onClick={() => add(c, b)}
                      title={`Aggiungi a ${BOARD_TITLE[b]}`}
                    >
                      +{BOARD_LABEL[b]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {opened && <CardDetail card={opened} deckId={deckId} onClose={() => setOpened(null)} />}
    </>
  );
}

// --- Liste delle carte ---------------------------------------------------------

/** Dove spostare con un tocco: dal main al side, dagli altri al main. */
const QUICK_MOVE: Record<Board, Board[]> = {
  main: ["side"],
  side: ["main"],
  maybe: ["main", "side"],
};

function CardList({
  title,
  cards,
  deck,
  board,
  owned,
  onOpen,
}: {
  title: string;
  cards: DeckCard[];
  deck: SavedDeck;
  board: Board;
  owned: Map<string, number>;
  onOpen: (c: DeckCard) => void;
}) {
  const decks = useDecks();
  const cover = deck.coverImageUrl;
  const need = useMemo(() => neededByName(deck), [deck]);
  const sorted = [...cards].sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  return (
    <div className={`deck-board deck-board--${board}`}>
      <h2 className="section-title" style={{ fontSize: 16 }}>
        {title}
      </h2>
      {sorted.length === 0 && (
        <div className="muted small">
          {board === "main"
            ? "Vuoto: cerca una carta qui sopra."
            : board === "side"
              ? "Vuoto. Usa “→ Side” su una carta del main per spostarla qui."
              : "Vuota. Metti qui le carte che stai valutando: non contano nel mazzo."}
        </div>
      )}
      <div className="deck-cardlist">
        {sorted.map((c) => {
          const isCover =
            !!cover && [c.artCropUrl, c.imageUrl, c.imageSmallUrl].includes(cover);
          return (
            <div className="deck-line" key={c.id}>
              <button
                type="button"
                className={`dl-thumb${isCover ? " is-cover" : ""}`}
                title="Apri la carta"
                onClick={() => onOpen(c)}
              >
                {c.imageSmallUrl ? (
                  <img src={c.imageSmallUrl} alt="" loading="lazy" />
                ) : (
                  <span className="dl-thumb-empty" />
                )}
                {isCover && <span className="dl-cover-star">★</span>}
              </button>
              <span className="dl-qty">{c.qty}×</span>
              <button type="button" className="dl-name dl-open" onClick={() => onOpen(c)}>
                <span>{c.name}</span>
                {c.setCode && <span className="dl-set">{c.setCode.toUpperCase()}</span>}
              </button>
              {board !== "maybe" && (
                <OwnBadge
                  card={c}
                  have={owned.get(c.name.toLowerCase()) ?? 0}
                  need={need.get(c.name.toLowerCase()) ?? 0}
                />
              )}
              <span className="stepper">
                <button
                  type="button"
                  aria-label="Una copia in meno"
                  onClick={() => decks.setQty(deck.id, c.id, board, c.qty - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Una copia in più"
                  onClick={() => decks.setQty(deck.id, c.id, board, c.qty + 1)}
                >
                  +
                </button>
              </span>
              {QUICK_MOVE[board].map((to) => (
                <button
                  key={to}
                  type="button"
                  className="ghost dl-move"
                  title={`Sposta una copia in ${BOARD_TITLE[to]}`}
                  onClick={() => decks.moveCard(deck.id, c.id, board, to, 1)}
                >
                  → {BOARD_LABEL[to]}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Pedine -----------------------------------------------------------------

// Immagini delle pedine già scaricate (in memoria, per tutta la sessione).
const tokenImages = new Map<string, string | null>();

function TokenList({
  tokens,
  loading,
}: {
  tokens: ReturnType<typeof deckTokens>;
  loading: boolean;
}) {
  const [, force] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    const todo = tokens.filter((t) => !tokenImages.has(t.id));
    if (todo.length === 0) return;
    todo.forEach((t) => tokenImages.set(t.id, null));
    resolveIdentifiers(todo.map((t) => ({ id: t.id })))
      .then((cards) => {
        for (const c of cards)
          if (c.scryfallId) tokenImages.set(c.scryfallId, c.imageUrl ?? c.imageSmallUrl ?? null);
        force((n) => n + 1);
      })
      .catch(() => undefined);
  }, [tokens]);

  if (tokens.length === 0)
    return (
      <div className="muted small">
        {loading ? "Controllo le pedine delle carte…" : "Nessuna carta del mazzo crea pedine."}
      </div>
    );
  return (
    <>
      <div className="token-grid">
        {tokens.map((t) => {
          const img = tokenImages.get(t.id);
          return (
            <button
              type="button"
              key={t.id}
              className={`token-item${t.inMain ? "" : " side-only"}`}
              onClick={() => img && setZoom(img)}
              title={`Creata da: ${t.from.join(", ")}`}
            >
              {img ? <img src={img} alt={t.name} loading="lazy" /> : <span className="token-noimg">{t.name}</span>}
              <span className="token-name">{t.name}</span>
              <span className="token-from muted">
                da {t.from.join(", ")}
                {!t.inMain && " (side)"}
              </span>
            </button>
          );
        })}
      </div>
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <img className="token-zoom" src={zoom} alt="" />
        </div>
      )}
    </>
  );
}

// --- Copertina ---------------------------------------------------------------

function CoverPicker({ deck, onClose }: { deck: SavedDeck; onClose: () => void }) {
  const decks = useDecks();
  const auto = autoCover(deck);
  // Una sola opzione per carta (stessa illustrazione in main e side).
  const seen = new Set<string>();
  const options: { url: string; name: string }[] = [];
  for (const c of [...deck.cards].sort((a, b) => Number(a.isLand) - Number(b.isLand) || b.cmc - a.cmc)) {
    const url = c.artCropUrl ?? c.imageUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    options.push({ url, name: c.name });
  }
  const pick = (url: string | undefined) => {
    decks.setCover(deck.id, url);
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cover-picker" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h2 style={{ margin: "0 0 4px" }}>Immagine del mazzo</h2>
        <p className="muted small" style={{ margin: "0 0 10px" }}>
          Scegli l'illustrazione di una carta del mazzo. Per un'altra illustrazione
          della stessa carta, aprila e cambia edizione.
        </p>
        <div className="cover-grid">
          <button
            type="button"
            className={`cover-opt${!deck.coverImageUrl ? " active" : ""}`}
            onClick={() => pick(undefined)}
          >
            <span
              className="cover-img"
              style={auto ? { backgroundImage: `url(${auto})` } : undefined}
            />
            <span className="cover-name">Automatica</span>
          </button>
          {options.map((o) => (
            <button
              key={o.url}
              type="button"
              className={`cover-opt${deck.coverImageUrl === o.url ? " active" : ""}`}
              onClick={() => pick(o.url)}
            >
              <span className="cover-img" style={{ backgroundImage: `url(${o.url})` }} />
              <span className="cover-name">{o.name}</span>
            </button>
          ))}
        </div>
        {options.length === 0 && (
          <div className="muted small">Aggiungi qualche carta al mazzo per scegliere l'immagine.</div>
        )}
      </div>
    </div>
  );
}

// --- Possesso delle carte rispetto alla collezione ---------------------------

const isBasicLand = (c: DeckCard) => /\bBasic\b/.test(c.typeLine);

/** Copie richieste per nome, sommando main e sideboard (non la maybeboard). */
function neededByName(deck: SavedDeck): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of deck.cards) {
    if (c.board === "maybe") continue;
    const k = c.name.toLowerCase();
    m.set(k, (m.get(k) ?? 0) + c.qty);
  }
  return m;
}

/** Copie che mancano in collezione (terre base escluse) e il loro costo stimato. */
function missingCards(deck: SavedDeck, owned: Map<string, number>) {
  let copies = 0;
  let valueEur = 0;
  const list: { card: DeckCard; lack: number }[] = [];
  for (const [k, n] of neededByName(deck)) {
    const card = deck.cards.find((c) => c.name.toLowerCase() === k && c.board !== "maybe")!;
    if (isBasicLand(card)) continue;
    const lack = Math.max(0, n - (owned.get(k) ?? 0));
    if (lack > 0) list.push({ card, lack });
    copies += lack;
    valueEur += lack * (card.prices?.eur ?? card.prices?.usd ?? 0);
  }
  return { copies, valueEur, list };
}

function OwnBadge({ card, have, need }: { card: DeckCard; have: number; need: number }) {
  if (isBasicLand(card)) return null;
  if (have >= need)
    return (
      <span className="dl-own ok" title={`Nella collezione: ${have}`}>
        ✓
      </span>
    );
  return (
    <span className="dl-own miss" title={`Nella collezione: ${have} su ${need}`}>
      manca {need - have}
    </span>
  );
}
