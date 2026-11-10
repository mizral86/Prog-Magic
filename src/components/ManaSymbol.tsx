// Simbolo di mana. I cinque colori e i dieci ibridi (es. "WU" = {W/U}) sono
// immagini in public/mana/*.webp, ricavate dalla ruota dei colori scelta da
// Luciano (disco pastello, segno nero; ibridi divisi in diagonale). Incolore,
// X e mana generico sono disegnati qui nello stesso stile.

interface Props {
  sym: string; // "W", "U", "B", "R", "G", "C", "X", "0", "1", "2"…
  size?: number;
  title?: string;
}

const IMAGE_SYMS = new Set([
  "W", "U", "B", "R", "G",
  "WU", "WB", "UB", "UR", "BR", "BG", "RG", "RW", "GW", "GU",
]);

/** "W/U", "U/W" o "UW" → "WU" (ordine canonico delle carte). */
export function normalizeSym(sym: string): string {
  const s = sym.replace(/\//g, "").toUpperCase();
  if (IMAGE_SYMS.has(s)) return s;
  const rev = s.split("").reverse().join("");
  return IMAGE_SYMS.has(rev) ? rev : s;
}

export function ManaSymbol({ sym: rawSym, size = 22, title }: Props) {
  const sym = normalizeSym(rawSym);
  if (IMAGE_SYMS.has(sym)) {
    return (
      <img
        className="mana-sym"
        src={`${import.meta.env.BASE_URL}mana/${sym}.webp`}
        alt={sym}
        title={title ?? sym}
        width={size}
        height={size}
        draggable={false}
      />
    );
  }
  return (
    <svg
      className="mana-sym"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? sym}
    >
      <title>{title ?? sym}</title>
      <circle cx="20" cy="20" r="20" fill="#cbc5c0" />
      {sym === "C" ? (
        // Incolore: rombo come sulle carte.
        <path d="M20 7 L31 20 L20 33 L9 20 Z M20 13 L26 20 L20 27 L14 20 Z" fill="#0d0f0f" fillRule="evenodd" />
      ) : (
        <text
          x="20"
          y="21"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize={sym.length > 1 ? 20 : 24}
          fill="#0d0f0f"
        >
          {sym}
        </text>
      )}
    </svg>
  );
}

/** Costo di mana completo, es. "{2}{R}{R}" o "{1}{U} // {3}{U}{U}". */
export function ManaCost({ cost, size = 16 }: { cost: string; size?: number }) {
  const parts = cost.split("//").map((p) => p.match(/\{([^}]+)\}/g) ?? []);
  return (
    <span className="mana-cost-inline" aria-label={cost}>
      {parts.map((tokens, i) => (
        <span key={i} className="mci-part">
          {i > 0 && <span className="mci-sep">//</span>}
          {tokens.map((t, j) => {
            const sym = t.slice(1, -1).replace("/P", "");
            return <ManaSymbol key={j} sym={sym} size={size} title={t} />;
          })}
        </span>
      ))}
    </span>
  );
}
