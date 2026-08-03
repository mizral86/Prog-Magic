// Motore di simulazione "goldfish" (un mazzo, senza avversario).
//
// Modella, su migliaia di partite Monte Carlo:
//   - mulligan alla londinese (draw 7, tieni/scarta, metti in fondo)
//   - pescate e giocate terra turno per turno
//   - mana da terre E da ramp: mana dork / mana rock e incantesimi che mettono
//     terre in gioco (con malattia da evocazione per le creature)
//   - pagamento del mana con i colori (assegnazione greedy delle fonti)
//   - lancio delle magie (euristica: prima le più costose lanciabili)
//
// SEMPLIFICAZIONI NOTE (v2): il ramp è modellato in modo approssimato (le
// creature-mana non possono tappare il turno in cui entrano; i rock sì; il
// ramp che cerca terre le mette in gioco tappate del colore del mazzo). Le
// carte a doppia faccia usano la faccia frontale; i costi ibridi/Phyrexian
// contano come 1 generico. Rituali one-shot (es. Dark Ritual) non modellati.

import { CardInfo, Color, COLORS } from "../types";

export interface SimConfig {
  numGames: number;
  onPlay: boolean;
  maxTurns: number;
  handSize: number;
  keepMinLands: number;
  keepMaxLands: number;
  maxMulligans: number;
  seed?: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  numGames: 10000,
  onPlay: true,
  maxTurns: 12,
  handSize: 7,
  keepMinLands: 2,
  keepMaxLands: 5,
  maxMulligans: 4,
};

export interface TurnSnapshot {
  turn: number;
  drew: string | null;
  playedLand: string | null;
  landsInPlay: number;
  manaAvailable: number;
  colorsAvailable: Color[];
  cast: string[];
  /** Terre messe in gioco dal ramp questo turno. */
  rampLands: number;
  handAfter: string[];
}

export interface GameLog {
  mulligans: number;
  openingHand: string[];
  onThePlay: boolean;
  turns: TurnSnapshot[];
}

export interface SimStats {
  numGames: number;
  config: SimConfig;
  keepableRate: number;
  avgMulligans: number;
  avgOpeningLands: number;
  avgLandsByTurn: number[];
  /** Mana totale disponibile (terre + ramp) per turno. */
  avgManaByTurn: number[];
  colorAvailByTurn: Record<Color, number[]>;
  onlineRateByTurn: number[];
  avgOnlineTurn: number;
  /** Prob. di avere almeno T terre in gioco al turno T ("land drop rispettati"). */
  onCurveLandsByTurn: number[];
  /** Danno cumulativo medio inflitto entro il turno (clock goldfish, ottimistico). */
  avgDamageByTurn: number[];
  /** Turno medio in cui il danno cumulativo raggiunge 20 (kill goldfish). */
  avgKillTurn: number;
  keyCmc: number;
  representativeGame: GameLog;
}

// ---------------------------------------------------------------------------
// RNG deterministico (mulberry32) per shuffle riproducibili.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Pagamento del mana: assegnazione greedy delle fonti disponibili.
// `sources` è una lista di insiemi-colore (una fonte = 1 mana). Le fonti
// incolori sono array vuoti (pagano solo generico). Muta `sources` in caso di
// successo, rimuovendo le fonti consumate.
// ---------------------------------------------------------------------------
function tryPay(
  pips: Partial<Record<Color, number>>,
  generic: number,
  sources: Color[][],
): boolean {
  const used = new Set<number>();

  for (const color of COLORS) {
    const need = pips[color] ?? 0;
    for (let n = 0; n < need; n++) {
      let best = -1;
      let bestSize = Infinity;
      for (let i = 0; i < sources.length; i++) {
        if (used.has(i)) continue;
        const s = sources[i];
        if (s.includes(color) && s.length < bestSize) {
          best = i;
          bestSize = s.length;
        }
      }
      if (best === -1) return false;
      used.add(best);
    }
  }

  let remaining = sources.length - used.size;
  if (remaining < generic) return false;
  let g = generic;
  for (let i = 0; i < sources.length && g > 0; i++) {
    if (!used.has(i)) {
      used.add(i);
      g--;
    }
  }

  const kept: Color[][] = [];
  for (let i = 0; i < sources.length; i++) if (!used.has(i)) kept.push(sources[i]);
  sources.length = 0;
  for (const s of kept) sources.push(s);
  return true;
}

