// Barra dei "ripiani" della collezione (tutte, raccoglitori, wishlist) e
// vista della wishlist.

import { useState } from "react";
import { useCollection } from "../collection";
import { useWishlist, wishUnit } from "../wishlist";
import { formatMoney } from "../prices";
import { resolveIdentifiers } from "../scryfall";

export type Shelf = "all" | "wishlist" | string; // stringa = id raccoglitore

export function ShelfBar({ shelf, onChange }: { shelf: Shelf; onChange: (s: Shelf) => void }) {
  const collection = useCollection();
  const wishlist = useWishlist();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const binder = collection.binders.find((b) => b.id === shelf);
  const count = (id?: string) =>
    collection.entries
      .filter((e) => id === undefined || e.binder === id)
      .reduce((a, e) => a + e.qty + e.foilQty, 0);

  function create() {
    if (!name.trim()) return;
    const id = collection.createBinder(name);
    setName("");
    setAdding(false);
    onChange(id);
  }

  return (
    <div className="shelf-wrap">
      <div className="shelf-bar" role="tablist" aria-label="Raccoglitori">
        <button type="button" role="tab" aria-selected={shelf === "all"} onClick={() => onChange("all")}>
          Tutte <span className="shelf-n">{count()}</span>
        </button>
        {collection.binders.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={shelf === b.id}
            onClick={() => {
              onChange(b.id);
              setEditing(false);
              setConfirmDelete(false);
            }}
          >
            {b.name} <span className="shelf-n">{count(b.id)}</span>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={shelf === "wishlist"}
          onClick={() => onChange("wishlist")}
        >
          ♡ Wishlist <span className="shelf-n">{wishlist.items.reduce((a, w) => a + w.qty, 0)}</span>
        </button>
        <button type="button" className="shelf-add" onClick={() => setAdding((v) => !v)}>
          ＋ Raccoglitore
        </button>
      </div>

      {adding && (
        <form
          className="shelf-form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome, es. Raccoglitore rosso, Commander, Scambi…"
          />
          <button type="submit" className="primary" disabled={!name.trim()}>
            Crea
          </button>
        </form>
      )}

      {binder && (
        <div className="shelf-tools">
          {editing ? (
            <form
              className="shelf-form"
              onSubmit={(e) => {
                e.preventDefault();
                collection.renameBinder(binder.id, name);
                setEditing(false);
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="primary">
                Salva
              </button>
            </form>
          ) : confirmDelete ? (
            <>
              <span className="small">
                Eliminare "{binder.name}"? Le carte restano nella collezione.
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  collection.deleteBinder(binder.id);
                  setConfirmDelete(false);
                  onChange("all");
                }}
              >
                Elimina
              </button>
              <button type="button" className="ghost" onClick={() => setConfirmDelete(false)}>
                Annulla
              </button>
            </>
          ) : (
            <>
              <span className="muted small">
                Per mettere una carta qui: aprila e scegli il raccoglitore.
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setName(binder.name);
                  setEditing(true);
                }}
              >
                Rinomina
              </button>
              <button type="button" className="ghost" onClick={() => setConfirmDelete(true)}>
                Elimina
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function WishlistView() {
  const wishlist = useWishlist();
  const collection = useCollection();
  const [msg, setMsg] = useState<string | null>(null);
  const total = wishlist.items.reduce((a, w) => a + wishUnit(w) * w.qty, 0);

  /** "L'ho presa": sposta la carta dalla wishlist alla collezione. */
  async function got(id: string) {
    const w = wishlist.items.find((x) => x.id === id);
    if (!w) return;
    setMsg(null);
    try {
      const ident = /^[0-9a-f-]{36}$/.test(w.id) ? { id: w.id } : { name: w.name };
      const [card] = await resolveIdentifiers([ident]);
      if (!card) throw new Error(`Non trovo ${w.name} su Scryfall.`);
      collection.add(card, { qty: w.qty });
      wishlist.remove(id);
      setMsg(`${w.name} spostata nella collezione.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (wishlist.items.length === 0) {
    return (
      <div className="coming-soon">
        <div className="cs-emoji">♡</div>
        <h2>Wishlist vuota</h2>
        <p className="muted">
          Apri una carta e premi <strong>♡ Wishlist</strong>, oppure da un mazzo usa{" "}
          <strong>Metti le mancanti in wishlist</strong>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="stat-cards coll-stats">
        <div className="stat-card">
          <div className="value">{wishlist.items.reduce((a, w) => a + w.qty, 0)}</div>
          <div className="label">Carte da prendere</div>
        </div>
        <div className="stat-card">
          <div className="value">{wishlist.items.length}</div>
          <div className="label">Carte diverse</div>
        </div>
        <div className="stat-card">
          <div className="value">{formatMoney(total, "EUR")}</div>
          <div className="label">Costo stimato</div>
        </div>
      </div>
      {msg && <div className="status-line">{msg}</div>}
      <div className="collection-list">
        {wishlist.items.map((w) => (
          <div className="collection-row" key={w.id}>
            {w.imageSmallUrl ? (
              <img src={w.imageSmallUrl} alt="" loading="lazy" />
            ) : (
              <div className="no-img small" style={{ width: 46 }}>
                {w.name}
              </div>
            )}
            <div className="cr-main">
              <div className="cr-name">{w.name}</div>
              <div className="muted small">
                {(w.setCode ?? "").toUpperCase()}
                {w.collectorNumber ? ` #${w.collectorNumber}` : ""}
              </div>
              <div className="cr-steppers">
                <span className="stepper">
                  <span className="stepper-label">Copie</span>
                  <button type="button" onClick={() => wishlist.setQty(w.id, w.qty - 1)}>
                    −
                  </button>
                  <span className="stepper-val">{w.qty}</span>
                  <button type="button" onClick={() => wishlist.setQty(w.id, w.qty + 1)}>
                    +
                  </button>
                </span>
              </div>
            </div>
            <div className="cr-right">
              <div className="cr-value">
                {wishUnit(w) > 0 ? formatMoney(wishUnit(w) * w.qty, "EUR") : "—"}
              </div>
              <button type="button" className="ghost" onClick={() => got(w.id)}>
                ✓ Presa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
