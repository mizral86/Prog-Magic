// Motore GIOCABILE (solitario): l'utente fa le scelte turno per turno —
// mulligan, gioca la terra, lancia le magie. Nessun avversario (v1): serve a
// provare a mano lo sviluppo del mazzo. Riusa il pagamento mana del motore
// goldfish (tryPay) per coerenza.
//
// Non modellati (v1): combattimento, bersagli/effetti delle magie, abilità
// attivate. Le magie permanenti restano in gioco, istantanei/stregonerie
// vanno nel cimitero. Ramp/dork riusano manaAbility come nel goldfish.

import { CardInfo, Color, COLORS } from "../types";
import { tryPay } from "./engine";

export type Phase = "mulligan" | "main";

export interface LandInPlay {
  card: CardInfo;
  enteredThisTurn: boolean;
}
export interface PermInPlay {
  card: CardInfo;
  summoningSick: boolean;
}

export interface Snapshot {
  phase: Phase;
  turn: number;
  mulligansTaken: number;
  toBottom: number; // carte da rimettere in fondo alla tenuta (mulligan londinese)
  hand: CardInfo[];
  lands: LandInPlay[];
  permanents: PermInPlay[];
  graveyard: CardInfo[];
  availableMana: number;
  availableColors: Color[];
  landPlayedThisTurn: boolean;
  libraryCount: number;
  onPlay: boolean;
  log: string[];
  /** indici in mano giocabili come terra / lanciabili adesso. */
  playableLand: boolean[];
  castable: boolean[];
}

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

const PERM_CATS = ["creature", "planeswalker", "artifact", "enchantment", "battle"];
function isPermanentSpell(c: CardInfo): boolean {
  return c.categories.some((k) => PERM_CATS.includes(k));
}

// Terra "sintetica" messa in gioco dal ramp (cerca terra): tappata, produce i
// colori del mazzo.
function rampLand(colors: Color[]): CardInfo {
  return {
    name: "Terra (ramp)",
    cmc: 0,
    typeLine: "Land",
    categories: ["land"],
    colors: [],
    colorIdentity: colors,
    isLand: true,
    producedMana: colors,
    entersTapped: true,
    manaCost: "",
    pips: {},
    generic: 0,
    oracleText: "",
  };
}

export class InteractiveGame {
  private deck: CardInfo[];
  private rng: () => number;
  private library: CardInfo[] = [];
  private hand: CardInfo[] = [];
  private lands: LandInPlay[] = [];
  private permanents: PermInPlay[] = [];
  private graveyard: CardInfo[] = [];
  private manaPerms: { colors: Color[]; amount: number; sick: boolean }[] = [];
  private available: Color[][] = []; // fonti di mana ancora disponibili nel turno
  private deckColors: Color[];
  private turn = 0;
  private phase: Phase = "mulligan";
  private mulligansTaken = 0;
  private landPlayedThisTurn = false;
  private onPlay: boolean;
  private log: string[] = [];

  constructor(deck: CardInfo[], seed: number, onPlay: boolean) {
    this.deck = deck;
    this.rng = mulberry32(seed);
    this.onPlay = onPlay;
    this.deckColors = deckColors(deck);
    this.deal();
  }

  private deal() {
    this.library = this.deck.slice();
    shuffle(this.library, this.rng);
    this.hand = this.library.splice(0, 7);
    this.phase = "mulligan";
  }

  mulligan() {
    this.mulligansTaken++;
    this.log.push(`Mulligan: peschi 7 (poi rimetti in fondo ${this.mulligansTaken}).`);
    this.deal();
  }

  // Tieni la mano: rimetti in fondo `mulligansTaken` carte scelte dall'utente
  // (o, se non specificate, le peggiori). Poi inizia il turno 1.
  keep(bottomIndexes?: number[]) {
    const n = this.mulligansTaken;
    let idx = bottomIndexes ? [...bottomIndexes] : this.autoBottom(n);
    idx = [...new Set(idx)].sort((a, b) => b - a).slice(0, n);
    for (const i of idx) {
      const [c] = this.hand.splice(i, 1);
      if (c) this.library.push(c);
    }
    this.phase = "main";
    this.log.push(`Tieni ${this.hand.length} carte.`);
    this.beginTurn();
  }

  private autoBottom(n: number): number[] {
    if (n <= 0) return [];
    const lands = this.hand.filter((c) => c.isLand).length;
    const order = this.hand
      .map((c, i) => ({ i, s: bottomScore(c, lands) }))
      .sort((a, b) => a.s - b.s)
      .map((x) => x.i);
    return order.slice(0, n);
  }

  private beginTurn() {
    this.turn++;
    for (const l of this.lands) l.enteredThisTurn = false;
    for (const p of this.permanents) p.summoningSick = false;
    for (const mp of this.manaPerms) mp.sick = false;
    this.landPlayedThisTurn = false;
    if (!(this.turn === 1 && this.onPlay)) {
      const c = this.library.shift();
      if (c) {
        this.hand.push(c);
        this.log.push(`T${this.turn}: peschi ${c.name}.`);
      } else {
        this.log.push(`T${this.turn}: libreria vuota (niente pescata).`);
      }
    } else {
      this.log.push(`T${this.turn}: in gioco, salti la pescata.`);
    }
    this.rebuildMana();
  }

  private rebuildMana() {
    this.available = [];
    for (const l of this.lands) {
      if (l.card.entersTapped && l.enteredThisTurn) continue;
      this.available.push(l.card.producedMana.slice());
    }
    for (const mp of this.manaPerms) {
      if (mp.sick) continue;
      for (let k = 0; k < mp.amount; k++) this.available.push(mp.colors.slice());
    }
  }

