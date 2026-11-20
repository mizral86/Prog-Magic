// Simulatore INTERATTIVO semplificato a 2 giocatori.
//
// Gioca davvero le partite: punti vita, terre + ramp, creature e combattimento,
// e gli effetti chiave dedotti dai RUOLI/numeri delle carte:
//   - creature (forza/costituzione), attacco e blocco
//   - rimozione mirata (uccide la miglior creatura avversaria)
//   - spazzavia (distrugge tutte le creature)
//   - burn (danno diretto al giocatore)
//   - counter (reattivo, sul turno avversario)
//   - pescata extra, guadagno vita, ramp
//   - fasi del turno: stappo, mantenimento, pescata, principale 1,
//     combattimento, principale 2, finale (con i trigger "all'inizio del
//     mantenimento / della pescata / della sottofase finale" più semplici)
//
// SEMPLIFICAZIONI: niente abilità attivate, trigger con condizioni ("if…")
// ignorati, planeswalker approssimati a creature (costituzione
// = lealtà). Il mana colorato è verificato in modo approssimato. Produce una
// win-rate REALE nei limiti di questo modello, non una simulazione di MTG
// completa.

import { CardInfo, Color, COLORS } from "../types";
import { rolesOf } from "../cardRoles";

export interface BattleConfig {
  games: number;
  maxTurns: number;
  startLife: number;
  handSize: number;
  seed?: number;
}

export const DEFAULT_BATTLE: BattleConfig = {
  games: 2000,
  maxTurns: 24,
  startLife: 20,
  handSize: 7,
};

// Riga del log d'esempio: testo leggibile + eventuali carte citate (per le
// miniature) + flag intestazione (turno/esito).
export interface BattleLogLine {
  text: string;
  cards?: string[];
  head?: boolean;
  /** Fase del turno in cui è successo. */
  phase?: PhaseId;
  /** Dettaglio: mostrato solo con il log dettagliato. */
  extra?: boolean;
}

/** Fasi del turno simulate, in ordine. */
export type PhaseId =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "combat"
  | "main2"
  | "end";
export const PHASE_LABEL: Record<PhaseId, string> = {
  untap: "Stappo",
  upkeep: "Mantenimento",
  draw: "Pescata",
  main1: "Principale 1",
  combat: "Combattimento",
  main2: "Principale 2",
  end: "Finale",
};

/** Una partita di esempio da mostrare (scelta in proporzione alle vittorie). */
export interface BattleScenario {
  winner: "A" | "B" | "draw";
  /** Chi ha iniziato (on the play). */
  onPlay: "A" | "B";
  turns: number;
  lines: BattleLogLine[];
}

export interface BattleResult {
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  winRateA: number; // vittorie A / partite decise
  avgTurns: number;
  avgLifeA: number;
  avgLifeB: number;
  sampleLog: BattleLogLine[];
  /** 3 partite di esempio: quante vinte da A/B in proporzione alla win-rate. */
  scenarios: BattleScenario[];
  /** Vittorie di A quando inizia e quando pesca (partite decise). */
  play: {
    aPlayWins: number;
    aPlayGames: number;
    aDrawWins: number;
    aDrawGames: number;
  };
}

/** Nei testi del log i giocatori sono segnaposto, la UI mette i nomi dei mazzi. */
export const TOKEN_A = "⟦A⟧";
export const TOKEN_B = "⟦B⟧";

// ---------------------------------------------------------------------------
// Profilo di gioco derivato da una carta.
// ---------------------------------------------------------------------------
interface Profile {
  name: string;
  cmc: number;
  pips: Partial<Record<Color, number>>;
  isLand: boolean;
  entersTapped: boolean;
  producedMana: Color[];
  manaAbility?: CardInfo["manaAbility"];
  isCreature: boolean;
  isPlaneswalker: boolean;
  power: number;
  toughness: number;
  removal: boolean;
  boardwipe: boolean;
  counter: boolean;
  burn: number;
  draw: number;
  lifegain: number;
  /** Toglie una carta non terra dalla mano avversaria (Thoughtseize, Salt Vampire). */
  handAttack: boolean;
  /** …e l'avversario pesca una carta al suo posto. */
  handAttackDraw: boolean;
  /** Istantaneo o stregoneria (va al cimitero dopo la risoluzione). */
  isSpell: boolean;
  /** L'avversario perde vita (drain). */
  drain: number;
  /** Trigger su ogni propria creatura che entra (dopo che questo è in campo). */
  onAllyEnterGain: number;
  onAllyEnterDrain: number;
  flying: boolean;
  reach: boolean;
  lifelink: boolean;
  deathtouch: boolean;
  vigilance: boolean;
  /** Prospero: +1/+1 a ogni magia non creatura lanciata. */
  prowess: boolean;
  /** Rapidità: attacca il turno in cui entra. */
  haste: boolean;
  /** Lampo: creatura lanciata nel turno avversario (fine turno). */
  flash: boolean;
  /** Potenziamento a una creatura (es. Crescita Mutagena: +2). */
  pump: number;
  /** Abilità "all'inizio del mantenimento / pescata / sottofase finale". */
  phaseTrig: PhaseTrigger[];
}

// Abilità innescata all'inizio di una fase. `whose`: di chi deve essere il
// turno ("you" = di chi controlla la carta, "opp" = dell'avversario, "each" =
// di chiunque). Gli effetti "that player" colpiscono il giocatore di turno.
interface PhaseTrigger {
  when: "upkeep" | "draw" | "end";
  whose: "you" | "opp" | "each";
  draw: number;
  thatDraw: number;
  gain: number;
  loseSelf: number;
  /** L'avversario di chi controlla la carta perde vita (danni o perdita). */
  drain: number;
  thatLose: number;
  token?: {
    n: number;
    power: number;
    toughness: number;
    name: string;
    flying: boolean;
  };
  /** Rivela la prima carta e la metti in mano, perdi vita pari al suo costo (Bob). */
  revealToHand: boolean;
  loseRevealedCmc: boolean;
}

const COLOR_WORDS = /\b(white|blue|black|red|green|colorless|and)\b/g;
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