// ---------------------------------------------------------------------------
// Stato di gioco leggero.
// ---------------------------------------------------------------------------
interface LandInPlay {
  colors: Color[];
  entersTapped: boolean;
  enteredThisTurn: boolean;
}

// Permanente non-terra che produce mana (dork / rock).
interface ManaPermanent {
  colors: Color[];
  amount: number;
  summoningSick: boolean;
}

function countLands(hand: CardInfo[]): number {
  let n = 0;
  for (const c of hand) if (c.isLand) n++;
  return n;
}

function chooseBottom(hand: CardInfo[], m: number): number[] {
  if (m <= 0) return [];
  const idx = hand.map((_, i) => i);
  const lands = countLands(hand);
  idx.sort((a, b) => bottomPriority(hand[a], lands) - bottomPriority(hand[b], lands));
  return idx.slice(0, m);
}

function bottomPriority(card: CardInfo, landsInHand: number): number {
  if (card.isLand) return landsInHand > 3 ? 0 : 100;
  return 50 - card.cmc;
}

function chooseLand(
  hand: CardInfo[],
  currentColors: Set<Color>,
  neededColors: Set<Color>,
): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (!c.isLand) continue;
    let newNeeded = 0;
    for (const col of c.producedMana) {
      if (!currentColors.has(col) && neededColors.has(col)) newNeeded++;
    }
    const untapped = c.entersTapped ? 0 : 1;
    const score = newNeeded * 3 + untapped;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Simulazione di una singola partita.
