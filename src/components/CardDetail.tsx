// Dettaglio carta: immagine grande, testo, prezzi e stampe/edizioni.

import { useEffect, useState } from "react";
import { CardInfo } from "../types";
import { getPrintings } from "../scryfall";
import { bestPrice, formatMoney, formatPrice } from "../prices";
import { useCollection } from "../collection";

interface CardDetailProps {
  card: CardInfo;
  onClose: () => void;
}

export function CardDetail({ card, onClose }: CardDetailProps) {
  const [shown, setShown] = useState<CardInfo>(card);
  const [printings, setPrintings] = useState<CardInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const collection = useCollection();
  const owned = shown.scryfallId ? collection.get(shown.scryfallId) : undefined;

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
              <img src={shown.imageUrl} alt={shown.name} />
            ) : (
              <div className="no-img">{shown.name}</div>
            )}
          </div>
          <div className="detail-body">
            <h2 style={{ margin: "0 0 2px" }}>{shown.name}</h2>
            <div className="muted small">
              {shown.manaCost && <span className="mono">{shown.manaCost} · </span>}
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
