// Dati "meta" per la sezione Top mazzi e per il simulatore.
//
// I mazzi stanno in public/meta.json, che una GitHub Action ricalcola ogni
// giorno (scripts/update-meta.mjs) dalle liste dei tornei MTGO e cartacei e
// da EDHREC per Commander. L'app parte con la copia inclusa nella build e,
// una volta al giorno, controlla se sul sito ce n'è una più nuova: se sì la
// scarica e la usa subito, senza aspettare un aggiornamento dell'app.

import { useSyncExternalStore } from "react";
import type { Format } from "./decks";
import bundled from "../public/meta.json";

export interface MetaArchetype {
  name: string;
  note?: string;
  /** Quota di metagame, es. "12,5%". */
  share?: string;
  /** Da dove viene la lista: giocatore, torneo, data, piazzamento. */
  source?: string;
  /** Decklist completa (main + "Sideboard"), formato Arena/MTGO. */
  deck?: string;
}

export interface MetaData {
  /** Data dei mazzi, AAAA-MM-GG. */
  updated: string;
  /** Data leggibile, es. "18 novembre 2026". */
  updatedLabel: string;
  formats: Partial<Record<Format, { source: string; archetypes: MetaArchetype[] }>>;
}

// Chiavi "mm.*": restano sul dispositivo, non vanno sincronizzate col profilo.
const CACHE_KEY = "mm.meta.v1";
const CHECK_KEY = "mm.meta.check";

function isMetaData(x: unknown): x is MetaData {
  const m = x as MetaData;
  return !!m && typeof m.updated === "string" && !!m.formats && typeof m.formats === "object";
}

function loadInitial(): MetaData {
  const base = bundled as MetaData;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (isMetaData(cached) && cached.updated > base.updated) return cached;
  } catch {
    /* ignora */
  }
  return base;
}

let current: MetaData = loadInitial();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mazzi del meta attuali; il componente si aggiorna quando arrivano quelli nuovi. */
export function useMeta(): MetaData {
  return useSyncExternalStore(subscribe, () => current);
}

/** Archetipi di un formato (lista vuota se mancano). */
export function metaList(meta: MetaData, format: Format): MetaArchetype[] {
  return meta.formats[format]?.archetypes ?? [];
}

const dayKey = () => new Date().toISOString().slice(0, 10);

export type MetaCheck = "updated" | "same" | "error";

/**
 * Controlla se sul sito ci sono mazzi del meta più nuovi di quelli in uso.
 * Senza `force` lo fa al massimo una volta al giorno.
 */
export async function checkMetaUpdate(force = false): Promise<MetaCheck | "skipped"> {
  try {
    if (!force && localStorage.getItem(CHECK_KEY) === dayKey()) return "skipped";
  } catch {
    /* ignora */
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}meta.json?d=${dayKey()}`, {
      cache: "no-store",
    });
    if (!res.ok) return "error";
    const data: unknown = await res.json();
    try {
      localStorage.setItem(CHECK_KEY, dayKey());
    } catch {
      /* ignora */
    }
    if (!isMetaData(data) || data.updated <= current.updated) return "same";
    current = data;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* ignora */
    }
    listeners.forEach((fn) => fn());
    return "updated";
  } catch {
    return "error";
  }
}

// MTGGoldfish usa direttamente il nome formato.
export function goldfishUrl(format: Format): string {
  return `https://www.mtggoldfish.com/metagame/${format}#paper`;
}

// MTGTop8 usa codici formato.
const TOP8_CODE: Record<Format, string> = {
  standard: "ST",
  pioneer: "PI",
  modern: "MO",
  pauper: "PAU",
  legacy: "LE",
  vintage: "VI",
  commander: "EDH",
};
export function mtgtop8Url(format: Format): string {
  return `https://www.mtgtop8.com/format?f=${TOP8_CODE[format]}`;
}

export const EDHREC_URL = "https://edhrec.com/";