  endTurn() {
    if (this.phase !== "main") return;
    this.beginTurn();
  }

  playLand(handIndex: number): boolean {
    if (this.phase !== "main" || this.landPlayedThisTurn) return false;
    const card = this.hand[handIndex];
    if (!card || !card.isLand) return false;
    this.hand.splice(handIndex, 1);
    this.landPlayedThisTurn = true;

    // Fetchland (Marsh Flats, Evolving Wilds, Prismatic Vista…): mette la terra
    // in gioco e la "cracca" subito cercando una terra dalla libreria.
    const fetch = fetchLandMatcher(card.oracleText);
    if (fetch) {
      const li = this.library.findIndex((c) => c.isLand && fetch.match(c));
      if (li >= 0) {
        let fetched = this.library.splice(li, 1)[0];
        if (fetch.tapped) fetched = { ...fetched, entersTapped: true };
        this.lands.push({ card: fetched, enteredThisTurn: true });
        this.graveyard.push(card);
        if (!fetched.entersTapped) this.available.push(fetched.producedMana.slice());
        shuffle(this.library, this.rng);
        this.log.push(`T${this.turn}: giochi ${card.name}, cerchi ${fetched.name}.`);
        return true;
      }
      // Nessuna terra da cercare: la fetch resta in gioco (non produce mana).
      this.lands.push({ card, enteredThisTurn: true });
      this.log.push(`T${this.turn}: giochi ${card.name} (nessuna terra da cercare).`);
      return true;
    }

    this.lands.push({ card, enteredThisTurn: true });
    if (!card.entersTapped) this.available.push(card.producedMana.slice());
    this.log.push(`T${this.turn}: giochi ${card.name}.`);
    return true;
  }

  canCast(card: CardInfo): boolean {
    if (card.isLand || card.cmc > this.available.length) return false;
    return tryPay(card.pips, card.generic, this.available.map((s) => s.slice()));
  }

  cast(handIndex: number): boolean {
    if (this.phase !== "main") return false;
    const card = this.hand[handIndex];
    if (!card || !this.canCast(card)) return false;
    tryPay(card.pips, card.generic, this.available); // consuma per davvero
    this.hand.splice(handIndex, 1);

    if (isPermanentSpell(card)) {
      this.permanents.push({ card, summoningSick: card.categories.includes("creature") });
    } else {
      this.graveyard.push(card);
    }

    const ma = card.manaAbility;
    if (ma?.kind === "permanent") {
      this.manaPerms.push({ colors: ma.colors, amount: ma.amount, sick: ma.isCreature });
      if (!ma.isCreature)
        for (let k = 0; k < ma.amount; k++) this.available.push(ma.colors.slice());
    } else if (ma?.kind === "fetch") {
      for (let k = 0; k < ma.amount; k++)
        this.lands.push({ card: rampLand(this.deckColors), enteredThisTurn: true });
    }

    this.log.push(`T${this.turn}: lanci ${card.name}.`);
    return true;
  }

  snapshot(): Snapshot {
    const availColors = new Set<Color>();
    for (const s of this.available) for (const c of s) availColors.add(c);
    return {
      phase: this.phase,
      turn: this.turn,
      mulligansTaken: this.mulligansTaken,
      toBottom: this.mulligansTaken,
      hand: this.hand.slice(),
      lands: this.lands.map((l) => ({ ...l })),
      permanents: this.permanents.map((p) => ({ ...p })),
      graveyard: this.graveyard.slice(),
      availableMana: this.available.length,
      availableColors: COLORS.filter((c) => availColors.has(c)),
      landPlayedThisTurn: this.landPlayedThisTurn,
      libraryCount: this.library.length,
      onPlay: this.onPlay,
      log: this.log.slice(),
      playableLand: this.hand.map(
        (c) => this.phase === "main" && c.isLand && !this.landPlayedThisTurn,
      ),
      castable: this.hand.map((c) => this.phase === "main" && this.canCast(c)),
    };
  }
}

function bottomScore(c: CardInfo, lands: number): number {
  if (c.isLand) return lands > 3 ? 0 : 100;
  return 50 - c.cmc;
}

// Riconosce una fetchland dal testo e restituisce come cercare il bersaglio.
// null se la terra non è una fetch.
const BASIC_TYPES = ["plains", "island", "swamp", "mountain", "forest"];
function fetchLandMatcher(
  oracle: string,
): { match: (c: CardInfo) => boolean; tapped: boolean } | null {
  const t = (oracle || "").toLowerCase();
  if (!/search your library for/.test(t) || !/onto the battlefield/.test(t)) {
    return null;
  }
  if (!/\bland\b|plains|island|swamp|mountain|forest/.test(t)) return null;
  const tapped = /onto the battlefield tapped/.test(t);
  const types = BASIC_TYPES.filter((x) => t.includes(x));
  const basicOnly = /basic land/.test(t);
  const match = (c: CardInfo): boolean => {
    const tl = c.typeLine.toLowerCase();
    if (types.length > 0) return types.some((x) => tl.includes(x));
    if (basicOnly) return tl.includes("basic");
    return tl.includes("land");
  };
  return { match, tapped };
}

function deckColors(deck: CardInfo[]): Color[] {
  const s = new Set<Color>();
  for (const c of deck) {
    if (c.isLand) for (const col of c.producedMana) s.add(col);
    for (const col of c.colorIdentity) s.add(col);
  }
  return COLORS.filter((c) => s.has(c));
}
