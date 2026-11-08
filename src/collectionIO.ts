// Import/export della collezione: CSV (anche da altre app) e backup completo.

import { CollectionEntry } from "./collection";
import { CardIdentifier, resolveIdentifiers } from "./scryfall";
import { CardInfo } from "./types";

const COLLECTION_KEY = "pm.collection.v1";
const DECKS_KEY = "pm.decks.v1";

/** Parser CSV minimale: virgolette, virgolette raddoppiate, separatore , o ;. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

interface CsvItem {
  id?: string;
  name?: string;
  set?: string;
  cn?: string;
  qty: number;
  foil: boolean;
}

export interface CsvImportResult {
  items: { card: CardInfo; qty: number; foil: boolean }[];
  copies: number;
  missing: string[];
}

/**
 * Legge un CSV di collezione. Riconosce le colonne usate dalle app più diffuse:
 * "Scryfall ID", oppure "Name" con "Set code" e "Collector number", oppure solo "Name".
 */
export async function importCollectionCSV(
  text: string,
  onProgress?: (msg: string) => void,
): Promise<CsvImportResult> {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Il file è vuoto o non ha righe di carte.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iId = col("scryfall id", "scryfall_id", "scryfallid");
  const iName = col("name", "card name", "card", "nome");
  const iSet = col("set code", "set", "edition code", "set_code");
  const iCn = col("collector number", "collector_number", "card number", "number");
  const iQty = col("quantity", "count", "qty", "quantità", "quantita");
  const iFoil = col("foil", "printing", "finish");
  if (iId < 0 && iName < 0) {
    throw new Error('Nel CSV manca una colonna "Scryfall ID" o "Name".');
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const items: CsvItem[] = rows
    .slice(1)
    .map((r) => {
      const foilRaw = get(r, iFoil).toLowerCase();
      return {
        id: get(r, iId) || undefined,
        name: get(r, iName) || undefined,
        set: get(r, iSet).toLowerCase() || undefined,
        cn: get(r, iCn) || undefined,
        qty: Math.max(1, parseInt(get(r, iQty), 10) || 1),
        foil:
          /foil|etched|^true$|^yes$|^si$|^sì$|^1$/.test(foilRaw) &&
          !/non|normal/.test(foilRaw),
      };
    })
    .filter((x) => x.id || x.name);

  const ident = (x: CsvItem): CardIdentifier =>
    x.id
      ? { id: x.id }
      : x.set && x.cn
        ? { set: x.set, collector_number: x.cn }
        : { name: x.name! };

  const cards = await resolveIdentifiers(items.map(ident), (done, total) =>
    onProgress?.(`Riconosco le carte: ${done} di ${total}…`),
  );
  const byId = new Map(cards.map((c) => [c.scryfallId, c]));
  const bySetCn = new Map(cards.map((c) => [`${c.setCode}|${c.collectorNumber}`, c]));
  const byName = new Map<string, CardInfo>();
  for (const c of cards) {
    byName.set(c.name.toLowerCase(), c);
    byName.set(c.name.split(" // ")[0].toLowerCase(), c);
  }

  const out: CsvImportResult = { items: [], copies: 0, missing: [] };
  for (const x of items) {
    const card =
      (x.id && byId.get(x.id)) ||
      (x.set && x.cn && bySetCn.get(`${x.set}|${x.cn}`)) ||
      (x.name && byName.get(x.name.toLowerCase())) ||
      undefined;
    if (card) {
      out.items.push({ card, qty: x.qty, foil: x.foil });
      out.copies += x.qty;
    } else out.missing.push(x.name ?? x.id ?? "?");
  }
  return out;
}

/** CSV della collezione, con le colonne leggibili da altre app. */
export function collectionToCSV(entries: CollectionEntry[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    [
      "Name",
      "Set code",
      "Set name",
      "Collector number",
      "Foil",
      "Rarity",
      "Quantity",
      "Scryfall ID",
      "Price EUR",
    ].join(","),
  ];
  for (const e of entries) {
    const base = [e.name, e.setCode, e.setName, e.collectorNumber];
    if (e.qty > 0)
      lines.push(
        [...base, "normal", e.rarity, e.qty, e.id, e.prices?.eur ?? ""].map(q).join(","),
      );
    if (e.foilQty > 0)
      lines.push(
        [...base, "foil", e.rarity, e.foilQty, e.id, e.prices?.eurFoil ?? e.prices?.eur ?? ""]
          .map(q)
          .join(","),
      );
  }
  return lines.join("\n");
}

/** Backup completo (collezione + mazzi) come testo JSON. */
export function makeBackup(): string {
  const read = (k: string) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "{}");
    } catch {
      return {};
    }
  };
  return JSON.stringify({
    app: "prog-magic",
    version: 1,
    createdAt: new Date().toISOString(),
    collection: read(COLLECTION_KEY),
    decks: read(DECKS_KEY),
  });
}

/** Ripristina un backup: sostituisce collezione e mazzi. Va ricaricata la pagina. */
export function restoreBackup(text: string): void {
  let data: { app?: string; collection?: unknown; decks?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Il file non è un backup valido.");
  }
  if (
    data.app !== "prog-magic" ||
    typeof data.collection !== "object" ||
    typeof data.decks !== "object"
  ) {
    throw new Error("Il file non è un backup di Prog Magic.");
  }
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(data.collection ?? {}));
  localStorage.setItem(DECKS_KEY, JSON.stringify(data.decks ?? {}));
}

/** Fa scaricare un file di testo al browser. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}