function parsePhaseTrigger(line: string): PhaseTrigger | null {
  const m = line.match(
    /^at the beginning of (your|each|each player's|each opponent's|the|that player's) (upkeep|draw step|end step)(?: of [^,]+)?, (.*)$/,
  );
  if (!m) return null;
  const body = m[3];
  // Condizioni ("if you control…"): non sappiamo valutarle, meglio non inventare.
  if (/^if /.test(body)) return null;
  const whose: PhaseTrigger["whose"] =
    m[1] === "your" ? "you" : m[1] === "each opponent's" ? "opp" : "each";
  const when: PhaseTrigger["when"] =
    m[2] === "upkeep" ? "upkeep" : m[2] === "draw step" ? "draw" : "end";
  const n = (re: RegExp) => {
    const x = body.match(re);
    return x ? wordNum(x[1] ?? x[2]) : 0;
  };
  const t: PhaseTrigger = {
    when,
    whose,
    draw: Math.min(
      3,
      n(
        new RegExp(
          `(?:^|you |may |then |and |, )draws? ${NUM} (?:additional )?cards?`,
        ),
      ),
    ),
    thatDraw: n(new RegExp(`that player draws ${NUM} (?:additional )?cards?`)),
    gain: n(/(?:^|you |may |and |, |then )gain (\d+) life/),
    loseSelf: n(/you lose (\d+) life/) + n(/deals? (\d+) damage to you\b/),
    drain:
      n(
        /each opponent loses (\d+) life|target (?:opponent|player) loses (\d+) life/,
      ) +
      n(
        /deals? (\d+) damage to (?:each opponent|any target|target opponent|target player|target creature or player)/,
      ),
    thatLose:
      n(/that player loses (\d+) life/) +
      n(/deals? (\d+) damage to that player/),
    revealToHand:
      /(?:reveal|look at) the top card of your library[^.]*put (?:that card|it) into your hand/.test(
        body,
      ),
    loseRevealedCmc:
      /lose life equal to its (?:mana value|converted mana cost)/.test(body),
  };
  const tk = body.match(
    new RegExp(
      `create ${NUM} (?:tapped )?(\\d+)/(\\d+) ([a-z ]+?) (?:artifact )?creature tokens?([^.]*)`,
    ),
  );
  if (tk) {
    const kind = tk[4]
      .replace(COLOR_WORDS, "")
      .trim()
      .split(/\s+/)
      .map(cap)
      .join(" ");
    t.token = {
      n: wordNum(tk[1]),
      power: parseInt(tk[2], 10),
      toughness: parseInt(tk[3], 10),
      name: `Pedina ${kind || "creatura"}`,
      flying: /^ with [^.]*flying/.test(tk[5]),
    };
  }
  const any =
    t.draw ||
    t.thatDraw ||
    t.gain ||
    t.loseSelf ||
    t.drain ||
    t.thatLose ||
    t.token ||
    t.revealToHand;
  return any ? t : null;
}

function wordNum(w: string): number {
  const map: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
  };
  return map[w] ?? (parseInt(w, 10) || 0);
}

// Divide il testo Oracle nelle sue abilità e tiene solo quelle che fanno
// qualcosa "subito": il testo di istantanei/stregonerie e le abilità "quando
// entra" dei permanenti. Le abilità innescate ("ogni volta che…", "all'inizio
// di…") e quelle attivate ("{T}: …") NON si risolvono al lancio.
function splitAbilities(card: CardInfo): { now: string; all: string[] } {
  const name = card.name.toLowerCase();
  const lines = (card.oracleText || "")
    .toLowerCase()
    .split(/\n+/)
    .map((l) => l.split(name).join("this").trim())
    .filter(Boolean);
  const isSpell =
    card.categories.includes("instant") || card.categories.includes("sorcery");
  const now: string[] = [];
  for (const l of lines) {
    if (/^(whenever|at the beginning|at end of)/.test(l)) continue;
    if (/^[^"]*?\{[^}]+\}[^"]*?:/.test(l) || /^[a-z ,]+—/.test(l)) continue; // attivate / parole chiave con costo
    if (isSpell) {
      now.push(l);
      continue;
    }
    const etb = l.match(
      /^when (?:this [a-z]+|this) enters(?: the battlefield)?(?: or [^,]+)?, (.*)$/,
    );
    if (etb) now.push(etb[1]);
  }
  return { now: now.join("\n"), all: lines };
}

const NUM = "(\\d+|a|an|one|two|three|four)";
const kw = (all: string[], k: string) =>
  all.some((l) => new RegExp(`^(?:[a-z ]+, )*${k}(?:,|$| \\()`).test(l));

function profileOf(card: CardInfo): Profile {
  const { now: text, all } = splitAbilities(card);
  const roles = rolesOf({ ...card, oracleText: text });
  const isCreature = card.categories.includes("creature");
  const isPlaneswalker = card.categories.includes("planeswalker");

  const burnM = text.match(
    /deals? (\d+) damage to (any target|target player|target opponent|each opponent|target creature or player|target planeswalker or player)/,
  );
  const burn = burnM ? parseInt(burnM[1], 10) : 0;

  // Pesca chi lancia solo con "draw" (2a persona): "that player draws",
  // "target opponent draws" fanno pescare qualcun altro.
  const dM = text.match(
    new RegExp(`(?:^|you |may |then |and |, )draw ${NUM} cards?`, "m"),
  );
  const draw = dM ? Math.min(4, wordNum(dM[1])) : 0;
  const pumpM = text.match(
    /target creature(?: you control)? gets \+(\d+)\/\+(\d+)/,
  );
  const pump = !isCreature && pumpM ? parseInt(pumpM[1], 10) : 0;
  const prowess =
    isCreature &&
    (kw(all, "prowess") ||
      all.some((l) =>
        /^whenever you cast a noncreature spell, this [a-z ]*gets \+1\/\+1/.test(
          l,
        ),
      ));
  // "you gain N life" / "gain N life": "its controller gains 3 life"
  // (Swords to Plowshares) fa guadagnare l'avversario, non chi lancia.
  const lgM = text.match(/(?:^|you |and |, |then )gain (\d+) life/m);
  const lifegain = lgM ? parseInt(lgM[1], 10) : 0;
  const drM = text.match(
    /each opponent loses (\d+) life|target (?:opponent|player) loses (\d+) life/,
  );
  const drain = drM ? parseInt(drM[1] ?? drM[2], 10) : 0;

  // Trigger "ogni volta che una creatura che controlli entra" (Case of the
  // Uneaten Feast, Soul Warden…): vita guadagnata / persa dall'avversario.
  let onAllyEnterGain = 0;
  let onAllyEnterDrain = 0;
  for (const l of all) {
    const m = l.match(
      /^whenever (?:a|another) (?:nontoken )?creature(?: you control)? enters(?: the battlefield)?(?: under your control)?, (.*)$/,
    );
    if (!m) continue;
    const g = m[1].match(/you gain (\d+) life/);
    if (g) onAllyEnterGain += parseInt(g[1], 10);
    const d = m[1].match(/each opponent loses (\d+) life/);
    if (d) onAllyEnterDrain += parseInt(d[1], 10);
  }

  // Planeswalker approssimato: forza 3, costituzione = lealtà (o 4).
  const power = isPlaneswalker ? 3 : (card.power ?? 0);
  const toughness = isPlaneswalker
    ? (card.loyalty ?? 4)
    : (card.toughness ?? 0);

  return {
    name: card.name,
    cmc: card.cmc,
    pips: card.pips,
    isLand: card.isLand,
    entersTapped: card.entersTapped,
    producedMana: card.producedMana,
    manaAbility: card.manaAbility,
    isCreature: isCreature || isPlaneswalker,
    isPlaneswalker,
    power,
    toughness,
    removal:
      !roles.has("boardwipe") &&
      (roles.has("creature-removal") || roles.has("removal")) &&
      burn === 0,
    boardwipe: roles.has("boardwipe"),
    counter: roles.has("counter"),
    burn,
    draw,
    lifegain,
    handAttack:
      /(target (opponent|player)|that player)[^.]*(reveals|hand)[^.]*\.?[^.]*(choose|discards?|exiles?)[^.]*(nonland|card)/.test(
        text,
      ) && /(discards|exiles) (that|the chosen) card/.test(text),
    handAttackDraw: /that player [^.]*then draws a card/.test(text),
    isSpell:
      card.categories.includes("instant") ||
      card.categories.includes("sorcery"),
    drain,
    onAllyEnterGain,
    onAllyEnterDrain,
    prowess,
    pump,
    haste: isCreature && kw(all, "haste"),
    flash: isCreature && kw(all, "flash"),
    flying: isCreature && kw(all, "flying"),
    reach: isCreature && kw(all, "reach"),
    lifelink: isCreature && kw(all, "lifelink"),
    deathtouch: isCreature && kw(all, "deathtouch"),
    vigilance: isCreature && kw(all, "vigilance"),
    phaseTrig: all
      .map(parsePhaseTrigger)
      .filter((x): x is PhaseTrigger => x !== null),
  };
}

