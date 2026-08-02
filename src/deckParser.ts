// Parser di decklist in formato Arena / MTGO / testo semplice.
//
// Righe supportate:
//   "4 Lightning Bolt"
//   "4x Lightning Bolt"
//   "Lightning Bolt"            -> quantità 1
//   "4 Lightning Bolt (2X2) 117" -> set/collector rimossi
//
// Righe ignorate: vuote, commenti (//, #), intestazioni (Deck, Mazzo,
// Sideboard, Side, Commander, Maybeboard). La sezione sideboard viene
// separata: tutto ciò che segue una riga "Sideboard"/"Side" finisce lì.

export interface ParsedLine {
  quantity: number;
  name: string;
}

export interface ParsedDeck {
  main: ParsedLine[];
  side: ParsedLine[];
}

const HEADER_RE =
  /^(deck|mazzo|maindeck|main deck|commander|comandante|companion|maybeboard)\s*:?\s*$/i;
const SIDE_RE = /^(sideboard|side|riserva)\s*:?\s*$/i;

// Rimuove suffissi tipo " (2X2) 117", " [SET]", ecc. alla fine del nome.
function stripSetInfo(name: string): string {
  return name
    .replace(/\s*\((?:[A-Za-z0-9]{2,6})\)\s*[A-Za-z0-9\-★]*\s*$/, "")
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .trim();
}

function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim();
  if (!line) return null;
  if (line.startsWith("//") || line.startsWith("#")) return null;
  if (HEADER_RE.test(line)) return null;

  // Cattura una quantità iniziale opzionale ("4", "4x", "4 x").
  const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
  let quantity = 1;
  let name = line;
  if (m) {
    quantity = parseInt(m[1], 10);
    name = m[2];
  }
  name = stripSetInfo(name);
  if (!name) return null;
  return { quantity, name };
}

export function parseDecklist(text: string): ParsedDeck {
  const lines = text.split(/\r?\n/);
  const main: ParsedLine[] = [];
  const side: ParsedLine[] = [];
  let inSide = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (SIDE_RE.test(trimmed)) {
      inSide = true;
      continue;
    }
    const parsed = parseLine(raw);
    if (!parsed) continue;
    (inSide ? side : main).push(parsed);
  }

  return { main: mergeDuplicates(main), side: mergeDuplicates(side) };
}

// Somma le quantità di righe con lo stesso nome (case-insensitive).
function mergeDuplicates(lines: ParsedLine[]): ParsedLine[] {
  const map = new Map<string, ParsedLine>();
  for (const l of lines) {
    const key = l.name.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.quantity += l.quantity;
    else map.set(key, { ...l });
  }
  return [...map.values()];
}
