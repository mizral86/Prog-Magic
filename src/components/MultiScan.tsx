// Scansione di più carte da una sola foto: per esempio una pagina di un
// raccoglitore (3×3). La foto viene divisa in una griglia, ogni casella viene
// letta con l'OCR e alla fine si sceglie quante copie (e foil) aggiungere per
// ogni carta, anche quelle nascoste dietro nella tasca.

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useCollection } from "../collection";
import { formatMoney, formatPrice } from "../prices";
import { Area, cellThumb, gridCells, recognizeInCell, warmUpScanner } from "../scanner";
import { getPrintings, searchCards } from "../scryfall";
import { CardInfo } from "../types";

interface Item {
  key: number;
  thumb: string;
  card: CardInfo | null;
  read: string;
  qty: number;
  foil: number;
  state: "pending" | "reading" | "done";
}

interface Added {
  id: string;
  qty: number;
  foil: number;
}

const PRESETS: { label: string; rows: number; cols: number }[] = [
  { label: "3×3 · pagina da 9", rows: 3, cols: 3 },
  { label: "3×4 · da 12", rows: 3, cols: 4 },
  { label: "2×2 · da 4", rows: 2, cols: 2 },
];

const DEFAULT_AREA: Area = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
const MAX_SIDE = 3200;

function loadGrid(): { rows: number; cols: number } {
  try {
    const g = JSON.parse(localStorage.getItem("pm.scanGrid") ?? "null");
    if (g && g.rows >= 1 && g.cols >= 1) return { rows: g.rows, cols: g.cols };
  } catch {
    /* ignora */
  }
  return { rows: 3, cols: 3 };
}

function unitPrice(card: CardInfo, foil: boolean): number {
  return (foil ? card.prices?.eurFoil ?? card.prices?.eur : card.prices?.eur) ?? 0;
}