// Profilo di una pedina creatura creata da un'abilità.
function tokenProfile(
  name: string,
  power: number,
  toughness: number,
  flying: boolean,
): Profile {
  return {
    name,
    cmc: 0,
    pips: {},
    isLand: false,
    entersTapped: false,
    producedMana: [],
    isCreature: true,
    isPlaneswalker: false,
    power,
    toughness,
    removal: false,
    boardwipe: false,
    counter: false,
    burn: 0,
    draw: 0,
    lifegain: 0,
    handAttack: false,
    handAttackDraw: false,
    isSpell: false,
    drain: 0,
    onAllyEnterGain: 0,
    onAllyEnterDrain: 0,
    flying,
    reach: false,
    lifelink: false,
    deathtouch: false,
    vigilance: false,
    prowess: false,
    haste: false,
    flash: false,
    pump: 0,
    phaseTrig: [],
  };
}

// ---------------------------------------------------------------------------
// RNG
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
function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Stato
// ---------------------------------------------------------------------------
interface Land {
  colors: Color[];
  enteredTapped: boolean;
  enteredThisTurn: boolean;
}
interface ManaPerm {
  colors: Color[];
  amount: number;
  sick: boolean;
}
interface Creature {
  p: Profile;
  sick: boolean;
  tapped: boolean;
  damage: number;
  /** Bonus fino a fine turno (prospero, potenziamenti). */
  pump: number;
}
const pw = (c: Creature) => c.p.power + c.pump;
const tg = (c: Creature) => c.p.toughness + c.pump;
interface Player {
  name: string;
  library: Profile[];
  top: number;
  hand: Profile[];
  lands: Land[];
  manaPerms: ManaPerm[];
  creatures: Creature[];
  /** Permanenti non creatura con abilità innescate (es. Case of the Uneaten Feast). */
  statics: Profile[];
  life: number;
  /** Mulligan fatti all'inizio. */
  mulls: number;
  /** Mana rimasto stappato dopo la propria fase principale (per il lampo). */
  manaLeft: number;
  srcLeft: Record<Color, number>;
  /** Il mazzo ha creature con prospero: le magie non creatura si tengono per loro. */
  prowessDeck: boolean;
}

function countLands(hand: Profile[]): number {
  let n = 0;
  for (const c of hand) if (c.isLand) n++;
  return n;
}

function mulliganHand(
  deck: Profile[],
  cfg: BattleConfig,
  rng: () => number,
): { hand: Profile[]; library: Profile[]; mulls: number } {
  let library: Profile[] = [];
  let hand: Profile[] = [];
  let mulls = 0;
  while (true) {
    library = deck.slice();
    shuffle(library, rng);
    hand = library.splice(0, cfg.handSize);
    const lands = countLands(hand);
    if ((lands >= 2 && lands <= 5) || mulls >= 3) break;
    mulls++;
  }
  // bottoming: rimetti in fondo `mulls` carte (le più costose / terre in eccesso)
  const idx = hand.map((_, i) => i);
  const lands = countLands(hand);
  idx.sort((a, b) => bottomScore(hand[a], lands) - bottomScore(hand[b], lands));
  const toBottom = idx.slice(0, mulls).sort((a, b) => b - a);
  for (const i of toBottom) library.push(...hand.splice(i, 1));
  return { hand, library, mulls };
}
function bottomScore(c: Profile, lands: number): number {
  if (c.isLand) return lands > 3 ? 0 : 100;
  return 50 - c.cmc;
}

function newPlayer(
  name: string,
  deck: Profile[],
  cfg: BattleConfig,
  rng: () => number,
): Player {
  const { hand, library, mulls } = mulliganHand(deck, cfg, rng);
  return {
    mulls,
    manaLeft: 0,
    srcLeft: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    name,
    library,
    top: 0,
    hand,
    lands: [],
    manaPerms: [],
    creatures: [],
    statics: [],
    life: cfg.startLife,
    prowessDeck: deck.filter((c) => c.prowess).length >= 4,
  };
}

// Pesca; ritorna false se il mazzo è finito (deck out).
function draw(p: Player): boolean {
  if (p.top >= p.library.length) return false;
  p.hand.push(p.library[p.top++]);
  return true;
}

// Mana disponibile questo turno + fonti per colore.
function mana(p: Player): { total: number; src: Record<Color, number> } {
  const src: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let total = 0;
  for (const l of p.lands) {
    if (l.enteredTapped && l.enteredThisTurn) continue;
    total++;
    for (const c of l.colors) src[c]++;
  }
  for (const mp of p.manaPerms) {
    if (mp.sick) continue;
    total += mp.amount;
    for (const c of mp.colors) src[c] += mp.amount;
  }
  return { total, src };
}

function canAfford(
  p: Profile,
  manaLeft: number,
  src: Record<Color, number>,
): boolean {
  if (p.cmc > manaLeft) return false;
  for (const c of COLORS) {
    const need = p.pips[c] ?? 0;
    if (need > 0 && src[c] < need) return false;
  }
  return true;
}

function deckColors(deck: Profile[]): Color[] {
  const s = new Set<Color>();
  for (const c of deck) {
    if (c.isLand) for (const col of c.producedMana) s.add(col);
    for (const col of COLORS) if ((c.pips[col] ?? 0) > 0) s.add(col);
  }
  return COLORS.filter((c) => s.has(c));
}

// ---------------------------------------------------------------------------
// Logging (solo per la partita di esempio)
// ---------------------------------------------------------------------------
type Log = {
  on: boolean;
  lines: BattleLogLine[];
  /** Fase in corso e indice della prima riga scritta in questa fase. */
  phase?: PhaseId;
  mark?: number;
};
function say(log: Log, text: string, cards?: string[], head?: boolean) {
  if (log.on)
    log.lines.push({ text, cards, head, phase: head ? undefined : log.phase });
}
/** Riga di dettaglio: si vede solo con il log dettagliato. */
function detail(log: Log, text: string) {
  if (log.on) log.lines.push({ text, phase: log.phase, extra: true });
}
function enterPhase(log: Log, id: PhaseId) {
  if (!log.on) return;
  endPhase(log);
  log.phase = id;
  log.mark = log.lines.length;
}
// Chiude la fase: se non è successo nulla lo scrive (solo nel dettagliato).
function endPhase(log: Log) {
  if (!log.on || !log.phase) return;
  if (log.lines.length === log.mark)
    log.lines.push({
      text: "niente da segnalare",
      phase: log.phase,
      extra: true,
    });
  log.phase = undefined;
}

