// Riconoscimento di una carta da un fotogramma della fotocamera.
// Legge con l'OCR il nome (fascia in alto) e, sulle carte recenti, il codice
// del set e il numero da collezionista (fascia in basso a sinistra), poi cerca
// la carta su Scryfall. Tesseract.js viene caricato solo quando serve.

import type { Worker } from "tesseract.js";
import {
  cardByFuzzyName,
  cardsByPrintedName,
  cardBySetNumber,
} from "./scryfall";
import { CardInfo } from "./types";

/** Rettangolo in frazioni della carta (0..1). */
interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Proporzioni di una carta Magic (63 × 88 mm).
export const CARD_RATIO = 63 / 88;
// Nome: in alto, escluso il costo di mana a destra.
export const TITLE_BAND: Band = { x: 0.06, y: 0.035, w: 0.7, h: 0.07 };
// Numero da collezionista e set: in basso a sinistra (carte dal 2020 in poi).
export const INFO_BAND: Band = { x: 0.035, y: 0.9, w: 0.5, h: 0.075 };

let workerPromise: Promise<Worker> | null = null;
const nameCache = new Map<string, CardInfo | null>();

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async (T) => {
      const w = await T.createWorker("eng");
      return w;
    });
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Prepara il motore OCR in anticipo (scarica i dati la prima volta). */
export function warmUpScanner(): void {
  void getWorker().catch(() => {});
}

/**
 * Ritaglia una fascia della carta, la ingrandisce, la porta in scala di grigi
 * e, se il testo è chiaro su fondo scuro, la inverte (l'OCR legge meglio il
 * nero su bianco).
 */
function cropBand(src: HTMLCanvasElement, card: DOMRect, band: Band): HTMLCanvasElement {
  const sx = card.x + band.x * card.width;
  const sy = card.y + band.y * card.height;
  const sw = band.w * card.width;
  const sh = band.h * card.height;
  const scale = Math.max(1, 900 / sw);
  const out = document.createElement("canvas");
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const mean = sum / (d.length / 4);
  if (mean < 110) {
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Pulisce il nome letto dall'OCR: niente simboli, spazi singoli. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/[^A-Za-zÀ-ÿ0-9',\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Za-zÀ-ÿ]+/, "")
    .replace(/[^A-Za-zÀ-ÿ]+$/, "");
}

const LANGS = ["EN", "IT", "DE", "FR", "ES", "PT", "JA", "JP", "KO", "RU", "ZHS", "ZHT", "CS", "CT"];

/** Estrae set, numero e lingua dalla riga in basso (es. "0141/291 R" e "DMU • IT"). */
export function parseInfo(raw: string): { set?: string; number?: string; lang?: string } {
  const text = raw.toUpperCase().replace(/[|]/g, "I");
  const num = text.match(/\b0*(\d{1,4})\s*\/\s*\d{1,4}\b/) ?? text.match(/\b0*(\d{1,4})\b/);
  const setLang = text.match(/\b([A-Z0-9]{3,5})\s*[•·*.\-+]?\s*([A-Z]{2,3})\b/);
  let set: string | undefined;
  let lang: string | undefined;
  if (setLang && LANGS.includes(setLang[2])) {
    set = setLang[1];
    lang = setLang[2] === "JP" ? "ja" : setLang[2].toLowerCase();
  }
  return { set, number: num?.[1], lang };
}

/** Somiglianza 0..1 tra due nomi (per controllare il risultato da set+numero). */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (!x || !y) return 0;
  const dp: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[y.length] / Math.max(x.length, y.length);
}

export interface ScanResult {
  card: CardInfo | null;
  /** Testo letto, per mostrare cosa ha capito lo scanner. */
  readName: string;
  readInfo: string;
}

/**
 * Riconosce la carta inquadrata. `frame` è il fotogramma intero, `card` il
 * rettangolo della carta dentro il fotogramma (in pixel).
 */
export async function recognize(frame: HTMLCanvasElement, card: DOMRect): Promise<ScanResult> {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: "7" as never });
  const title = await worker.recognize(cropBand(frame, card, TITLE_BAND));
  const readName = cleanName(title.data.text);
  await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
  const info = await worker.recognize(cropBand(frame, card, INFO_BAND));
  const readInfo = info.data.text.replace(/\s+/g, " ").trim();
  const { set, number, lang } = parseInfo(readInfo);

  // 1) Stampa esatta da set + numero, solo se il nome letto la conferma
  //    (l'OCR della riga in basso sbaglia spesso set o numero).
  if (set && number) {
    try {
      const c = await cardBySetNumber(set, number, lang);
      if (c && (readName.length < 3 ? lang === "en" || !lang : nameMatch(readName, c) >= MATCH_OK)) {
        return { card: c, readName, readInfo };
      }
    } catch {
      /* passa al nome */
    }
  }
  if (readName.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 4) return { card: null, readName, readInfo };

  // 2) Nome. In automatico la stessa carta viene letta più volte: teniamo i risultati.
  const key = readName.toLowerCase();
  if (!nameCache.has(key)) nameCache.set(key, await findByName(readName));
  return { card: nameCache.get(key) ?? null, readName, readInfo };
}

