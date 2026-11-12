// Scheda "Info" del mazzo: valore, nome e formato, note, prova del mazzo
// (mano iniziale), legalità, confronto nel simulatore, import/export, date.

import { ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FORMATS, Format, isScryfallId, useDecks } from "../decks";
import type { DeckCard, SavedDeck } from "../decks";
import { deckStats, legalityIssues } from "../deckStats";
import { formatMoney } from "../prices";
import { ownedByName, useCollection } from "../collection";
import { useWishlist } from "../wishlist";
import { setCompareSlot } from "../compareTray";
import { deckToText, parseAndResolve } from "../deckIO";
import { missingCards } from "./DeckParts";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });

export function DeckInfoTab({
  deck,
  onBack,
  onCover,
}: {
  deck: SavedDeck;
  onBack: () => void;
  onCover: () => void;
}) {
  const decks = useDecks();
  const navigate = useNavigate();
  const stats = useMemo(() => deckStats(deck), [deck]);
  const issues = useMemo(() => legalityIssues(deck), [deck]);
  const collection = useCollection();
  const owned = useMemo(() => ownedByName(collection.entries), [collection.entries]);
  const missing = useMemo(() => missingCards(deck, owned), [deck, owned]);
  const wishlist = useWishlist();
  const [wishMsg, setWishMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const mainEmpty = stats.mainCount === 0;

  function missingToWishlist() {
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

  async function doImport() {
    setBusy(true);
    setImportMsg(null);
    try {
      const { cards, unresolved } = await parseAndResolve(importText);
      const maybe = deck.cards.filter((c) => c.board === "maybe");
      decks.replaceCards(deck.id, [...cards, ...maybe]);
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

  function sendToSim(slot: "A" | "B") {
    setCompareSlot(slot, { name: deck.name, text: deckToText(deck) });
    navigate("/simula");
  }

  return (
    <div className="deck-info">
      {/* Valore */}
      <div className="panel stat-panel">
        <h3 className="stat-title">
          Valore <span className="muted small">({stats.mainCount + stats.sideCount} carte, main + side)</span>
        </h3>
        <div className="value-band">
          <div>
            <span className="vb-label">Mazzo</span>
            <strong>{formatMoney(stats.totalPriceEur, "EUR")}</strong>
          </div>
          <div>
            <span className="vb-label">Da procurare</span>
            <strong style={{ color: missing.copies > 0 ? "var(--bad)" : "var(--good)" }}>
              {missing.copies > 0 ? formatMoney(missing.valueEur, "EUR") : "✓ niente"}
            </strong>
          </div>
          <div>
            <span className="vb-label">Maybeboard</span>
            <strong>{formatMoney(stats.maybePriceEur, "EUR")}</strong>
          </div>
        </div>
        {stats.missingPrice > 0 && (
          <div className="muted small">{stats.missingPrice} carte senza prezzo.</div>
        )}
        {missing.copies > 0 && (
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <span className="muted small">Ti mancano {missing.copies} copie.</span>
            <button type="button" className="ghost" onClick={missingToWishlist}>
              ♡ Metti le mancanti in wishlist
            </button>
            {wishMsg && <span className="muted small">{wishMsg}</span>}
          </div>
        )}
      </div>

      {/* Nome, formato, immagine */}
      <div className="panel stat-panel">
        <h3 className="stat-title">Mazzo</h3>
        <div className="deck-editor-head">
          <input
            className="deck-name-input"
            value={deck.name}
            onChange={(e) => decks.rename(deck.id, e.target.value)}
            aria-label="Nome del mazzo"
            style={{ margin: 0, flex: "1 1 100%", fontWeight: 700 }}
          />
          <select
            className="deck-name-input"
            style={{ margin: 0, width: "auto" }}
            value={deck.format}
            onChange={(e) => decks.setFormat(deck.id, e.target.value as Format)}
            aria-label="Formato"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" onClick={onCover}>
            🖼 Cambia immagine
          </button>
        </div>
      </div>

      <Notes deck={deck} />

      <Playtest deck={deck} />

      {/* Legalità */}
      <div className="panel stat-panel">
        <h3 className="stat-title">Legalità · {FORMAT_LABEL[deck.format]}</h3>
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
      </div>

      {/* Strumenti */}
      <div className="panel stat-panel">
        <h3 className="stat-title">Strumenti</h3>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="ghost" onClick={() => sendToSim("A")} disabled={mainEmpty}>
            ⚔ Simula come Mazzo A
          </button>
          <button type="button" className="ghost" onClick={() => sendToSim("B")} disabled={mainEmpty}>
            ⚔ Simula come Mazzo B
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setImportOpen((v) => !v);
              setExportText(null);
            }}
          >
            Importa lista
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setExportText(deckToText(deck));
              setImportOpen(false);
            }}
          >
            Esporta lista
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
                {busy ? "Importo…" : "Sostituisci main e side con questa lista"}
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

      <div className="deck-dates muted small">
        <div>Modificato: {dateFmt.format(deck.updatedAt)}</div>
        <div>Creato: {dateFmt.format(deck.createdAt)}</div>
      </div>
      <div style={{ textAlign: "center", margin: "10px 0 20px" }}>
        <button
          type="button"
          className="ghost danger-btn"
          onClick={() => {
            if (confirm(`Eliminare il mazzo "${deck.name}"?`)) {
              decks.remove(deck.id);
              onBack();
            }
          }}
        >
          Elimina mazzo
        </button>
      </div>
    </div>
  );
}

