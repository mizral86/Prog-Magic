// Dettaglio carta: immagine grande, testo, prezzi e stampe/edizioni.

import { useEffect, useState } from "react";
import { CardInfo } from "../types";
import { getPrintings } from "../scryfall";
import { bestPrice, formatMoney, formatPrice } from "../prices";
import { useCollection } from "../collection";
import { useWishlist } from "../wishlist";
import { ManaCost } from "./ManaSymbol";

interface CardDetailProps {
  card: CardInfo;
  onClose: () => void;
}

export function CardDetail({ card, onClose }: CardDetailProps) {
  const [shown, setShown] = useState<CardInfo>(card);
  const [printings, setPrintings] = useState<CardInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const collection = useCollection();
  const owned = shown.scryfallId ? collection.get(shown.scryfallId) : undefined;
  const wishlist = useWishlist();
  const wishId = shown.scryfallId ?? shown.name.toLowerCase();
  const inWishlist = wishlist.has(wishId);

  useEffect(() => {
    setShown(card);
  }, [card]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPrintings(null);
    getPrintings(card.name)
      .then((p) => {
        if (!cancelled) setPrintings(p);
      })
      .catch(() => {
        if (!cancelled) setPrintings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card.name]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Chiudi"
        >
          ✕
        </button>
        <div className="detail">
          <div className="detail-img">
            {shown.imageUrl ? (
              <button
                type="button"
                className="detail-zoom-btn"
                onClick={() => setZoomOpen(true)}
                aria-label="Ingrandisci la carta"
                title="Tocca per ingrandire"
              >
                <img src={shown.imageUrl} alt={shown.name} />
                <span className="zoom-hint" aria-hidden="true">⤢ Ingrandisci</span>
              </button>
            ) : (
              <div className="no-img">{shown.name}</div>
            )}
          </div>
          <div className="detail-body">
            <h2 style={{ margin: "0 0 2px" }}>{shown.name}</h2>
            <div className="muted small">
              {shown.manaCost && (
                <>
                  <ManaCost cost={shown.manaCost} size={16} />{" "}·{" "}
                </>
              )}
              {shown.typeLine}
            </div>
            {shown.oracleText && (
              <p className="oracle">{shown.oracleText}</p>
            )}

            <div className="price-row">
              <PriceTag label="Prezzo" card={shown} />
              {shown.setName && (
                <span className="badge">
                  {shown.setName}
                  {shown.collectorNumber ? ` #${shown.collectorNumber}` : ""}
                </span>
              )}
              {shown.rarity && <span className="badge">{shown.rarity}</span>}
            </div>

            <div className="collect-box">
              <div className="collect-status">
                In collezione:{" "}
                <strong>{owned?.qty ?? 0}</strong> normali
                {" · "}
                <strong>{owned?.foilQty ?? 0}</strong> foil
              </div>
              <div className="collect-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => collection.add(shown, { foil: false })}
                >
                  + Aggiungi
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => collection.add(shown, { foil: true })}
                >
                  + Foil
                </button>
                {owned && owned.qty > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      collection.setQty(owned.id, owned.qty - 1)
                    }
                  >
                    − Normale
                  </button>
                )}
                <button
                  type="button"
                  className={`ghost${inWishlist ? " active" : ""}`}
                  onClick={() => (inWishlist ? wishlist.remove(wishId) : wishlist.add(shown))}
                  title={inWishlist ? "Togli dalla wishlist" : "Aggiungi alla wishlist"}
                >
                  {inWishlist ? "♥ In wishlist" : "♡ Wishlist"}
                </button>
                {owned && owned.foilQty > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      collection.setFoilQty(owned.id, owned.foilQty - 1)
                    }
                  >
                    − Foil
                  </button>
                )}
              </div>
            </div>

            {owned && (
              <label className="binder-pick">
                Raccoglitore
                <select
                  value={owned.binder ?? ""}
                  onChange={(e) => collection.setBinder(owned.id, e.target.value || undefined)}
                >
                  <option value="">Nessuno</option>
                  {collection.binders.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <h3 className="mini-title">Stampe / edizioni</h3>
            {loading && <div className="muted small">Carico le stampe…</div>}
            {printings && printings.length > 0 && (
              <div className="printings">
                {printings.map((pr) => {
                  const p = bestPrice(pr);
                  const active = pr.scryfallId === shown.scryfallId;
                  return (
                    <button
                      key={pr.scryfallId ?? pr.setCode + pr.collectorNumber!}
                      type="button"
                      className={`printing ${active ? "active" : ""}`}
                      onClick={() => setShown(pr)}
                      title={pr.setName}
                    >
                      <span className="set">
                        {(pr.setCode ?? "").toUpperCase()}
                        <span className="muted"> #{pr.collectorNumber}</span>
                      </span>
                      <span className="pprice">
                        {p ? formatMoney(p.value, p.currency) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {printings && printings.length === 0 && !loading && (
              <div className="muted small">Nessuna stampa trovata.</div>
            )}
          </div>
        </div>
      </div>
      {zoomOpen && shown.imageUrl && (
        <CardZoom
          src={shown.imageLargeUrl ?? shown.imageUrl}
          alt={shown.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}

function PriceTag({ label, card }: { label: string; card: CardInfo }) {
  return (
    <span className="price-tag">
      <span className="muted small">{label}</span>
      <strong>{formatPrice(card)}</strong>
    </span>
  );
}


/**
 * Carta a tutto schermo. Tocca per ingrandire il punto toccato (e di nuovo per
 * tornare a vista intera); da ingrandita si scorre col dito per leggere i
 * dettagli. Sul telefono funziona anche il pizzico con due dita.
 */
function CardZoom({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(e: React.MouseEvent<HTMLImageElement>) {
    e.stopPropagation();
    const img = e.currentTarget;
    const box = img.parentElement as HTMLElement;
    const rect = img.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const next = !zoomed;
    setZoomed(next);
    if (next) {
      // Dopo il render ingrandito, porta in vista il punto toccato.
      requestAnimationFrame(() => {
        box.scrollLeft = fx * img.offsetWidth - box.clientWidth / 2;
        box.scrollTop = fy * img.offsetHeight - box.clientHeight / 2;
      });
    }
  }

  return (
    <div
      className="card-zoom"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-label={`${alt} ingrandita`}
    >
      <div className={`card-zoom-box${zoomed ? " zoomed" : ""}`}>
        <img src={src} alt={alt} onClick={toggle} draggable={false} />
      </div>
      <button
        type="button"
        className="card-zoom-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Chiudi"
      >
        ✕
      </button>
      <div className="card-zoom-hint">
        {zoomed ? "Scorri per muoverti · tocca per rimpicciolire" : "Tocca la carta per ingrandire"}
      </div>
    </div>
  );
}
