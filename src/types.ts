// Tipi condivisi tra parser, integrazione Scryfall, motore di simulazione e UI.

export type Color = "W" | "U" | "B" | "R" | "G";
export const COLORS: Color[] = ["W", "U", "B", "R", "G"];

/** Abilità di mana di una carta non-terra (dork, rock, o ramp che mette terre). */
export interface ManaAbility {
  /** 'permanent' = permanente che tappa per mana; 'fetch' = mette terre in gioco. */
  kind: "permanent" | "fetch";
  /** Colori prodotti (vuoto = solo mana incolore/generico). Per 'fetch' è vuoto. */
  colors: Color[];
  /** 'permanent': mana per tap; 'fetch': terre messe in gioco. */
  amount: number;
  /** Se è una creatura (rilevante per la malattia da evocazione). */
  isCreature: boolean;
}

export type CardCategory =
  | "land"
  | "creature"
  | "instant"
  | "sorcery"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "battle"
  | "other";

/** Informazioni su una carta, distillate da Scryfall in ciò che serve al goldfish. */
export interface CardInfo {
  name: string;
  /** Nome stampato (es. italiano) quando la ricerca ha trovato una stampa non inglese. */
  printedName?: string;
  cmc: number;
  typeLine: string;
  categories: CardCategory[];
  colors: Color[];
  colorIdentity: Color[];
  isLand: boolean;
  /** Colori che questa carta può produrre (soprattutto terre e mana dork). */
  producedMana: Color[];
  /** Euristica: la terra entra tappata (non produce mana il turno in cui entra). */
  entersTapped: boolean;
  manaCost: string; // es. "{1}{R}"
  /** Pip colorati richiesti dal costo, es. { R: 1 }. */
  pips: Partial<Record<Color, number>>;
  /** Mana generico nel costo (la parte numerica). */
  generic: number;
  /** Testo oracle (usato per dedurre i ruoli: rimozione, counter, ecc.). */
  oracleText: string;
  /** Abilità di mana (dork/rock/ramp), se presente. */
  manaAbility?: ManaAbility;
  /** Forza/costituzione (creature); undefined se non creatura. `*` → 0. */
  power?: number;
  toughness?: number;
  /** Lealtà iniziale (planeswalker). */
  loyalty?: number;
  /** URL immagine (fronte) per la UI, se disponibile. */
  imageUrl?: string;
  /** URL immagine piccola (miniatura per il replay). */
  imageSmallUrl?: string;
  /** Immagine ad alta risoluzione per lo zoom. */
  imageLargeUrl?: string;
  /** ID Scryfall della stampa (utile come chiave). */
  scryfallId?: string;
  rarity?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  releasedAt?: string;
  /** Legalità per formato: nome formato -> "legal" | "not_legal" | "banned" | "restricted". */
  legalities?: Record<string, string>;
  /** Prezzi (numerici) da Scryfall. */
  prices?: {
    eur?: number;
    eurFoil?: number;
    usd?: number;
    usdFoil?: number;
  };
}

export interface DeckEntry {
  quantity: number;
  name: string;
  card?: CardInfo; // popolata dopo la risoluzione via Scryfall
}

export interface Deck {
  name: string;
  /** Mazzo principale. */
  entries: DeckEntry[];
  /** Sideboard. */
  side: DeckEntry[];
  /** Nomi non risolti da Scryfall. */
  unresolved: string[];
  /** Numero totale di carte nel mazzo principale. */
  size: number;
}
