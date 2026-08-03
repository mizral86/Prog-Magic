// Import/export testuale dei mazzi (formato Arena/MTGO).

import { parseDecklist } from "./deckParser";
import { resolveCards } from "./scryfall";
import { DeckCard, makeDeckCard, SavedDeck } from "./decks";

export function deckToText(deck: SavedDeck): string {
  const main = deck.cards.filter((c) => c.board === "main");
  const side = deck.cards.filter((c) => c.board === "side");
  const lines = main.map((c) => `${c.qty} ${c.name}`);
  if (side.length > 0) {
    lines.push("", "Sideboard", ...side.map((c) => `${c.qty} ${c.name}`));
  }
  return lines.join("\n");
}

export interface ImportResult {
  cards: DeckCard[];
  unresolved: string[];
}

export async function parseAndResolve(text: string): Promise<ImportResult> {
  const parsed = parseDecklist(text);
  const allNames = [...parsed.main, ...parsed.side].map((l) => l.name);
  const { cards } = await resolveCards(allNames);
  const unresolved: string[] = [];
  const out: DeckCard[] = [];

  const build = (
    lines: { quantity: number; name: string }[],
    board: "main" | "side",
  ) => {
    for (const l of lines) {
      const card = cards.get(l.name.toLowerCase());
      if (!card) {
        unresolved.push(l.name);
        continue;
      }
      out.push(makeDeckCard(card, board, l.quantity));
    }
  };
  build(parsed.main, "main");
  build(parsed.side, "side");

  return { cards: out, unresolved };
}