// ---------------------------------------------------------------------------
// Abilità innescate all'inizio di mantenimento, pescata e sottofase finale.
// ---------------------------------------------------------------------------
// "⟦A⟧ 12, ⟦B⟧ 9" sempre nello stesso ordine.
const A_FIRST = (x: Player, y: Player) =>
  (x.name === TOKEN_A ? [x, y] : [y, x])
    .map((p) => `${p.name} ${p.life}`)
    .join(", ");

function phaseTriggers(
  when: PhaseTrigger["when"],
  active: Player,
  other: Player,
  log: Log,
) {
  for (const owner of [active, other]) {
    const foe = owner === active ? other : active;
    const sources = [...owner.statics, ...owner.creatures.map((c) => c.p)];
    for (const src of sources)
      for (const t of src.phaseTrig) {
        if (t.when !== when) continue;
        if (t.whose === "you" && owner !== active) continue;
        if (t.whose === "opp" && owner === active) continue;
        const mine: string[] = []; // effetti su chi controlla la carta
        const others: string[] = []; // effetti sull'altro giocatore
        const on = (p: Player, txt: string) =>
          p === owner ? mine.push(txt) : others.push(`${p.name} ${txt}`);
        if (t.revealToHand && owner.top < owner.library.length) {
          const c = owner.library[owner.top++];
          owner.hand.push(c);
          on(owner, `mette in mano ${c.name}`);
          if (t.loseRevealedCmc && c.cmc > 0) {
            owner.life -= c.cmc;
            on(owner, `perde ${c.cmc} vita`);
          }
        }
        if (t.draw > 0) {
          let k = 0;
          for (; k < t.draw && draw(owner); k++);
          if (k > 0) on(owner, `pesca ${k === 1 ? "una carta" : `${k} carte`}`);
        }
        if (t.thatDraw > 0) {
          let k = 0;
          for (; k < t.thatDraw && draw(active); k++);
          if (k > 0)
            on(active, `pesca ${k === 1 ? "una carta" : `${k} carte`}`);
        }
        if (t.gain > 0) {
          owner.life += t.gain;
          on(owner, `guadagna ${t.gain} vita`);
        }
        if (t.loseSelf > 0) {
          owner.life -= t.loseSelf;
          on(owner, `perde ${t.loseSelf} vita`);
        }
        if (t.drain > 0) {
          foe.life -= t.drain;
          on(foe, `perde ${t.drain} vita`);
        }
        if (t.thatLose > 0) {
          active.life -= t.thatLose;
          on(active, `perde ${t.thatLose} vita`);
        }
        if (t.token) {
          const tp = tokenProfile(
            t.token.name,
            t.token.power,
            t.token.toughness,
            t.token.flying,
          );
          for (let k = 0; k < t.token.n; k++) {
            allyEnters(owner, foe, tp, log);
            owner.creatures.push({
              p: tp,
              sick: true,
              tapped: false,
              damage: 0,
              pump: 0,
            });
          }
          on(
            owner,
            `crea ${t.token.n > 1 ? `${t.token.n} ` : ""}${t.token.name} ${t.token.power}/${t.token.toughness}`,
          );
        }
        if (mine.length + others.length > 0) {
          const parts = [
            ...(mine.length ? [`${owner.name} ${mine.join(", ")}`] : []),
            ...others,
          ];
          say(
            log,
            `${src.name}: ${parts.join("; ")} (vita ${A_FIRST(active, other)})`,
            [src.name],
          );
        }
      }
  }
}

// ---------------------------------------------------------------------------
// Fase principale: gioca terra + lancia magie (con counter reattivi avversari).
// ---------------------------------------------------------------------------
// Mana del turno, condiviso tra le due fasi principali (e i counter avversari).
interface TurnMana {
  left: number;
  src: Record<Color, number>;
  oppLeft: number;
  oppSrc: Record<Color, number>;
  landPlayed: boolean;
}

function startTurnMana(me: Player, opp: Player, log: Log): TurnMana {
  // Gioca una terra (preferisci una che aggiunge un colore mancante, untapped).
  const landPlayed = playLand(me, log);
  const { total, src } = mana(me);
  const o = mana(opp);
  if (log.on)
    detail(
      log,
      `${me.name} ha ${total} mana disponibile, ${me.hand.length} carte in mano`,
    );
  return { left: total, src, oppLeft: o.total, oppSrc: o.src, landPlayed };
}

// Cosa conviene lanciare DOPO il combattimento (seconda fase principale):
// creature senza rapidità (non attaccano comunque), burn che non serve a
// liberare la strada (dopo i danni del combattimento può finire una creatura
// ferita o il giocatore), pescate e vita.
function betterInMain2(c: Profile, opp: Player, landPlayed: boolean) {
  if (c.manaAbility || c.removal || c.boardwipe || c.pump > 0) return false;
  if (c.isCreature)
    return !c.haste && !(c.onAllyEnterGain > 0 || c.onAllyEnterDrain > 0);
  if (c.burn > 0) return opp.life > c.burn && bestBurnTarget(opp, c.burn) < 0;
  if (c.draw > 0) return landPlayed; // senza terra giocata, pesca subito
  return c.lifegain > 0 || c.drain > 0;
}

function mainPhase(
  me: Player,
  opp: Player,
  myColors: Color[],
  log: Log,
  tm: TurnMana,
  second: boolean,
) {
  if (second && !tm.landPlayed) {
    // Una pescata può aver portato la terra che mancava.
    tm.landPlayed = playLand(me, log);
    if (tm.landPlayed) {
      const l = me.lands[me.lands.length - 1];
      if (!l.enteredTapped) {
        tm.left++;
        for (const c of l.colors) tm.src[c]++;
      }
    }
  }
  const src = tm.src;
  let manaLeft = tm.left;
  const oppMana = { src: tm.oppSrc };
  let oppManaLeft = tm.oppLeft;

  while (true) {
    // scegli la magia migliore lanciabile
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < me.hand.length; i++) {
      const c = me.hand[i];
      if (c.isLand || c.counter) continue; // i counter si tengono
      if (c.flash) continue; // lampo: si lancia a fine turno avversario
      if (!canAfford(c, manaLeft, src)) continue;
      if (holdForProwess(c, me, opp)) continue;
      const s = spellScore(c, me, opp);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best === -1) break;
    // La migliore va lanciata dopo il combattimento: tieni il mana per lei.
    if (!second && betterInMain2(me.hand[best], opp, tm.landPlayed)) break;

    const spell = me.hand.splice(best, 1)[0];
    manaLeft -= spell.cmc;

    // Prospero: si attiva al lancio, anche se poi la magia viene neutralizzata.
    if (!spell.isCreature) {
      const pumped = me.creatures.filter((c) => c.p.prowess);
      for (const c of pumped) c.pump += 1;
      if (pumped.length > 0)
        say(
          log,
          `${me.name}: prospero +1/+1 a ${pumped.map((c) => c.p.name).join(", ")}`,
        );
    }

    // L'avversario può neutralizzare?
    if (
      worthCountering(spell) &&
      tryOppCounter(opp, oppMana.src, oppManaLeft, spell)
    ) {
      oppManaLeft -= counterCost(opp);
      say(log, `${me.name} prova ${spell.name}, ${opp.name} la neutralizza`, [
        spell.name,
      ]);
      continue;
    }

    resolve(spell, me, opp, myColors, log);
  }
  tm.left = manaLeft;
  tm.oppLeft = oppManaLeft;
  me.manaLeft = manaLeft;
  me.srcLeft = src;
}