/** Quanto il nome letto somiglia al nome della carta (inglese o stampato). */
export function nameMatch(read: string, card: CardInfo): number {
  const r = normName(read);
  let best = 0;
  for (const n of [card.name, card.printedName ?? ""]) {
    if (!n) continue;
    // Le carte doppie hanno "Nome // Altro nome": basta una delle due facce.
    for (const part of [n, ...n.split(" // ")]) {
      best = Math.max(best, similarity(r, normName(part)));
    }
  }
  return best;
}

const MATCH_OK = 0.62;

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cerca la carta dal nome letto, in inglese o in un'altra lingua, e la
 * accetta solo se il nome somiglia davvero a quello letto: meglio "non
 * riconosciuta" che una carta sbagliata.
 */
async function findByName(readName: string): Promise<CardInfo | null> {
  let best: CardInfo | null = null;
  let bestScore = 0;
  const consider = (c: CardInfo | null | undefined) => {
    if (!c) return;
    const s = nameMatch(readName, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  };
  // Nome inglese con qualche errore.
  try {
    consider(await cardByFuzzyName(readName));
  } catch {
    /* continua */
  }
  if (bestScore >= 0.85) return best;
  // Nome stampato in altre lingue (italiano…): prima tutte le parole, poi le
  // parole più lunghe una alla volta (l'OCR ne sbaglia spesso qualcuna).
  const words = normName(readName)
    .split(" ")
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length);
  const queries = [readName, ...words.slice(0, 2)];
  for (const q of queries) {
    try {
      for (const c of await cardsByPrintedName(q)) consider(c);
    } catch {
      /* continua */
    }
    if (bestScore >= 0.85) break;
  }
  return bestScore >= MATCH_OK ? best : null;
}

/** Rettangolo della carta (in pixel del fotogramma) per una cornice centrata. */
export function cardRectIn(width: number, height: number, fill = 0.82): DOMRect {
  let w = width * fill;
  let h = w / CARD_RATIO;
  if (h > height * fill) {
    h = height * fill;
    w = h * CARD_RATIO;
  }
  return new DOMRect((width - w) / 2, (height - h) / 2, w, h);
}

// --- Più carte da una sola foto (es. pagina di un raccoglitore) --------------

/** Area in frazioni dell'immagine (0..1). */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Divide l'area (in pixel) in una griglia di celle, riga per riga. */
export function gridCells(
  width: number,
  height: number,
  area: Area,
  rows: number,
  cols: number,
): DOMRect[] {
  const ax = area.x * width;
  const ay = area.y * height;
  const cw = (area.w * width) / cols;
  const ch = (area.h * height) / rows;
  const out: DOMRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(new DOMRect(ax + c * cw, ay + r * ch, cw, ch));
    }
  }
  return out;
}

/**
 * Riconosce la carta dentro una cella della griglia. Nelle tasche di un
 * raccoglitore la carta non riempie sempre la cella nello stesso modo: si
 * prova con cornici di misura diversa finché il nome non viene trovato.
 */
export async function recognizeInCell(
  frame: HTMLCanvasElement,
  cell: DOMRect,
  fills: number[] = [0.94, 0.86, 1],
): Promise<ScanResult> {
  let best: ScanResult | null = null;
  for (const fill of fills) {
    const r = cardRectIn(cell.width, cell.height, fill);
    const rect = new DOMRect(cell.x + r.x, cell.y + r.y, r.width, r.height);
    const res = await recognize(frame, rect);
    if (res.card) return res;
    if (!best || res.readName.length > best.readName.length) best = res;
  }
  return best ?? { card: null, readName: "", readInfo: "" };
}

/** Miniatura di una cella della foto (per far capire quale carta è). */
export function cellThumb(frame: HTMLCanvasElement, cell: DOMRect, width = 140): string {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((cell.height / cell.width) * width);
  c.getContext("2d")!.drawImage(frame, cell.x, cell.y, cell.width, cell.height, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}
