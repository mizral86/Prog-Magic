// Simbolo di mana disegnato con le icone SVG pubbliche di Scryfall
// (https://scryfall.com/docs/api/card-symbols). Se l'immagine non carica
// (offline) resta visibile la lettera del simbolo.

interface Props {
  sym: string; // "W", "U", "B", "R", "G", "C", "X", "1", "2"…
  size?: number;
  title?: string;
}

export function ManaSymbol({ sym, size = 22, title }: Props) {
  return (
    <img
      className="mana-sym"
      src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(sym)}.svg`}
      alt={sym}
      title={title ?? sym}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
