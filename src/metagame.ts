// Dati "meta" per la sezione Top mazzi. IMPORTANTE: non esiste una API
// gratuita affidabile del metagame, quindi la lista curata qui sotto è
// INDICATIVA (aggiornata alla data sotto) e NON un dato live: gli archetipi
// cambiano nel tempo. I link puntano a fonti sempre aggiornate (MTGGoldfish,
// MTGTop8, EDHREC): sono la fonte autorevole, la lista è solo un punto di
// partenza.

import { Format } from "./decks";

export const META_UPDATED = "gennaio 2026";

export interface MetaArchetype {
  name: string;
  note?: string;
}

// Archetipi di riferimento per formato (storicamente forti / molto giocati).
export const META: Record<Format, MetaArchetype[]> = {
  standard: [
    { name: "Izzet Cauldron", note: "tempo/valore rosso-blu" },
    { name: "Golgari Midrange", note: "rimozioni + minacce" },
    { name: "Mono-Red Aggro", note: "pressione veloce" },
  ],
  pioneer: [
    { name: "Izzet Phoenix", note: "aggro-combo con Arclight Phoenix" },
    { name: "Rakdos Midrange", note: "rimozione + minacce efficienti" },
    { name: "Amalia Combo", note: "combo Amalia + Wildgrowth Walker" },
  ],
  modern: [
    { name: "Boros Energy", note: "aggro-midrange a energia" },
    { name: "Izzet Wizards / Murktide", note: "tempo con controincantesimi" },
    { name: "Amulet Titan", note: "ramp combo con Primeval Titan" },
  ],
  pauper: [
    { name: "Kuldotha Boros", note: "aggro affinity rosso-bianco" },
    { name: "Gruul Ramp / Ponza", note: "distruzione terre + minacce" },
    { name: "Dimir / Mono-U Faeries", note: "tempo con controincantesimi" },
  ],
  legacy: [
    { name: "Izzet Delver (Tempo)", note: "creature a basso costo + disturbo" },
    { name: "Reanimator", note: "rianima minacce enormi in fretta" },
    { name: "Death & Taxes", note: "prison bianco con disturbo" },
  ],
  vintage: [
    { name: "Ragavan Xerox", note: "tempo con cantrip e restricted" },
    { name: "Dredge", note: "cimitero aggressivo" },
    { name: "MUD / Shops", note: "artefatti + prison" },
  ],
  commander: [
    { name: "Vedi EDHREC per i comandanti più giocati", note: "il meta EDH è troppo vario per un top-3 fisso" },
  ],
};

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