// --- Note -------------------------------------------------------------------

function Notes({ deck }: { deck: SavedDeck }) {
  const decks = useDecks();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deck.notes ?? "");
  const text = deck.notes ?? "";
  return (
    <div className="panel stat-panel">
      <div className="notes-head">
        <h3 className="stat-title">Note</h3>
        {!editing && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            ✎ {text ? "Modifica" : "Scrivi"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            className="deck-input notes-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              "# Strategia\nCome vince il mazzo, cosa cercare nella mano iniziale…\n\n# Piano di side\n- contro aggro: +2 …\n- contro controllo: …"
            }
          />
          <p className="muted small" style={{ margin: "4px 0 6px" }}>
            Righe con <code>#</code> diventano titoli, con <code>-</code> elenchi, <code>**testo**</code> è in
            grassetto.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="primary"
              onClick={() => {
                decks.setNotes(deck.id, draft.trim());
                setEditing(false);
              }}
            >
              Salva
            </button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>
              Annulla
            </button>
          </div>
        </>
      ) : text ? (
        <div className="notes-view">{renderNotes(text)}</div>
      ) : (
        <div className="muted small">Strategia, condizioni di vittoria, piano di side…</div>
      )}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : /^\*[^*]+\*$/.test(part) ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}

function renderNotes(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^[-*•]\s+/.test(t)) {
      list.push(t.replace(/^[-*•]\s+/, ""));
      continue;
    }
    flush();
    if (!t) continue;
    if (t.startsWith("## ")) out.push(<h5 key={out.length}>{inline(t.slice(3))}</h5>);
    else if (t.startsWith("# ")) out.push(<h4 key={out.length}>{inline(t.slice(2))}</h4>);
    else out.push(<p key={out.length}>{inline(t)}</p>);
  }
  flush();
  return out;
}

// --- Prova mazzo: mano iniziale e pescate ---------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Playtest({ deck }: { deck: SavedDeck }) {
  const pool = useMemo(() => {
    const out: DeckCard[] = [];
    for (const c of deck.cards) if (c.board === "main") for (let i = 0; i < c.qty; i++) out.push(c);
    return out;
  }, [deck]);
  const [library, setLibrary] = useState<DeckCard[] | null>(null);
  const [hand, setHand] = useState<DeckCard[]>([]);
  const [mulligans, setMulligans] = useState(0);

  function newHand(mull = 0) {
    const lib = shuffle(pool);
    setHand(lib.slice(0, 7));
    setLibrary(lib.slice(7));
    setMulligans(mull);
  }
  function draw() {
    if (!library?.length) return;
    setHand((h) => [...h, library[0]]);
    setLibrary(library.slice(1));
  }
  const lands = hand.filter((c) => c.isLand).length;

  return (
    <div className="panel stat-panel">
      <h3 className="stat-title">Prova mazzo</h3>
      {pool.length < 7 ? (
        <div className="muted small">Servono almeno 7 carte nel main.</div>
      ) : !library ? (
        <button type="button" className="primary" onClick={() => newHand()}>
          🃏 Pesca la mano iniziale
        </button>
      ) : (
        <>
          <div className="pt-info muted small">
            {hand.length} carte in mano · {lands} terre · {library.length} nel grimorio
            {mulligans > 0 && ` · mulligan ${mulligans}: metti ${mulligans} carte in fondo`}
          </div>
          <div className="pt-hand">
            {hand.map((c, i) => (
              <span key={i} className="pt-card" title={c.name}>
                {c.imageUrl || c.imageSmallUrl ? (
                  <img src={c.imageUrl ?? c.imageSmallUrl} alt={c.name} loading="lazy" />
                ) : (
                  <span className="token-noimg">{c.name}</span>
                )}
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="ghost" onClick={draw} disabled={!library.length}>
              + Pesca
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => newHand(Math.min(mulligans + 1, 6))}
            >
              ↺ Mulligan
            </button>
            <button type="button" className="primary" onClick={() => newHand()}>
              Nuova mano
            </button>
          </div>
        </>
      )}
    </div>
  );
}
