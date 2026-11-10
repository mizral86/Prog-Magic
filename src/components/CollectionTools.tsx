// Strumenti della Collezione: import di liste (decklist) e browser dei Set.

import { useEffect, useState } from "react";
import { parseDecklist } from "../deckParser";
import {
  getSetCards,
  getSets,
  resolveCards,
  resolveIdentifiers,
  SetInfo,
} from "../scryfall";
import {
  collectionToCSV,
  downloadText,
  importCollectionCSV,
  makeBackup,
  restoreBackup,
} from "../collectionIO";
import { CardInfo } from "../types";
import { useCollection } from "../collection";
import { useWishlist } from "../wishlist";
import { formatPrice } from "../prices";
import { CardDetail } from "./CardDetail";
import { dayKey } from "../priceHistory";

const AUTO_KEY = "pm.prices.lastAuto";

export function CollectionTools() {
  const [importOpen, setImportOpen] = useState(false);
  const [setsOpen, setSetsOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const collection = useCollection();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Una volta al giorno i prezzi si aggiornano da soli all'apertura della
  // Collezione, così lo storico per spike e cali si riempie senza pensarci.
  useEffect(() => {
    if (collection.entries.length === 0) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(AUTO_KEY);
    } catch {
      /* ignora */
    }
    if (last === dayKey()) return;
    try {
      localStorage.setItem(AUTO_KEY, dayKey());
    } catch {
      /* ignora */
    }
    void refreshPrices(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPrices(auto = false) {
    const ids = collection.entries.map((e) => ({ id: e.id }));
    if (ids.length === 0) {
      if (!auto) setRefreshMsg("La collezione è vuota.");
      return;
    }
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const cards = await resolveIdentifiers(ids, (done, total) =>
        setRefreshMsg(`Aggiorno i prezzi: ${done} di ${total}…`),
      );
      collection.refreshCards(cards);
      setRefreshMsg(
        auto
          ? `Prezzi di oggi aggiornati in automatico (${cards.length} stampe).`
          : `Prezzi aggiornati (${cards.length} stampe).`,
      );
    } catch (err) {
      setRefreshMsg(
        (auto ? "Aggiornamento automatico dei prezzi non riuscito: " : "") +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="coll-tools">
      <div className="coll-tool-bar">
        <button
          type="button"
          className={`ghost${importOpen ? " active" : ""}`}
          onClick={() => setImportOpen((v) => !v)}
        >
          ＋ Importa lista
        </button>
        <button
          type="button"
          className={`ghost${setsOpen ? " active" : ""}`}
          onClick={() => setSetsOpen((v) => !v)}
        >
          🗂 Sfoglia i set
        </button>
        <button
          type="button"
          className={`ghost${csvOpen ? " active" : ""}`}
          onClick={() => setCsvOpen((v) => !v)}
        >
          📄 Importa CSV
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            downloadText(
              "collezione-prog-magic.csv",
              collectionToCSV(collection.entries),
              "text/csv",
            )
          }
          disabled={collection.entries.length === 0}
        >
          ⬇ Esporta CSV
        </button>
        <button
          type="button"
          className={`ghost${backupOpen ? " active" : ""}`}
          onClick={() => setBackupOpen((v) => !v)}
        >
          💾 Backup
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => refreshPrices()}
          disabled={refreshing}
        >
          {refreshing ? "Aggiorno…" : "↻ Aggiorna prezzi"}
        </button>
      </div>
      {refreshMsg && (
        <div className="muted small" style={{ marginTop: 6 }}>
          {refreshMsg}
        </div>
      )}

      {csvOpen && <CsvPanel />}
      {backupOpen && <BackupPanel />}
      {importOpen && <ImportPanel />}
      {setsOpen && <SetBrowser />}
    </div>
  );
}

// --- Import di una lista incollata ------------------------------------------

function ImportPanel() {
  const collection = useCollection();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doImport() {
    const parsed = parseDecklist(text);
    const lines = [...parsed.main, ...parsed.side];
    if (lines.length === 0) {
      setMsg("Nessuna carta riconosciuta nel testo.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { cards, notFound } = await resolveCards(lines.map((l) => l.name));
      let added = 0;
      for (const l of lines) {
        const card = cards.get(l.name.toLowerCase());
        if (card) {
          collection.add(card, { qty: l.quantity });
          added += l.quantity;
        }
      }
      const miss =
        notFound.length > 0
          ? ` · ${notFound.length} non trovate: ${notFound
              .slice(0, 4)
              .join(", ")}${notFound.length > 4 ? "…" : ""}`
          : "";
      setMsg(`Aggiunte ${added} copie alla collezione${miss}`);
      if (added > 0) setText("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-panel">
      <p className="muted small" style={{ margin: "0 0 8px" }}>
        Incolla una decklist (formato Arena/MTGO o testo semplice). Le quantità
        vengono sommate; sideboard incluso.
      </p>
      <textarea
        className="import-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"4 Lightning Bolt\n2 Ragavan, Nimble Pilferer\n1 Fulmine"}
        rows={7}
      />
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
        <button
          type="button"
          className="primary"
          onClick={doImport}
          disabled={busy || !text.trim()}
        >
          {busy ? "Importazione…" : "Importa"}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </div>
  );
}

// --- Import CSV (anche esportato da altre app) ------------------------------

function CsvPanel() {
  const collection = useCollection();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg("Leggo il file…");
    try {
      const res = await importCollectionCSV(await file.text(), setMsg);
      for (const it of res.items) collection.add(it.card, { qty: it.qty, foil: it.foil });
      const miss =
        res.missing.length > 0
          ? ` · ${res.missing.length} righe non riconosciute: ${res.missing
              .slice(0, 4)
              .join(", ")}${res.missing.length > 4 ? "…" : ""}`
          : "";
      setMsg(`Aggiunte ${res.copies} copie alla collezione${miss}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-panel">
      <p className="muted small" style={{ margin: "0 0 8px" }}>
        Carica un CSV esportato da un'altra app di collezione (per esempio
        ManaBox) o da un foglio di calcolo. Servono le colonne{" "}
        <strong>Scryfall ID</strong>, oppure <strong>Name</strong> con{" "}
        <strong>Set code</strong> e <strong>Collector number</strong>. Le colonne{" "}
        <strong>Quantity</strong> e <strong>Foil</strong> sono lette se ci sono.
        Le quantità vengono sommate a quelle che hai già.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {msg && (
        <div className="muted small" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// --- Backup e ripristino ------------------------------------------------------

function BackupPanel() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPending(await file.text());
    setMsg(null);
  }

  function confirmRestore() {
    if (!pending) return;
    try {
      restoreBackup(pending);
      location.reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      setPending(null);
    }
  }

  return (
    <div className="tool-panel">
      <p className="muted small" style={{ margin: "0 0 8px" }}>
        Collezione e mazzi restano solo in questo browser. Scarica un backup ogni
        tanto, oppure usalo per spostare tutto su un altro dispositivo.
      </p>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary"
          onClick={() =>
            downloadText(
              `prog-magic-backup-${new Date().toISOString().slice(0, 10)}.json`,
              makeBackup(),
              "application/json",
            )
          }
        >
          Scarica backup
        </button>
        <label className="ghost-file">
          Ripristina da file…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </div>
      {pending && (
        <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="small">
            Il ripristino sostituisce collezione e mazzi attuali.
          </span>
          <button type="button" className="primary" onClick={confirmRestore}>
            Ripristina
          </button>
          <button type="button" className="ghost" onClick={() => setPending(null)}>
            Annulla
          </button>
        </div>
      )}
      {msg && <div className="status-line error">{msg}</div>}
    </div>
  );
}

// --- Browser dei set ---------------------------------------------------------

/** Stampe diverse possedute per codice set (numero da collezionista). */
function ownedBySet(entries: { setCode?: string; collectorNumber?: string }[]) {
  const m = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.setCode) continue;
    const k = e.setCode.toLowerCase();
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(e.collectorNumber ?? "");
  }
  return m;
}

function SetBrowser() {
  const collection = useCollection();
  const owned = ownedBySet(collection.entries);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SetInfo | null>(null);

  useEffect(() => {
    let alive = true;
    getSets()
      .then((s) => alive && setSets(s))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (selected) {
    return <SetCards set={selected} onBack={() => setSelected(null)} />;
  }

  if (error) {
    return (
      <div className="tool-panel">
        <div className="status-line error">{error}</div>
      </div>
    );
  }
  if (!sets) {
    return (
      <div className="tool-panel">
        <div className="muted small">Caricamento set…</div>
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const shown = sets.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) &&
      (!onlyMine || owned.has(s.code.toLowerCase())),
  );

  return (
    <div className="tool-panel">
      <input
        className="deck-name-input"
        style={{ margin: "0 0 8px" }}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtra set per nome o codice (es. Ravnica, MH3)…"
      />
      <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: "0 0 8px" }}>
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        Solo i set di cui ho carte
      </label>
      <div className="set-list">
        {shown.slice(0, 200).map((s) => (
          <button
            key={s.code}
            type="button"
            className="set-row"
            onClick={() => setSelected(s)}
          >
            {s.iconUrl ? (
              <img className="set-icon" src={s.iconUrl} alt="" aria-hidden />
            ) : (
              <span className="set-icon" />
            )}
            <span className="set-name">{s.name}</span>
            <span className="muted small set-meta">
              {s.code.toUpperCase()} · {s.cardCount} carte
              {s.released ? ` · ${s.released.slice(0, 4)}` : ""}
            </span>
            {owned.has(s.code.toLowerCase()) && (
              <SetProgress have={owned.get(s.code.toLowerCase())!.size} total={s.cardCount} />
            )}
          </button>
        ))}
        {shown.length === 0 && (
          <div className="muted small">Nessun set per "{filter}".</div>
        )}
      </div>
      {!q && !onlyMine && sets.length > 200 && (
        <div className="muted small" style={{ marginTop: 6 }}>
          Mostrati i 200 set più recenti — usa il filtro per trovarne altri.
        </div>
      )}
    </div>
  );
}

function SetProgress({ have, total }: { have: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((have / total) * 100)) : 0;
  return (
    <span className="set-progress" title={`${have} di ${total} carte`}>
      <span className="sp-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="sp-num">
        {have}/{total}
      </span>
    </span>
  );
}

function SetCards({ set, onBack }: { set: SetInfo; onBack: () => void }) {
  const collection = useCollection();
  const wishlist = useWishlist();
  const [show, setShow] = useState<"all" | "missing" | "owned">("all");
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CardInfo | null>(null);

  useEffect(() => {
    let alive = true;
    setCards(null);
    setError(null);
    getSetCards(set.code)
      .then((c) => alive && setCards(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [set.code]);

  return (
    <div className="tool-panel">
      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 8 }}>
        <button type="button" className="ghost" onClick={onBack}>
          ← Set
        </button>
        {set.iconUrl && <img className="set-icon" src={set.iconUrl} alt="" aria-hidden />}
        <strong>{set.name}</strong>
        <span className="muted small">{set.code.toUpperCase()}</span>
      </div>

      {error && <div className="status-line error">{error}</div>}
      {!cards && !error && <div className="muted small">Caricamento carte…</div>}

      {cards && (() => {
        const qtyOf = (c: CardInfo) => {
          const e = c.scryfallId ? collection.get(c.scryfallId) : undefined;
          return e ? e.qty + e.foilQty : 0;
        };
        const have = cards.filter((c) => qtyOf(c) > 0).length;
        const missingCards = cards.filter((c) => qtyOf(c) === 0);
        const list =
          show === "missing" ? missingCards : show === "owned" ? cards.filter((c) => qtyOf(c) > 0) : cards;
        return (
        <>
          <div className="set-head">
            <SetProgress have={have} total={cards.length} />
            <span className="small">
              Hai <strong>{have}</strong> carte su {cards.length}
            </span>
          </div>
          <div className="row" style={{ gap: 6, margin: "8px 0", flexWrap: "wrap", alignItems: "center" }}>
            <span className="view-toggle" role="group" aria-label="Mostra">
              <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>
                Tutte
              </button>
              <button type="button" aria-pressed={show === "missing"} onClick={() => setShow("missing")}>
                Mancanti
              </button>
              <button type="button" aria-pressed={show === "owned"} onClick={() => setShow("owned")}>
                Possedute
              </button>
            </span>
            {show === "missing" && missingCards.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={() => missingCards.forEach((c) => wishlist.add(c))}
              >
                ♡ Tutte le mancanti in wishlist
              </button>
            )}
          </div>
          <div className="card-grid">
            {list.map((c) => (
              <button
                key={c.scryfallId ?? c.name}
                type="button"
                className={`card-cell${qtyOf(c) === 0 ? " not-owned" : ""}`}
                onClick={() => setSelected(c)}
              >
                {qtyOf(c) > 0 && <span className="ct-qty">×{qtyOf(c)}</span>}
                {c.imageSmallUrl ? (
                  <img src={c.imageSmallUrl} alt={c.name} loading="lazy" />
                ) : (
                  <div className="no-img small">{c.name}</div>
                )}
                <span className="card-cell-price">{formatPrice(c)}</span>
              </button>
            ))}
          </div>
        </>
        );
      })()}

      {selected && (
        <CardDetail card={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