// Una propria creatura entra: si attivano i trigger "ogni volta che una
// creatura che controlli entra" dei permanenti già in campo.
function allyEnters(me: Player, opp: Player, entering: Profile, log: Log) {
  const sources = [...me.statics, ...me.creatures.map((c) => c.p)];
  for (const src of sources) {
    if (src.onAllyEnterGain > 0) {
      me.life += src.onAllyEnterGain;
      say(
        log,
        `${me.name} guadagna ${src.onAllyEnterGain} vita (${src.name}: entra ${entering.name})`,
        [src.name],
      );
    }
    if (src.onAllyEnterDrain > 0) {
      opp.life -= src.onAllyEnterDrain;
      say(
        log,
        `${opp.name} perde ${src.onAllyEnterDrain} vita (${src.name}: entra ${entering.name})`,
        [src.name],
      );
    }
  }
}

// Fine del turno avversario: chi non è di turno lancia le creature con lampo
// col mana che ha lasciato stappato.
function flashStep(me: Player, opp: Player, myColors: Color[], log: Log) {
  while (true) {
    const i = me.hand.findIndex(
      (c) => c.flash && canAfford(c, me.manaLeft, me.srcLeft),
    );
    if (i === -1) return;
    const spell = me.hand.splice(i, 1)[0];
    me.manaLeft -= spell.cmc;
    say(log, `Fine turno di ${opp.name}: ${me.name} usa il lampo`);
    resolve(spell, me, opp, myColors, log);
  }
}

// Le creature pronte ad attaccare questo turno (non appena lanciate).
function readyAttackers(me: Player): Creature[] {
  return me.creatures.filter((c) => !c.sick && !c.tapped);
}

// Un mazzo prospero tiene le magie non creatura finché non ha una creatura con
// prospero che può attaccare, così le usa per potenziarla. Eccezioni: burn
// letale o che uccide una creatura che conta, rimozioni, ramp, mano piena.
function holdForProwess(c: Profile, me: Player, opp: Player): boolean {
  if (c.pump > 0) return readyAttackers(me).length === 0; // serve qualcuno da potenziare
  if (
    !me.prowessDeck ||
    c.isCreature ||
    c.manaAbility ||
    c.removal ||
    c.boardwipe
  )
    return false;
  if (c.burn > 0 && (opp.life <= c.burn || bestBurnTarget(opp, c.burn) >= 0))
    return false;
  if (me.hand.length >= 7) return false;
  return !readyAttackers(me).some((x) => x.p.prowess);
}

function playLand(me: Player, log: Log): boolean {
  const current = new Set<Color>();
  for (const l of me.lands) for (const c of l.colors) current.add(c);
  const needed = new Set<Color>();
  for (const c of me.hand)
    if (!c.isLand)
      for (const col of COLORS) if ((c.pips[col] ?? 0) > 0) needed.add(col);

  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < me.hand.length; i++) {
    const c = me.hand[i];
    if (!c.isLand) continue;
    let add = 0;
    for (const col of c.producedMana)
      if (!current.has(col) && needed.has(col)) add++;
    const score = add * 3 + (c.entersTapped ? 0 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0) {
    const land = me.hand.splice(best, 1)[0];
    me.lands.push({
      colors: land.producedMana,
      enteredTapped: land.entersTapped,
      enteredThisTurn: true,
    });
    say(
      log,
      `${me.name} gioca ${land.name}${land.entersTapped ? " (tappata)" : ""}`,
      [land.name],
    );
    return true;
  }
  return false;
}

// Punteggio euristico di priorità per lanciare una magia.
function spellScore(c: Profile, me: Player, opp: Player): number {
  if (c.manaAbility) return 95 - me.lands.length; // ramp presto
  if (c.burn > 0 && opp.life <= c.burn) return 1000; // burn letale
  if (c.boardwipe) {
    return opp.creatures.length >= 3 &&
      opp.creatures.length > me.creatures.length
      ? 90
      : 0;
  }
  if (c.removal) return opp.creatures.length > 0 ? 70 + biggest(opp) : 0;
  if (c.isCreature) return 40 + c.power + c.toughness;
  if (c.burn > 0) return 20 + c.burn;
  if (c.drain > 0) return 22 + c.drain;
  if (c.handAttack && !c.isCreature)
    return opp.hand.some((x) => !x.isLand) ? 45 : 0;
  if (!c.isSpell && (c.onAllyEnterGain > 0 || c.onAllyEnterDrain > 0))
    // prima delle creature, così i loro ingressi la attivano
    return me.hand.some((x) => x.isCreature) ? 60 : 20;
  if (!c.isSpell && c.phaseTrig.length > 0) return 30; // es. Phyrexian Arena
  if (c.lifegain > 0) return me.life < 10 ? 35 : 6;
  if (c.draw > 0) return 15;
  if (c.pump > 0) return 12;
  return 5;
}

function biggest(p: Player): number {
  let m = 0;
  for (const c of p.creatures) m = Math.max(m, pw(c) + tg(c));
  return m;
}

// Miglior creatura avversaria uccidibile con `dmg` danni (costituzione <= dmg),
// scegliendo quella con più forza; -1 se nessuna vale la pena (forza < 2).
function bestBurnTarget(opp: Player, dmg: number): number {
  let bi = -1;
  let bestPow = 1;
  for (let i = 0; i < opp.creatures.length; i++) {
    const c = opp.creatures[i];
    if (tg(c) - c.damage <= dmg && pw(c) > bestPow) {
      bestPow = pw(c);
      bi = i;
    }
  }
  return bi;
}

function worthCountering(spell: Profile): boolean {
  return (
    spell.isCreature ||
    spell.boardwipe ||
    spell.removal ||
    spell.draw >= 2 ||
    spell.cmc >= 4
  );
}
function counterCost(opp: Player): number {
  const c = opp.hand.find((x) => x.counter);
  return c ? c.cmc : 2;
}
function tryOppCounter(
  opp: Player,
  src: Record<Color, number>,
  manaLeft: number,
  _spell: Profile,
): boolean {
  const idx = opp.hand.findIndex(
    (x) => x.counter && canAfford(x, manaLeft, src),
  );
  if (idx === -1) return false;
  opp.hand.splice(idx, 1);
  return true;
}

