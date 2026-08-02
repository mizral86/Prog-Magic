// Confronto euristico tra due mazzi.
//
// ATTENZIONE: NON è una win-rate reale. È una STIMA che combina:
//   - quanto velocemente ogni mazzo "parte" (goldfish)
//   - quanto è regolare (mani tenibili / mulligan)
//   - quanto le sue risposte coprono le minacce avversarie
//   - quanto le sue minacce resistono alla disruption avversaria
// Serve a confrontare motore + interazione sulla carta, non a predire il match.

import { SimStats } from "./sim/engine";
import { DeckEntry } from "./types";
import { deckRoleCounts, RoleCounts } from "./cardRoles";

export interface Factor {
  key: string;
  label: string;
  a: number; // punteggio grezzo lato A (0..~10)
  b: number;
  weight: number;
  contribA: number; // weight * a
  contribB: number;
}

export interface Comparison {
  factors: Factor[];
  scoreA: number;
  scoreB: number;
  probAFavored: number;
  countsA: RoleCounts;
  countsB: RoleCounts;
}

function speedScore(s: SimStats): number {
  // Quanto prima "parte" il piano: turni risparmiati rispetto al massimo.
  return Math.max(0, s.config.maxTurns + 2 - s.avgOnlineTurn);
}

function consistencyScore(s: SimStats): number {
  return Math.max(0, s.keepableRate * 10 - s.avgMulligans * 5);
}

// Copertura delle minacce avversarie da parte delle proprie risposte (0..10).
function answerCoverage(selfAnswers: number, oppThreats: number): number {
  if (oppThreats <= 0) return 5; // niente da rispondere: neutro
  return 10 * Math.min(1, selfAnswers / oppThreats);
}

// Resilienza delle proprie minacce alla disruption avversaria (0..10).
function resilience(selfThreats: number, oppDisruption: number): number {
  if (selfThreats <= 0) return 5; // niente minacce da proteggere: neutro
  return (10 * (selfThreats + 1)) / (selfThreats + 1 + oppDisruption * 0.6);
}

const WEIGHTS = {
  speed: 1.0,
  consistency: 0.6,
  interaction: 0.6,
  resilience: 0.4,
};

export function compareDecks(
  entriesA: DeckEntry[],
  statsA: SimStats,
  entriesB: DeckEntry[],
  statsB: SimStats,
): Comparison {
  const countsA = deckRoleCounts(entriesA);
  const countsB = deckRoleCounts(entriesB);

  const factors: Factor[] = [
    mk("speed", "Velocità (turno in cui il piano parte)", speedScore(statsA), speedScore(statsB), WEIGHTS.speed),
    mk(
      "consistency",
      "Consistenza (mani tenute / mulligan)",
      consistencyScore(statsA),
      consistencyScore(statsB),
      WEIGHTS.consistency,
    ),
    mk(
      "interaction",
      "Risposte alle minacce avversarie",
      answerCoverage(countsA.answers, countsB.threats),
      answerCoverage(countsB.answers, countsA.threats),
      WEIGHTS.interaction,
    ),
    mk(
      "resilience",
      "Resilienza delle proprie minacce",
      resilience(countsA.threats, countsB.disruption),
      resilience(countsB.threats, countsA.disruption),
      WEIGHTS.resilience,
    ),
  ];

  const scoreA = factors.reduce((s, f) => s + f.contribA, 0);
  const scoreB = factors.reduce((s, f) => s + f.contribB, 0);

  const k = 0.35;
  const probAFavored = 1 / (1 + Math.exp(-k * (scoreA - scoreB)));

  return { factors, scoreA, scoreB, probAFavored, countsA, countsB };
}

function mk(
  key: string,
  label: string,
  a: number,
  b: number,
  weight: number,
): Factor {
  return { key, label, a, b, weight, contribA: a * weight, contribB: b * weight };
}