// ---------------------------------------------------------------------------
function playGame(
  deck: CardInfo[],
  cfg: SimConfig,
  keyCmc: number,
  deckColors: Color[],
  rng: () => number,
  wantLog: boolean,
): {
  mulligans: number;
  kept7: boolean;
  landsByTurn: number[];
  manaByTurn: number[];
  colorMaskByTurn: number[];
  onlineTurn: number;
  damageByTurn: number[];
  killTurn: number;
  log?: GameLog;
} {
  // --- Mulligan alla londinese ---
  let library: CardInfo[] = [];
  let hand: CardInfo[] = [];
  let mulligans = 0;
  while (true) {
    library = deck.slice();
    shuffle(library, rng);
    hand = library.splice(0, cfg.handSize);
    const lands = countLands(hand);
    const keep =
      (lands >= cfg.keepMinLands && lands <= cfg.keepMaxLands) ||
      mulligans >= cfg.maxMulligans;
    if (keep) break;
    mulligans++;
  }
  const toBottom = chooseBottom(hand, mulligans).sort((a, b) => b - a);
  const bottomed: CardInfo[] = [];
  for (const i of toBottom) bottomed.push(...hand.splice(i, 1));
  library.push(...bottomed);

  const openingHand = wantLog ? hand.map((c) => c.name) : [];

  // --- Turni ---
  const battlefield: LandInPlay[] = [];
  const manaPerms: ManaPermanent[] = [];
  const currentColors = new Set<Color>();
  const landsByTurn = new Array(cfg.maxTurns + 1).fill(0);
  const manaByTurn = new Array(cfg.maxTurns + 1).fill(0);
  const colorMaskByTurn = new Array(cfg.maxTurns + 1).fill(0);
  let onlineTurn = cfg.maxTurns + 1;
  const turnLogs: TurnSnapshot[] = [];
  // Creature entrate: potenza e turno d'ingresso (per il clock di danno).
  const creatures: { power: number; enteredTurn: number }[] = [];
  let libTop = 0;

  for (let turn = 1; turn <= cfg.maxTurns; turn++) {
    // Untap: terre "non più entrate ora" e permanenti-mana non più malati.
    for (const l of battlefield) l.enteredThisTurn = false;
    for (const p of manaPerms) p.summoningSick = false;

    // Pescata.
    let drew: string | null = null;
    if (!(turn === 1 && cfg.onPlay)) {
      if (libTop < library.length) {
        const card = library[libTop++];
        hand.push(card);
        drew = card.name;
      }
    }

    // Colori desiderati dalle magie in mano.
    const neededColors = new Set<Color>();
    for (const c of hand) {
      if (c.isLand) continue;
      for (const col of COLORS) if ((c.pips[col] ?? 0) > 0) neededColors.add(col);
    }

    // Gioca una terra.
    let playedLand: string | null = null;
    const landIdx = chooseLand(hand, currentColors, neededColors);
    if (landIdx >= 0) {
      const land = hand.splice(landIdx, 1)[0];
      battlefield.push({
        colors: land.producedMana,
        entersTapped: land.entersTapped,
        enteredThisTurn: true,
      });
      for (const col of land.producedMana) currentColors.add(col);
      playedLand = land.name;
    }

    // Fonti disponibili questo turno: terre + permanenti-mana non malati.
    const sources: Color[][] = [];
    for (const l of battlefield) {
      if (l.entersTapped && l.enteredThisTurn) continue;
      sources.push(l.colors.slice());
    }
    for (const p of manaPerms) {
      if (p.summoningSick) continue;
      for (let k = 0; k < p.amount; k++) sources.push(p.colors.slice());
    }
    const manaAvailable = sources.length;
    const colorsAvailable: Color[] = [];
    {
      const set = new Set<Color>();
      for (const s of sources) for (const c of s) set.add(c);
      for (const c of COLORS) if (set.has(c)) colorsAvailable.push(c);
    }

    // Lancio magie: greedy, prima le più costose lanciabili.
    const cast: string[] = [];
    let rampLands = 0;
    while (true) {
      let chosen = -1;
      let chosenCmc = -1;
      for (let i = 0; i < hand.length; i++) {
        const c = hand[i];
        if (c.isLand) continue;
        if (c.cmc > sources.length) continue;
        const copy = sources.map((s) => s.slice());
        if (tryPay(c.pips, c.generic, copy) && c.cmc > chosenCmc) {
          chosenCmc = c.cmc;
          chosen = i;
        }
      }
      if (chosen === -1) break;
      const c = hand[chosen];
      tryPay(c.pips, c.generic, sources); // consuma davvero
      cast.push(c.name);
      hand.splice(chosen, 1);
      if (c.cmc >= keyCmc && turn < onlineTurn) onlineTurn = turn;
      if (c.categories.includes("creature")) {
        creatures.push({ power: Math.max(0, c.power ?? 0), enteredTurn: turn });
      }

      // Effetti di mana della carta lanciata.
      const ma = c.manaAbility;
      if (ma?.kind === "permanent") {
        manaPerms.push({
          colors: ma.colors,
          amount: ma.amount,
          summoningSick: ma.isCreature, // le creature non tappano il turno in cui entrano
        });
        // Un rock (artefatto) è utilizzabile subito: aggiungi fonti ora.
        if (!ma.isCreature) {
          for (let k = 0; k < ma.amount; k++) sources.push(ma.colors.slice());
        }
      } else if (ma?.kind === "fetch") {
        for (let k = 0; k < ma.amount; k++) {
          battlefield.push({
            colors: deckColors.slice(),
            entersTapped: true,
            enteredThisTurn: true,
          });
        }
        for (const col of deckColors) currentColors.add(col);
        rampLands += ma.amount;
      }
    }

    // Registrazioni.
    landsByTurn[turn] = battlefield.length;
    manaByTurn[turn] = manaAvailable;
    let mask = 0;
    for (let ci = 0; ci < COLORS.length; ci++) {
      if (colorsAvailable.includes(COLORS[ci])) mask |= 1 << ci;
    }
    colorMaskByTurn[turn] = mask;

    if (wantLog) {
      turnLogs.push({
        turn,
        drew,
        playedLand,
        landsInPlay: battlefield.length,
        manaAvailable,
        colorsAvailable,
        cast,
        rampLands,
        handAfter: hand.map((c) => c.name),
      });
    }
  }

  // Clock di danno goldfish (ottimistico: nessun bloccante né rimozione).
  // Una creatura entrata al turno `ct` attacca dai turni successivi: al turno t
  // ha inflitto potenza × (t − ct) danni cumulativi.
  const damageByTurn = new Array(cfg.maxTurns + 1).fill(0);
  let killTurn = cfg.maxTurns + 1;
  for (let t = 1; t <= cfg.maxTurns; t++) {
    let dmg = 0;
    for (const cr of creatures) if (cr.enteredTurn < t) dmg += cr.power * (t - cr.enteredTurn);
    damageByTurn[t] = dmg;
    if (dmg >= 20 && killTurn > cfg.maxTurns) killTurn = t;
  }

  return {
    mulligans,
    kept7: mulligans === 0,
    landsByTurn,
    manaByTurn,
    colorMaskByTurn,
    onlineTurn,
    damageByTurn,
    killTurn,
    log: wantLog
      ? { mulligans, openingHand, onThePlay: cfg.onPlay, turns: turnLogs }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Espansione mazzo + statistiche derivate.
// ---------------------------------------------------------------------------
export function expandDeck(cards: { card: CardInfo; quantity: number }[]): CardInfo[] {
  const out: CardInfo[] = [];
  for (const { card, quantity } of cards) {
    for (let i = 0; i < quantity; i++) out.push(card);
  }
  return out;
}

function computeKeyCmc(deck: CardInfo[]): number {
  const cmcs = deck.filter((c) => !c.isLand && c.cmc > 0).map((c) => c.cmc).sort((a, b) => a - b);
  if (cmcs.length === 0) return 1;
  const mid = cmcs[Math.floor(cmcs.length / 2)];
  return Math.max(1, Math.round(mid));
}

function computeDeckColors(deck: CardInfo[]): Color[] {
  const set = new Set<Color>();
  for (const c of deck) {
    if (c.isLand) for (const col of c.producedMana) set.add(col);
    for (const col of c.colorIdentity) set.add(col);
  }
  return COLORS.filter((c) => set.has(c));
}

// Gioca UNA sola partita e restituisce il log completo (per la modalità
// interattiva "Gioca"). Con lo stesso seed la partita è riproducibile.
export function playSingleGame(
  deck: CardInfo[],
  cfg: SimConfig,
  seed?: number,
): GameLog {
  const rng = mulberry32(seed ?? ((Math.random() * 2 ** 32) >>> 0));
  const keyCmc = computeKeyCmc(deck);
  const deckColors = computeDeckColors(deck);
  const r = playGame(deck, cfg, keyCmc, deckColors, rng, true);
  return r.log!;
}

// ---------------------------------------------------------------------------
// Esecuzione della simulazione completa.
// ---------------------------------------------------------------------------
export function runSimulation(
  deck: CardInfo[],
  cfg: SimConfig,
  onProgress?: (p: number) => void,
): SimStats {
  const rng = mulberry32(cfg.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const keyCmc = computeKeyCmc(deck);
  const deckColors = computeDeckColors(deck);

  let keptSum = 0;
  let mullSum = 0;
  let openLandsSum = 0;
  let onlineSum = 0;
  const landsByTurnSum = new Array(cfg.maxTurns + 1).fill(0);
  const manaByTurnSum = new Array(cfg.maxTurns + 1).fill(0);
  const colorCountByTurn: Record<Color, number[]> = {
    W: new Array(cfg.maxTurns + 1).fill(0),
    U: new Array(cfg.maxTurns + 1).fill(0),
    B: new Array(cfg.maxTurns + 1).fill(0),
    R: new Array(cfg.maxTurns + 1).fill(0),
    G: new Array(cfg.maxTurns + 1).fill(0),
  };
  const onlineCountByTurn = new Array(cfg.maxTurns + 2).fill(0);
  const onCurveCountByTurn = new Array(cfg.maxTurns + 1).fill(0);
  const damageByTurnSum = new Array(cfg.maxTurns + 1).fill(0);
  let killSum = 0;

  const SAMPLE = Math.min(cfg.numGames, 500);
  const sampleLogs: GameLog[] = [];
  const sampleLandsByTurn: number[][] = [];

  const progressEvery = Math.max(1, Math.floor(cfg.numGames / 50));

  for (let g = 0; g < cfg.numGames; g++) {
    const wantLog = sampleLogs.length < SAMPLE;
    const r = playGame(deck, cfg, keyCmc, deckColors, rng, wantLog);

    if (r.kept7) keptSum++;
    mullSum += r.mulligans;
    onlineSum += Math.min(r.onlineTurn, cfg.maxTurns + 1);
    for (let t = 1; t <= cfg.maxTurns; t++) {
      landsByTurnSum[t] += r.landsByTurn[t];
      manaByTurnSum[t] += r.manaByTurn[t];
      const mask = r.colorMaskByTurn[t];
      for (let ci = 0; ci < COLORS.length; ci++) {
        if (mask & (1 << ci)) colorCountByTurn[COLORS[ci]][t]++;
      }
    }
    for (let t = 1; t <= cfg.maxTurns; t++) {
      if (r.onlineTurn <= t) onlineCountByTurn[t]++;
      if (r.landsByTurn[t] >= t) onCurveCountByTurn[t]++;
      damageByTurnSum[t] += r.damageByTurn[t];
    }
    killSum += Math.min(r.killTurn, cfg.maxTurns + 1);
    if (r.log) openLandsSum += r.log.openingHand.filter(isLandName(deck)).length;

    if (r.log) {
      sampleLogs.push(r.log);
      sampleLandsByTurn.push(r.landsByTurn);
    }

    if (onProgress && g % progressEvery === 0) onProgress(g / cfg.numGames);
  }

  const n = cfg.numGames;
  const avgLandsByTurn = landsByTurnSum.map((s) => s / n);
  const avgManaByTurn = manaByTurnSum.map((s) => s / n);
  const colorAvailByTurn: Record<Color, number[]> = {
    W: colorCountByTurn.W.map((s) => s / n),
    U: colorCountByTurn.U.map((s) => s / n),
    B: colorCountByTurn.B.map((s) => s / n),
    R: colorCountByTurn.R.map((s) => s / n),
    G: colorCountByTurn.G.map((s) => s / n),
  };
  const onlineRateByTurn = onlineCountByTurn.map((s) => s / n);
  const onCurveLandsByTurn = onCurveCountByTurn.map((s) => s / n);
  const avgDamageByTurn = damageByTurnSum.map((s) => s / n);
  const avgKillTurn = killSum / n;

  const avgOpeningLands = sampleLogs.length
    ? openLandsSum / sampleLogs.length
    : 0;

  let repIdx = 0;
  let repDist = Infinity;
  for (let i = 0; i < sampleLandsByTurn.length; i++) {
    let d = 0;
    for (let t = 1; t <= cfg.maxTurns; t++) {
      const diff = sampleLandsByTurn[i][t] - avgLandsByTurn[t];
      d += diff * diff;
    }
    if (d < repDist) {
      repDist = d;
      repIdx = i;
    }
  }

  if (onProgress) onProgress(1);

  return {
    numGames: n,
    config: cfg,
    keepableRate: keptSum / n,
    avgMulligans: mullSum / n,
    avgOpeningLands,
    avgLandsByTurn,
    avgManaByTurn,
    colorAvailByTurn,
    onlineRateByTurn,
    avgOnlineTurn: onlineSum / n,
    onCurveLandsByTurn,
    avgDamageByTurn,
    avgKillTurn,
    keyCmc,
    representativeGame: sampleLogs[repIdx],
  };
}

function isLandName(deck: CardInfo[]): (name: string) => boolean {
  const landNames = new Set(deck.filter((c) => c.isLand).map((c) => c.name));
  return (name: string) => landNames.has(name);
}
