// Suggerimenti di carte dal pool del FORMATO per migliorare un mazzo contro un
// avversario. Classifica l'avversario (aggro/control/midrange) dai ruoli e
// dalla curva, poi propone categorie di risposte con query Scryfall mirate.
//
// È un aiuto euristico: le query approssimano i ruoli via testo oracle, e
// l'ordinamento `edhrec` fa emergere le carte più conosciute/giocate.

import { DeckEntry } from "./types";
import { deckRoleCounts } from "./cardRoles";
import { Format } from "./decks";

export type MatchupType = "aggro" | "control" | "midrange";

export const MATCHUP_LABEL: Record<MatchupType, string> = {
  aggro: "aggressivo (aggro)",
  control: "controllo",
  midrange: "midrange",
};

// Classifica un mazzo dai suoi contenuti.
export function classifyDeck(entries: DeckEntry[]): MatchupType {
  const rc = deckRoleCounts(entries);
  let creatures = 0;
  let lowCreatures = 0;
  let nonland = 0;
  let cmcSum = 0;
  for (const e of entries) {
    if (!e.card) continue;
    const q = e.quantity;
    if (!e.card.isLand) {
      nonland += q;
      cmcSum += e.card.cmc * q;
    }
    if (e.card.categories.includes("creature")) {
      creatures += q;
      if (e.card.cmc <= 2) lowCreatures += q;
    }
  }
  const avgCmc = nonland ? cmcSum / nonland : 3;

  if (creatures <= 10 && rc.counters + rc.carddraw >= 6) return "control";
  if (lowCreatures >= 12 && avgCmc <= 2.4) return "aggro";
  return "midrange";
}

export interface SuggestGroup {
  reason: string;
  query: string;
}

// Categorie di risposte consigliate per battere un avversario di quel tipo,
// come query Scryfall legali nel formato (escluse le terre).
export function suggestGroups(opp: MatchupType, format: Format): SuggestGroup[] {
  const base = `f:${format} -t:land`;
  switch (opp) {
    case "aggro":
      return [
        {
          reason: "Rimozione economica contro le creature",
          query: `${base} cmc<=2 (o:"destroy target creature" or o:"exile target creature" or o:"damage to target creature")`,
        },
        {
          reason: "Spazzavia per ripulire il tavolo",
          query: `${base} o:"destroy all creatures"`,
        },
        {
          reason: "Guadagno vita per stabilizzare",
          query: `${base} cmc<=3 o:"you gain" o:"life"`,
        },
      ];
    case "control":
      return [
        {
          reason: "Minacce a basso costo, difficili da gestire",
          query: `${base} t:creature cmc<=2 pow>=2`,
        },
        {
          reason: "Counter per contrastarli sul loro turno",
          query: `${base} cmc<=3 o:"counter target"`,
        },
        {
          reason: "Discard per svuotare la loro mano",
          query: `${base} cmc<=2 o:"target player discards"`,
        },
      ];
    default:
      return [
        {
          reason: "Rimozione efficiente e flessibile",
          query: `${base} cmc<=3 (o:"destroy target" or o:"exile target creature")`,
        },
        {
          reason: "Vantaggio carte per superarli sul lungo",
          query: `${base} cmc<=3 o:"draw two cards"`,
        },
        {
          reason: "Minacce che generano valore entrando",
          query: `${base} t:creature cmc<=4 o:"When" o:"enters"`,
        },
      ];
  }
}
