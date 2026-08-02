// Miniatura di una carta (immagine Scryfall) con fallback testuale e
// anteprima ingrandita al passaggio del mouse.

import { useState } from "react";
import { CardInfo } from "../types";

interface CardThumbProps {
  name: string;
  lookup: Map<string, CardInfo>;
  size?: number; // larghezza in px
}

const PREVIEW_W = 280;
const PREVIEW_H = 390;

export function CardThumb({ name, lookup, size = 56 }: CardThumbProps) {
  const card = lookup.get(name.toLowerCase());
  const url = card?.imageSmallUrl ?? card?.imageUrl;
  const bigUrl = card?.imageUrl ?? card?.imageSmallUrl;
  const height = Math.round(size * 1.396);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  if (!url) {
    return (
      <span className="card-thumb card-thumb--text" title={name} style={{ width: size }}>
        {name}
      </span>
    );
  }

  const move = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  const leave = () => setPos(null);

  return (
    <span
      className="card-thumb"
      title={name}
      onMouseEnter={move}
      onMouseMove={move}
      onMouseLeave={leave}
    >
      <img
        src={url}
        alt={name}
        loading="lazy"
        width={size}
        height={height}
        style={{ borderRadius: size * 0.06 }}
      />
      {pos && bigUrl && <Preview url={bigUrl} name={name} x={pos.x} y={pos.y} />}
    </span>
  );
}

function Preview({
  url,
  name,
  x,
  y,
}: {
  url: string;
  name: string;
  x: number;
  y: number;
}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 20;
  if (left + PREVIEW_W > vw - 8) left = x - 20 - PREVIEW_W;
  if (left < 8) left = 8;
  let top = y - PREVIEW_H / 2;
  top = Math.max(8, Math.min(top, vh - PREVIEW_H - 8));

  return (
    <span className="card-preview" style={{ left, top, width: PREVIEW_W }}>
      <img src={url} alt={name} width={PREVIEW_W} />
    </span>
  );
}
