// Riconoscimento di una carta da un fotogramma della fotocamera.
// Legge con l'OCR il nome (fascia in alto) e, sulle carte recenti, il codice
// del set e il numero da collezionista (fascia in basso a sinistra), poi cerca
// la carta su Scryfall. Tesseract.js viene caricato solo quando serve.

import type { Worker } from "tesseract.js";
import {
  cardByFuzzyName,
  cardByPrintedName,
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

  // 1) Stampa esatta da set + numero, se il nome letto la conferma.
  if (set && number) {
    try {
      const c = await cardBySetNumber(set, number, lang);
      if (c && (readName.length < 3 || similarity(readName, c.name) > 0.5 || lang && lang !== "en")) {
        return { card: c, readName, readInfo };
      }
    } catch {
      /* passa al nome */
    }
  }
  if (readName.length < 3) return { card: null, readName, readInfo };

  // 2) Nome inglese approssimato, 3) nome stampato in un'altra lingua.
  // In automatico la stessa carta viene letta più volte: teniamo i risultati.
  const key = readName.toLowerCase();
  if (!nameCache.has(key)) {
    nameCache.set(key, (await cardByFuzzyName(readName)) ?? (await cardByPrintedName(readName)));
  }
  return { card: nameCache.get(key) ?? null, readName, readInfo };
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