function resolve(
  spell: Profile,
  me: Player,
  opp: Player,
  myColors: Color[],
  log: Log,
) {
  // Effetti di mana (ramp).
  if (spell.manaAbility?.kind === "permanent") {
    me.manaPerms.push({
      colors: spell.manaAbility.colors,
      amount: spell.manaAbility.amount,
      sick: spell.manaAbility.isCreature,
    });
    say(log, `${me.name} lancia ${spell.name} (mana)`, [spell.name]);
    return;
  }
  if (spell.manaAbility?.kind === "fetch") {
    for (let k = 0; k < spell.manaAbility.amount; k++)
      me.lands.push({
        colors: myColors,
        enteredTapped: true,
        enteredThisTurn: true,
      });
    say(
      log,
      `${me.name} lancia ${spell.name} (+${spell.manaAbility.amount} terra)`,
      [spell.name],
    );
    return;
  }

  if (spell.boardwipe) {
    const n = me.creatures.length + opp.creatures.length;
    me.creatures = [];
    opp.creatures = [];
    say(
      log,
      `${me.name} lancia ${spell.name}: spazzavia (${n} creature distrutte)`,
      [spell.name],
    );
    return;
  }
  if (spell.removal && opp.creatures.length > 0) {
    // uccidi la miglior creatura avversaria
    let bi = 0;
    for (let i = 1; i < opp.creatures.length; i++)
      if (
        opp.creatures[i].p.power + opp.creatures[i].p.toughness >
        opp.creatures[bi].p.power + opp.creatures[bi].p.toughness
      )
        bi = i;
    const dead = opp.creatures.splice(bi, 1)[0];
    say(log, `${me.name} lancia ${spell.name}: rimuove ${dead.p.name}`, [
      spell.name,
      dead.p.name,
    ]);
    return;
  }
  if (spell.burn > 0) {
    // Il burn può uccidere una creatura avversaria invece di andare in faccia,
    // se non è già letale e c'è un bersaglio che vale la pena.
    const ti = bestBurnTarget(opp, spell.burn);
    if (opp.life > spell.burn && ti >= 0) {
      const dead = opp.creatures.splice(ti, 1)[0];
      say(
        log,
        `${me.name} lancia ${spell.name}: ${spell.burn} danni uccidono ${dead.p.name}`,
        [spell.name, dead.p.name],
      );
    } else {
      opp.life -= spell.burn;
      say(
        log,
        `${me.name} lancia ${spell.name}: ${spell.burn} danni (${opp.name} a ${opp.life})`,
        [spell.name],
      );
    }
  }
  if (spell.isCreature) {
    allyEnters(me, opp, spell, log);
    me.creatures.push({
      p: spell,
      sick: !spell.haste,
      tapped: false,
      damage: 0,
      pump: 0,
    });
    say(
      log,
      `${me.name} lancia ${spell.name} (${spell.power}/${spell.toughness})`,
      [spell.name],
    );
  }
  if (spell.pump > 0) {
    const ready = readyAttackers(me);
    const t = ready.sort((a, b) => pw(b) - pw(a))[0];
    if (t) {
      t.pump += spell.pump;
      say(
        log,
        `${me.name} lancia ${spell.name}: +${spell.pump} a ${t.p.name}`,
        [spell.name, t.p.name],
      );
    }
  }
  if (spell.draw > 0) {
    for (let k = 0; k < spell.draw; k++) draw(me);
    say(log, `${me.name} pesca ${spell.draw} con ${spell.name}`, [spell.name]);
  }
  if (spell.handAttack) {
    let bi = -1;
    for (let i = 0; i < opp.hand.length; i++)
      if (
        !opp.hand[i].isLand &&
        (bi === -1 || opp.hand[i].cmc > opp.hand[bi].cmc)
      )
        bi = i;
    if (bi >= 0) {
      const lost = opp.hand.splice(bi, 1)[0];
      say(log, `${spell.name}: ${opp.name} perde ${lost.name} dalla mano`, [
        spell.name,
        lost.name,
      ]);
      if (spell.handAttackDraw && draw(opp))
        say(log, `${opp.name} pesca una carta (${spell.name})`);
    }
  }
  if (spell.drain > 0) {
    opp.life -= spell.drain;
    say(
      log,
      `${opp.name} perde ${spell.drain} vita (${spell.name}, vita ${opp.life})`,
      [spell.name],
    );
  }
  if (
    !spell.isCreature &&
    !spell.isSpell &&
    (spell.onAllyEnterGain > 0 ||
      spell.onAllyEnterDrain > 0 ||
      spell.phaseTrig.length > 0)
  ) {
    me.statics.push(spell);
    say(log, `${me.name} lancia ${spell.name}`, [spell.name]);
  }
  if (spell.lifegain > 0) {
    me.life += spell.lifegain;
    say(log, `${me.name} guadagna ${spell.lifegain} vita (${spell.name})`, [
      spell.name,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Combattimento
// ---------------------------------------------------------------------------
// Decide se una creatura debba attaccare, evitando attacchi suicidi.
// Può `b` bloccare `a`? (volare: solo creature con volare o raggiungere)
const canBlock = (b: Creature, a: Creature) =>
  !a.p.flying || b.p.flying || b.p.reach;
// `x` uccide `y` in combattimento? (tocco letale: basta 1 danno)
const kills = (x: Creature, y: Creature) =>
  pw(x) > 0 && (x.p.deathtouch || pw(x) >= tg(y) - y.damage);

function shouldAttack(
  a: Creature,
  blockers: Creature[],
  def: Player,
  teamCount: number,
  teamPower: number,
): boolean {
  if (blockers.length === 0) return true; // nessun bloccante
  if (def.life <= teamPower) return true; // spinta per la vittoria / corsa
  // un bloccante uccide A e sopravvive? allora è un attacco svantaggioso
  const able = blockers.filter((b) => canBlock(b, a));
  if (able.length === 0) return true; // nessuno può bloccarla (es. volare)
  const badBlock = able.some((b) => kills(b, a) && !kills(a, b));
  if (!badBlock) return true; // attacco sicuro
  // rischioso: attacca solo se possiamo sommergere i bloccanti (più attaccanti)
  return teamCount > blockers.length;
}

function combat(att: Player, def: Player, log: Log) {
  const potential = att.creatures.filter((c) => !c.sick && !c.tapped);
  if (potential.length === 0) {
    if (att.creatures.length > 0)
      detail(log, `${att.name} non ha creature pronte ad attaccare`);
    return;
  }
  const blockers = def.creatures.filter((c) => !c.tapped);
  const teamPower = potential.reduce((s, c) => s + pw(c), 0);
  const attackers = potential.filter((a) =>
    shouldAttack(a, blockers, def, potential.length, teamPower),
  );
  if (attackers.length === 0) {
    detail(
      log,
      `${att.name} non attacca: i bloccanti avversari sono troppo forti`,
    );
    return;
  }
  for (const a of attackers) if (!a.p.vigilance) a.tapped = true;
  const usedBlocker = new Set<Creature>();
  const blockOf = new Map<Creature, Creature>();

  const sorted = [...attackers].sort((a, b) => pw(b) - pw(a));

  // 1) blocchi favorevoli: uccidi l'attaccante e sopravvivi
  for (const a of sorted) {
    const b = blockers.find(
      (x) =>
        !usedBlocker.has(x) && canBlock(x, a) && kills(x, a) && !kills(a, x),
    );
    if (b) {
      usedBlocker.add(b);
      blockOf.set(a, b);
    }
  }
  // 2) chump se il danno non bloccato è letale
  let unblocked = sorted.filter((a) => !blockOf.has(a));
  let dmg = unblocked.reduce((s, a) => s + pw(a), 0);
  if (dmg >= def.life) {
    const avail = blockers
      .filter((b) => !usedBlocker.has(b))
      .sort((a, b) => pw(a) + tg(a) - (pw(b) + tg(b)));
    const bigFirst = [...unblocked].sort((a, b) => pw(b) - pw(a));
    for (const a of bigFirst) {
      if (dmg < def.life) break;
      const bi = avail.findIndex((x) => canBlock(x, a));
      if (bi === -1) continue;
      const b = avail.splice(bi, 1)[0];
      usedBlocker.add(b);
      blockOf.set(a, b);
      dmg -= pw(a);
    }
  }

  // risoluzione danni
  let faceDamage = 0;
  const dead: Creature[] = [];
  let attLink = 0;
  let defLink = 0;
  for (const a of attackers) {
    const b = blockOf.get(a);
    if (b) {
      if (kills(a, b)) dead.push(b);
      if (kills(b, a)) dead.push(a);
      b.damage += pw(a);
      a.damage += pw(b);
      if (a.p.lifelink) attLink += pw(a);
      if (b.p.lifelink) defLink += pw(b);
    } else {
      faceDamage += pw(a);
      if (a.p.lifelink) attLink += pw(a);
    }
  }
  if (faceDamage > 0) def.life -= faceDamage;
  att.life += attLink;
  def.life += defLink;
  att.creatures = att.creatures.filter((c) => !dead.includes(c));
  def.creatures = def.creatures.filter((c) => !dead.includes(c));
  if (log.on) {
    const names = attackers.map((a) => `${a.p.name} ${pw(a)}/${tg(a)}`);
    say(
      log,
      `${att.name} attacca con ${names.join(", ")}`,
      attackers.map((a) => a.p.name),
    );
    for (const [a, b] of blockOf) {
      const res = [
        dead.includes(a) ? `muore ${a.p.name}` : "",
        dead.includes(b) ? `muore ${b.p.name}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      say(
        log,
        `${def.name} blocca ${a.p.name} con ${b.p.name}${res ? `: ${res}` : ""}`,
        [b.p.name],
      );
    }
    if (faceDamage > 0)
      say(log, `${faceDamage} danni a ${def.name} (vita ${def.life})`);
    if (attLink > 0)
      say(
        log,
        `${att.name} guadagna ${attLink} vita (legame vitale, vita ${att.life})`,
      );
    if (defLink > 0)
      say(
        log,
        `${def.name} guadagna ${defLink} vita (legame vitale, vita ${def.life})`,
      );
  }
}

// ---------------------------------------------------------------------------
// Una partita. Ritorna 'A' | 'B' | 'draw' + vita finale + turni.
// ---------------------------------------------------------------------------
function playMatch(
  deckA: Profile[],
  deckB: Profile[],
  colorsA: Color[],
  colorsB: Color[],
  cfg: BattleConfig,
  rng: () => number,
  log: Log,
): {
  winner: "A" | "B" | "draw";
  lifeA: number;
  lifeB: number;
  turns: number;
  startA: boolean;
} {
  const A = newPlayer(TOKEN_A, deckA, cfg, rng);
  const B = newPlayer(TOKEN_B, deckB, cfg, rng);
  const startA = rng() < 0.5;
  say(
    log,
    `${startA ? TOKEN_A : TOKEN_B} inizia (on the play), ${startA ? TOKEN_B : TOKEN_A} pesca. Vita ${cfg.startLife} a testa.`,
    undefined,
    true,
  );
  if (log.on)
    for (const p of startA ? [A, B] : [B, A]) {
      const names = p.hand.map((c) => c.name);
      const mull = p.mulls > 0 ? ` (mulligan a ${p.hand.length})` : "";
      say(log, `Mano iniziale di ${p.name}${mull}: ${names.join(", ")}`, names);
    }

  let turn = 0;
  let activeIsA = startA;
  while (turn < cfg.maxTurns * 2) {
    turn++;
    const me = activeIsA ? A : B;
    const opp = activeIsA ? B : A;
    const myColors = activeIsA ? colorsA : colorsB;
    const turnNo = Math.ceil(turn / 2);

    // Qualcuno è a 0 vita (o meno): la partita finisce subito.
    const over = () => {
      if (A.life > 0 && B.life > 0) return null;
      endPhase(log);
      const winner: "A" | "B" | "draw" =
        A.life <= 0 && B.life <= 0 ? "draw" : A.life <= 0 ? "B" : "A";
      say(
        log,
        winner === "draw"
          ? `Entrambi a 0 vita: pareggio al turno ${turnNo}.`
          : `${winner === "A" ? A.name : B.name} vince al turno ${turnNo}.`,
        undefined,
        true,
      );
      return { winner, lifeA: A.life, lifeB: B.life, turns: turnNo, startA };
    };

    endPhase(log);
    say(
      log,
      `Turno ${turnNo} · ${me.name} (vita ${me.life}, avversario ${opp.life})`,
      undefined,
      true,
    );

    // Stappo
    enterPhase(log, "untap");
    for (const l of me.lands) l.enteredThisTurn = false;
    for (const mp of me.manaPerms) mp.sick = false;
    for (const c of me.creatures) {
      c.sick = false;
      c.tapped = false;
    }
    if (log.on && me.lands.length + me.creatures.length > 0)
      detail(
        log,
        `${me.name} stappa ${me.lands.length} ${me.lands.length === 1 ? "terra" : "terre"}${me.creatures.length ? ` e ${me.creatures.length} ${me.creatures.length === 1 ? "creatura" : "creature"}` : ""}`,
      );

    // Mantenimento
    enterPhase(log, "upkeep");
    phaseTriggers("upkeep", me, opp, log);
    let end = over();
    if (end) return end;

    // Pescata (salta la primissima di chi inizia)
    enterPhase(log, "draw");
    const isFirstEver = turn === 1 && startA === activeIsA;
    if (isFirstEver)
      detail(log, `${me.name} inizia: niente pescata al primo turno`);
    else {
      if (!draw(me)) {
        say(
          log,
          `${me.name} non può pescare: perde per deck out.`,
          undefined,
          true,
        );
        endPhase(log);
        return {
          winner: activeIsA ? "B" : "A",
          lifeA: A.life,
          lifeB: B.life,
          turns: turnNo,
          startA,
        };
      }
      say(log, `${me.name} pesca ${me.hand[me.hand.length - 1].name}`, [
        me.hand[me.hand.length - 1].name,
      ]);
    }
    phaseTriggers("draw", me, opp, log);
    if ((end = over())) return end;

    // Prima fase principale, combattimento, seconda fase principale
    enterPhase(log, "main1");
    const tm = startTurnMana(me, opp, log);
    mainPhase(me, opp, myColors, log, tm, false);
    if ((end = over())) return end;
    enterPhase(log, "combat");
    combat(me, opp, log);
    if ((end = over())) return end;
    enterPhase(log, "main2");
    mainPhase(me, opp, myColors, log, tm, true);
    if ((end = over())) return end;

    // Sottofase finale: trigger, lampo dell'avversario, poi finiscono i
    // bonus "fino a fine turno" e i danni sulle creature.
    enterPhase(log, "end");
    phaseTriggers("end", me, opp, log);
    if ((end = over())) return end;
    flashStep(opp, me, activeIsA ? colorsB : colorsA, log);
    const all = [...me.creatures, ...opp.creatures];
    if (all.some((c) => c.pump > 0))
      detail(log, "Finiscono i bonus fino a fine turno");
    for (const c of all) {
      c.pump = 0;
      c.damage = 0;
    }
    if (me.hand.length > 7) {
      const n = me.hand.length - 7;
      // Scarta prima le terre in eccesso e le magie più costose.
      for (let k = 0; k < n; k++) {
        const lands = countLands(me.hand);
        let wi = 0;
        for (let i = 1; i < me.hand.length; i++)
          if (bottomScore(me.hand[i], lands) < bottomScore(me.hand[wi], lands))
            wi = i;
        me.hand.splice(wi, 1);
      }
      say(log, `${me.name} scarta ${n} carte (massimo 7 in mano)`);
    }
    activeIsA = !activeIsA;
  }
  endPhase(log);

  // Turni esauriti: decide la vita.
  const winner = A.life > B.life ? "A" : B.life > A.life ? "B" : "draw";
  say(
    log,
    winner === "draw"
      ? `Limite turni: pareggio (${TOKEN_A} ${A.life}, ${TOKEN_B} ${B.life}).`
      : `Limite turni: vince ${winner === "A" ? TOKEN_A : TOKEN_B} ai punti (${TOKEN_A} ${A.life}, ${TOKEN_B} ${B.life}).`,
    undefined,
    true,
  );
  return { winner, lifeA: A.life, lifeB: B.life, turns: cfg.maxTurns, startA };
}

// ---------------------------------------------------------------------------
// Esecuzione di molte partite.
// ---------------------------------------------------------------------------
export function runBattle(
  deckA: CardInfo[],
  deckB: CardInfo[],
  cfg: BattleConfig,
  onProgress?: (p: number) => void,
): BattleResult {
  const rng = mulberry32(cfg.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const profA = deckA.map(profileOf);
  const profB = deckB.map(profileOf);
  const colorsA = deckColors(profA);
  const colorsB = deckColors(profB);

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let turnsSum = 0;
  let lifeASum = 0;
  let lifeBSum = 0;
  const samples: BattleScenario[] = [];
  const LOGGED = 400;
  let aPlayWins = 0,
    aPlayGames = 0,
    aDrawWins = 0,
    aDrawGames = 0;

  const every = Math.max(1, Math.floor(cfg.games / 40));

  for (let g = 0; g < cfg.games; g++) {
    // Registra il log delle prime partite: tra queste si scelgono gli esempi.
    const tryLog = g < LOGGED;
    const log: Log = { on: tryLog, lines: [] };
    const r = playMatch(profA, profB, colorsA, colorsB, cfg, rng, log);
    if (r.winner === "A") winsA++;
    else if (r.winner === "B") winsB++;
    else draws++;
    turnsSum += r.turns;
    lifeASum += r.lifeA;
    lifeBSum += r.lifeB;
    if (r.winner !== "draw") {
      if (r.startA) {
        aPlayGames++;
        if (r.winner === "A") aPlayWins++;
      } else {
        aDrawGames++;
        if (r.winner === "A") aDrawWins++;
      }
    }
    if (tryLog)
      samples.push({
        winner: r.winner,
        onPlay: r.startA ? "A" : "B",
        turns: r.turns,
        lines: log.lines,
      });
    if (onProgress && g % every === 0) onProgress(g / cfg.games);
  }
  if (onProgress) onProgress(1);

  const decided = winsA + winsB;
  const winRateA = decided > 0 ? winsA / decided : 0.5;
  const scenarios = pickScenarios(samples, winRateA, cfg.maxTurns);
  return {
    games: cfg.games,
    winsA,
    winsB,
    draws,
    winRateA,
    avgTurns: turnsSum / cfg.games,
    avgLifeA: lifeASum / cfg.games,
    avgLifeB: lifeBSum / cfg.games,
    sampleLog: scenarios[0]?.lines ?? [],
    scenarios,
    play: { aPlayWins, aPlayGames, aDrawWins, aDrawGames },
  };
}

// Sceglie 3 partite "medie": tante vinte da A quanto dice la win-rate (60% → 2
// su 3), alternando chi inizia, con durata vicina alla media delle vittorie di
// quel mazzo.
function pickScenarios(
  samples: BattleScenario[],
  winRateA: number,
  maxTurns: number,
): BattleScenario[] {
  const decisive = samples.filter(
    (s) => s.winner !== "draw" && s.turns < maxTurns,
  );
  const pool = decisive.length > 0 ? decisive : samples;
  let nA = Math.round(winRateA * 3);
  if (!pool.some((s) => s.winner === "A")) nA = 0;
  if (!pool.some((s) => s.winner === "B")) nA = 3;
  const plan: ("A" | "B")[] = [];
  const first: "A" | "B" = nA >= 2 ? "A" : "B";
  const second: "A" | "B" = first === "A" ? "B" : "A";
  const nFirst = first === "A" ? nA : 3 - nA;
  for (let i = 0; i < nFirst; i++) plan.push(first);
  for (let i = nFirst; i < 3; i++) plan.push(second);

  const used = new Set<BattleScenario>();
  const out: BattleScenario[] = [];
  const countFor: Record<string, number> = {};
  for (const w of plan) {
    const k = countFor[w] ?? 0;
    countFor[w] = k + 1;
    const wins = pool.filter((s) => s.winner === w);
    const list = wins.length > 0 ? wins : pool;
    const avg =
      list.reduce((t, s) => t + s.turns, 0) / Math.max(1, list.length);
    // Prima partita: il vincitore inizia; seconda: pesca; e così via.
    const wantPlay: "A" | "B" = k % 2 === 0 ? w : w === "A" ? "B" : "A";
    const pick = (arr: BattleScenario[]) =>
      arr
        .filter((s) => !used.has(s))
        .sort((x, y) => Math.abs(x.turns - avg) - Math.abs(y.turns - avg))[0];
    const s =
      pick(list.filter((x) => x.onPlay === wantPlay)) ??
      pick(list) ??
      pick(samples);
    if (!s) break;
    used.add(s);
    out.push(s);
  }
  return out;
}