export function MultiScan() {
  const collection = useCollection();
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [grid, setGridState] = useState(loadGrid);
  const [area, setArea] = useState<Area>(DEFAULT_AREA);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ list: Added[]; copies: number } | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    warmUpScanner();
    return () => {
      cancelRef.current = true;
    };
  }, []);

  function setGrid(rows: number, cols: number) {
    const g = { rows: Math.min(6, Math.max(1, rows)), cols: Math.min(6, Math.max(1, cols)) };
    setGridState(g);
    try {
      localStorage.setItem("pm.scanGrid", JSON.stringify(g));
    } catch {
      /* ignora */
    }
  }

  function showFrame(c: HTMLCanvasElement) {
    setFrame(c);
    setPreview(c.toDataURL("image/jpeg", 0.8));
  }

  async function loadPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setItems(null);
    setAdded(null);
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      setArea(DEFAULT_AREA);
      showFrame(c);
    } catch {
      setError("Non riesco ad aprire questa immagine. Prova con un'altra foto.");
    }
  }

  function rotate() {
    if (!frame) return;
    const c = document.createElement("canvas");
    c.width = frame.height;
    c.height = frame.width;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(frame, 0, 0);
    setArea(DEFAULT_AREA);
    setItems(null);
    showFrame(c);
  }

  async function readAll() {
    if (!frame) return;
    cancelRef.current = false;
    setBusy(true);
    setError(null);
    setAdded(null);
    const cells = gridCells(frame.width, frame.height, area, grid.rows, grid.cols);
    const base = Date.now();
    const list: Item[] = cells.map((cell, i) => ({
      key: base + i,
      thumb: cellThumb(frame, cell),
      card: null,
      read: "",
      qty: 1,
      foil: 0,
      state: "pending",
    }));
    setItems(list);
    const patch = (i: number, p: Partial<Item>) =>
      setItems((cur) => cur && cur.map((it, j) => (j === i ? { ...it, ...p } : it)));
    try {
      for (let i = 0; i < cells.length; i++) {
        if (cancelRef.current) break;
        patch(i, { state: "reading" });
        const r = await recognizeInCell(frame, cells[i]);
        patch(i, {
          state: "done",
          card: r.card,
          read: r.readName || r.readInfo,
          qty: r.card ? 1 : 0,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Lettura non riuscita. Controlla la connessione e riprova.",
      );
      setItems((cur) => cur && cur.map((it) => (it.state === "done" ? it : { ...it, state: "done" })));
    } finally {
      setBusy(false);
    }
  }

  function update(key: number, p: Partial<Item>) {
    setItems((cur) => cur && cur.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }

  function addAll() {
    if (!items) return;
    const list: Added[] = [];
    let copies = 0;
    for (const it of items) {
      if (!it.card?.scryfallId || it.qty + it.foil <= 0) continue;
      if (it.qty > 0) collection.add(it.card, { qty: it.qty });
      if (it.foil > 0) collection.add(it.card, { qty: it.foil, foil: true });
      list.push({ id: it.card.scryfallId, qty: it.qty, foil: it.foil });
      copies += it.qty + it.foil;
    }
    setAdded({ list, copies });
    setItems(null);
    setFrame(null);
    setPreview(null);
    navigator.vibrate?.(60);
  }

  function undoAdd() {
    if (!added) return;
    // Più righe possono riferirsi alla stessa stampa: sommiamo prima.
    const tot = new Map<string, { qty: number; foil: number }>();
    for (const a of added.list) {
      const t = tot.get(a.id) ?? { qty: 0, foil: 0 };
      tot.set(a.id, { qty: t.qty + a.qty, foil: t.foil + a.foil });
    }
    for (const [id, t] of tot) {
      const e = collection.get(id);
      if (!e) continue;
      if (t.qty) collection.setQty(id, e.qty - t.qty);
      if (t.foil) collection.setFoilQty(id, e.foilQty - t.foil);
    }
    setAdded(null);
  }

  const done = items?.filter((i) => i.state === "done").length ?? 0;
  const recognized = items?.filter((i) => i.card).length ?? 0;
  const copies = items?.reduce((a, i) => a + (i.card ? i.qty + i.foil : 0), 0) ?? 0;
  const value =
    items?.reduce(
      (a, i) => a + (i.card ? i.qty * unitPrice(i.card, false) + i.foil * unitPrice(i.card, true) : 0),
      0,
    ) ?? 0;

  return (
    <div className="multi-scan">
      {added && (
        <div className="scan-last multi-added">
          <div className="ma-check">✓</div>
          <div>
            <strong>
              Aggiunte {added.copies} {added.copies === 1 ? "copia" : "copie"} alla collezione
            </strong>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <button type="button" className="ghost" onClick={undoAdd}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {!preview && (
        <div className="scan-view multi-empty">
          <div className="scan-placeholder">
            <p>
              Fotografa una <strong>pagina intera</strong> del raccoglitore (o più carte
              affiancate), dritta e senza riflessi. Riconosco tutte le carte e poi scegli
              quante copie hai di ognuna, anche quelle nascoste dietro nella tasca.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <label className="primary-file">
                📷 Scatta foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    void loadPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="ghost-file">
                🖼 Dalla galleria
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void loadPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {preview && frame && (
        <>
          <div className="multi-grid-opts">
            <div className="chips">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`chip toggle${grid.rows === p.rows && grid.cols === p.cols ? " on" : ""}`}
                  onClick={() => setGrid(p.rows, p.cols)}
                  disabled={busy}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <NumStep label="Righe" value={grid.rows} onChange={(v) => setGrid(v, grid.cols)} />
              <NumStep label="Colonne" value={grid.cols} onChange={(v) => setGrid(grid.rows, v)} />
              <button type="button" className="ghost" onClick={rotate} disabled={busy}>
                ↻ Ruota
              </button>
            </div>
          </div>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>
            Trascina i quattro angoli sui bordi delle carte: ogni casella della griglia
            deve contenere una carta.
          </p>
          <GridEditor
            src={preview}
            ratio={frame.width / frame.height}
            area={area}
            onChange={setArea}
            rows={grid.rows}
            cols={grid.cols}
            items={items}
            disabled={busy}
          />
          <div className="scan-controls">
            {busy ? (
              <button type="button" className="ghost" onClick={() => (cancelRef.current = true)}>
                Ferma ({done}/{items?.length ?? 0})
              </button>
            ) : (
              <button type="button" className="primary" onClick={readAll}>
                {items ? "Rileggi la foto" : `Riconosci ${grid.rows * grid.cols} carte`}
              </button>
            )}
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setFrame(null);
                setPreview(null);
                setItems(null);
              }}
            >
              Cambia foto
            </button>
          </div>
        </>
      )}

      {error && <div className="status-line error">{error}</div>}

      {items && (
        <>
          <div className="scan-summary">
            <span>
              {busy ? (
                <>Leggo la carta {Math.min(done + 1, items.length)} di {items.length}…</>
              ) : (
                <>
                  Riconosciute <strong>{recognized}</strong> di {items.length}
                </>
              )}
            </span>
            <strong>{formatMoney(value, "EUR")}</strong>
          </div>
          <div className="collection-list">
            {items.map((it, i) => (
              <MultiRow key={it.key} n={i + 1} item={it} onChange={(p) => update(it.key, p)} />
            ))}
          </div>
          {!busy && (
            <div className="multi-footer">
              <button
                type="button"
                className="primary"
                disabled={copies === 0}
                onClick={addAll}
              >
                Aggiungi {copies} {copies === 1 ? "copia" : "copie"} alla collezione
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NumStep({
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
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`Meno ${label}`}>
        −
      </button>
      <span className="stepper-val">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`Più ${label}`}>
        +
      </button>
    </span>
  );
}

// --- Foto con la griglia regolabile -----------------------------------------

type Corner = "tl" | "tr" | "bl" | "br";

function GridEditor({
  src,
  ratio,
  area,
  onChange,
  rows,
  cols,
  items,
  disabled,
}: {
  src: string;
  ratio: number;
  area: Area;
  onChange: (a: Area) => void;
  rows: number;
  cols: number;
  items: Item[] | null;
  disabled: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Corner | null>(null);

  function onDown(corner: Corner, e: ReactPointerEvent) {
    if (disabled) return;
    drag.current = corner;
    (e.target as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e: ReactPointerEvent) {
    const corner = drag.current;
    const box = boxRef.current;
    if (!corner || !box) return;
    const r = box.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    let x1 = area.x;
    let y1 = area.y;
    let x2 = area.x + area.w;
    let y2 = area.y + area.h;
    const MIN = 0.08;
    if (corner === "tl" || corner === "bl") x1 = Math.min(px, x2 - MIN);
    else x2 = Math.max(px, x1 + MIN);
    if (corner === "tl" || corner === "tr") y1 = Math.min(py, y2 - MIN);
    else y2 = Math.max(py, y1 + MIN);
    onChange({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }

  function onUp() {
    drag.current = null;
  }

  const cells: { r: number; c: number; i: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c, i: r * cols + c });

  return (
    <div className="grid-editor-wrap">
      <div
        className="grid-editor"
        ref={boxRef}
        style={{ aspectRatio: String(ratio) }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img src={src} alt="Foto da scansionare" draggable={false} />
        <div
          className="ge-area"
          style={{
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.w * 100}%`,
            height: `${area.h * 100}%`,
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {cells.map(({ i }) => {
            const it = items?.[i];
            const cls = !it
              ? ""
              : it.state === "reading"
                ? " reading"
                : it.state === "done"
                  ? it.card
                    ? " ok"
                    : " miss"
                  : "";
            return (
              <div key={i} className={`ge-cell${cls}`}>
                <span>{i + 1}</span>
              </div>
            );
          })}
          {(["tl", "tr", "bl", "br"] as Corner[]).map((c) => (
            <div
              key={c}
              className={`ge-handle ${c}`}
              onPointerDown={(e) => onDown(c, e)}
              aria-label="Sposta l'angolo della griglia"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Una riga dei risultati --------------------------------------------------

function MultiRow({
  n,
  item,
  onChange,
}: {
  n: number;
  item: Item;
  onChange: (p: Partial<Item>) => void;
}) {
  const collection = useCollection();
  const [fixing, setFixing] = useState(false);
  const [prints, setPrints] = useState<CardInfo[] | null>(null);
  const [loadingPrints, setLoadingPrints] = useState(false);
  const card = item.card;
  const owned = card?.scryfallId ? collection.get(card.scryfallId) : undefined;
  const ownedN = owned ? owned.qty + owned.foilQty : 0;

  async function openPrints() {
    if (!card) return;
    setLoadingPrints(true);
    try {
      setPrints(await getPrintings(card.name));
    } catch {
      setPrints([]);
    } finally {
      setLoadingPrints(false);
    }
  }

  return (
    <div className={`multi-row${card ? "" : " missing"}${item.qty + item.foil === 0 ? " skipped" : ""}`}>
      <div className="mr-imgs">
        <img className="mr-photo" src={item.thumb} alt={`Casella ${n} della foto`} />
        {card?.imageSmallUrl && <img className="mr-card" src={card.imageSmallUrl} alt="" loading="lazy" />}
      </div>
      <div className="mr-main">
        <div className="muted small">Casella {n}</div>
        {item.state !== "done" ? (
          <div className="muted">{item.state === "reading" ? "Leggo…" : "In attesa"}</div>
        ) : card ? (
          <>
            <div className="cr-name">{card.printedName ?? card.name}</div>
            <div className="muted small">
              {(card.setCode ?? "").toUpperCase()}
              {card.collectorNumber ? ` #${card.collectorNumber}` : ""} · {formatPrice(card)}
              {ownedN > 0 && ` · ne hai già ${ownedN}`}
            </div>
            {prints ? (
              <select
                className="mr-prints"
                value={card.scryfallId}
                onChange={(e) => {
                  const p = prints.find((x) => x.scryfallId === e.target.value);
                  if (p) onChange({ card: p });
                }}
              >
                {!prints.some((p) => p.scryfallId === card.scryfallId) && (
                  <option value={card.scryfallId}>
                    {(card.setCode ?? "").toUpperCase()} #{card.collectorNumber}
                  </option>
                )}
                {prints.map((p) => (
                  <option key={p.scryfallId} value={p.scryfallId}>
                    {p.setName ?? (p.setCode ?? "").toUpperCase()} #{p.collectorNumber} · {formatPrice(p)}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="mr-steps">
              <Step label="Copie" value={item.qty} onChange={(v) => onChange({ qty: v })} />
              <Step label="Foil" value={item.foil} onChange={(v) => onChange({ foil: v })} />
            </div>
            <div className="row mr-actions">
              {!prints && (
                <button type="button" className="link-btn small" onClick={openPrints} disabled={loadingPrints}>
                  {loadingPrints ? "Carico…" : "Cambia edizione"}
                </button>
              )}
              <button type="button" className="link-btn small" onClick={() => setFixing((f) => !f)}>
                Non è questa
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mr-miss">Non riconosciuta</div>
            <div className="muted small">
              {item.read ? `Ho letto "${item.read}". ` : ""}Se è una tasca vuota lasciala così.
            </div>
            {!fixing && (
              <button type="button" className="link-btn small" onClick={() => setFixing(true)}>
                Cerca la carta a mano
              </button>
            )}
          </>
        )}
        {fixing && item.state === "done" && (
          <FixSearch
            initial={card ? "" : item.read}
            onPick={(c) => {
              setFixing(false);
              setPrints(null);
              onChange({ card: c, qty: Math.max(1, item.qty), foil: card ? item.foil : 0 });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Step({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="stepper">
      <span className="stepper-label">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Togli ${label}`}>
        −
      </button>
      <span className="stepper-val">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`Aggiungi ${label}`}>
        +
      </button>
    </span>
  );
}

function FixSearch({ initial, onPick }: { initial: string; onPick: (c: CardInfo) => void }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CardInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults((await searchCards(q)).slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mr-fix">
      <form className="row" style={{ gap: 6 }} onSubmit={search}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome della carta, anche in italiano…"
          aria-label="Cerca la carta"
        />
        <button type="submit" className="primary" disabled={busy || !q.trim()}>
          {busy ? "…" : "Cerca"}
        </button>
      </form>
      {error && <div className="status-line error">{error}</div>}
      {results && results.length === 0 && <div className="muted small">Nessuna carta trovata.</div>}
      {results && results.length > 0 && (
        <div className="mr-fix-results">
          {results.map((c) => (
            <button key={c.scryfallId ?? c.name} type="button" onClick={() => onPick(c)}>
              {c.imageSmallUrl ? <img src={c.imageSmallUrl} alt="" loading="lazy" /> : <span className="acr-noimg" />}
              <span>
                <span className="acr-name">{c.printedName ?? c.name}</span>
                <span className="muted small">
                  {" "}
                  {(c.setCode ?? "").toUpperCase()} · {formatPrice(c)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
