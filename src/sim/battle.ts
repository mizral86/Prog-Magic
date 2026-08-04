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
//
// SEMPLIFICAZIONI: niente testo specifico delle carte, niente abilità
// attivate/trigger complessi, planeswalker approssimati a creature (costituzione
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
}

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
}

function wordNum(w: string): number {
  const map: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  };
  return map[w] ?? (parseInt(w, 10) || 0);
}

function profileOf(card: CardInfo): Profile {
  const text = (card.oracleText || "").toLowerCase();
  const roles = rolesOf(card);
  const isCreature = card.categories.includes("creature");
  const isPlaneswalker = card.categories.includes("planeswalker");

  const burnM = text.match(
    /deals? (\d+) damage to (any target|target player|target opponent|each opponent|target creature or player|target planeswalker or player)/,
  );
  const burn = burnM ? parseInt(burnM[1], 10) : 0;

  let draw = 0;
  if (!/target (player|opponent) draws/.test(text)) {
    const dM = text.match(/draws? (\d+|a|two|three|four) cards?/);
    if (dM) draw = Math.min(4, wordNum(dM[1]));
  }
  const lgM = text.match(/gains? (\d+) life/);
  const lifegain = lgM ? parseInt(lgM[1], 10) : 0;

  // Planeswalker approssimato: forza 3, costituzione = lealtà (o 4).
  const power = isPlaneswalker ? 3 : card.power ?? 0;
  const toughness = isPlaneswalker ? card.loyalty ?? 4 : card.toughness ?? 0;

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
}
interface Player {
  name: string;
  library: Profile[];
  top: number;
  hand: Profile[];
  lands: Land[];
  manaPerms: ManaPerm[];
  creatures: Creature[];
  life: number;
}

function countLands(hand: Profile[]): number {
  let n = 0;
  for (const c of hand) if (c.isLand) n++;
  return n;
}

function mulliganHand(deck: Profile[], cfg: BattleConfig, rng: () => number): { hand: Profile[]; library: Profile[] } {
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
  return { hand, library };
}
function bottomScore(c: Profile, lands: number): number {
  if (c.isLand) return lands > 3 ? 0 : 100;
  return 50 - c.cmc;
}

function newPlayer(name: string, deck: Profile[], cfg: BattleConfig, rng: () => number): Player {
  const { hand, library } = mulliganHand(deck, cfg, rng);
  return {
    name,
    library,
    top: 0,
    hand,
    lands: [],
    manaPerms: [],
    creatures: [],
    life: cfg.startLife,
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

function canAfford(p: Profile, manaLeft: number, src: Record<Color, number>): boolean {
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
type Log = { on: boolean; lines: BattleLogLine[] };
function say(log: Log, text: string, cards?: string[], head?: boolean) {
  if (log.on) log.lines.push({ text, cards, head });
}

// ---------------------------------------------------------------------------
// Fase principale: gioca terra + lancia magie (con counter reattivi avversari).
// ---------------------------------------------------------------------------
function mainPhase(me: Player, opp: Player, myColors: Color[], log: Log) {
  // Gioca una terra (preferisci una che aggiunge un colore mancante, untapped).
  playLand(me);

  const { total, src } = mana(me);
  let manaLeft = total;
  const oppMana = mana(opp); // per i counter reattivi
  let oppManaLeft = oppMana.total;

  while (true) {
    // scegli la magia migliore lanciabile
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < me.hand.length; i++) {
      const c = me.hand[i];
      if (c.isLand || c.counter) continue; // i counter si tengono
      if (!canAfford(c, manaLeft, src)) continue;
      const s = spellScore(c, me, opp);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best === -1) break;

    const spell = me.hand.splice(best, 1)[0];
    manaLeft -= spell.cmc;

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
}

function playLand(me: Player) {
  const current = new Set<Color>();
  for (const l of me.lands) for (const c of l.colors) current.add(c);
  const needed = new Set<Color>();
  for (const c of me.hand)
    if (!c.isLand) for (const col of COLORS) if ((c.pips[col] ?? 0) > 0) needed.add(col);

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
  }
}

// Punteggio euristico di priorità per lanciare una magia.
function spellScore(c: Profile, me: Player, opp: Player): number {
  if (c.manaAbility) return 95 - me.lands.length; // ramp presto
  if (c.burn > 0 && opp.life <= c.burn) return 1000; // burn letale
  if (c.boardwipe) {
    return opp.creatures.length >= 3 && opp.creatures.length > me.creatures.length
      ? 90
      : 0;
  }
  if (c.removal) return opp.creatures.length > 0 ? 70 + biggest(opp) : 0;
  if (c.isCreature) return 40 + c.power + c.toughness;
  if (c.burn > 0) return 20 + c.burn;
  if (c.lifegain > 0) return me.life < 10 ? 35 : 6;
  if (c.draw > 0) return 15;
  return 5;
}

function biggest(p: Player): number {
  let m = 0;
  for (const c of p.creatures) m = Math.max(m, c.p.power + c.p.toughness);
  return m;
}

// Miglior creatura avversaria uccidibile con `dmg` danni (costituzione <= dmg),
// scegliendo quella con più forza; -1 se nessuna vale la pena (forza < 2).
function bestBurnTarget(opp: Player, dmg: number): number {
  let bi = -1;
  let bestPow = 1;
  for (let i = 0; i < opp.creatures.length; i++) {
    const c = opp.creatures[i];
    if (c.p.toughness <= dmg && c.p.power > bestPow) {
      bestPow = c.p.power;
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
  const idx = opp.hand.findIndex((x) => x.counter && canAfford(x, manaLeft, src));
  if (idx === -1) return false;
  opp.hand.splice(idx, 1);
  return true;
}

function resolve(spell: Profile, me: Player, opp: Player, myColors: Color[], log: Log) {
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
      me.lands.push({ colors: myColors, enteredTapped: true, enteredThisTurn: true });
    say(log, `${me.name} lancia ${spell.name} (+${spell.manaAbility.amount} terra)`, [
      spell.name,
    ]);
    return;
  }

  if (spell.boardwipe) {
    const n = me.creatures.length + opp.creatures.length;
    me.creatures = [];
    opp.creatures = [];
    say(log, `${me.name} lancia ${spell.name}: spazzavia (${n} creature distrutte)`, [
      spell.name,
    ]);
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
    me.creatures.push({ p: spell, sick: true, tapped: false, damage: 0 });
    say(log, `${me.name} lancia ${spell.name} (${spell.power}/${spell.toughness})`, [
      spell.name,
    ]);
  }
  if (spell.draw > 0) {
    for (let k = 0; k < spell.draw; k++) draw(me);
    say(log, `${me.name} pesca ${spell.draw} con ${spell.name}`, [spell.name]);
  }
  if (spell.lifegain > 0) {
    me.life += spell.lifegain;
    say(log, `${me.name} guadagna ${spell.lifegain} vita (${spell.name})`, [spell.name]);
  }
}

// ---------------------------------------------------------------------------
// Combattimento
// ---------------------------------------------------------------------------
// Decide se una creatura debba attaccare, evitando attacchi suicidi.
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
  const badBlock = blockers.some(
    (b) => b.p.power >= a.p.toughness && b.p.toughness > a.p.power,
  );
  if (!badBlock) return true; // attacco sicuro
  // rischioso: attacca solo se possiamo sommergere i bloccanti (più attaccanti)
  return teamCount > blockers.length;
}

function combat(att: Player, def: Player, log: Log) {
  const potential = att.creatures.filter((c) => !c.sick && !c.tapped);
  if (potential.length === 0) return;
  const blockers = def.creatures.filter((c) => !c.tapped);
  const teamPower = potential.reduce((s, c) => s + c.p.power, 0);
  const attackers = potential.filter((a) =>
    shouldAttack(a, blockers, def, potential.length, teamPower),
  );
  if (attackers.length === 0) return;
  for (const a of attackers) a.tapped = true;
  const usedBlocker = new Set<Creature>();
  const blockOf = new Map<Creature, Creature>();

  const sorted = [...attackers].sort((a, b) => b.p.power - a.p.power);

  // 1) blocchi favorevoli: uccidi l'attaccante e sopravvivi
  for (const a of sorted) {
    const b = blockers.find(
      (x) =>
        !usedBlocker.has(x) &&
        x.p.power >= a.p.toughness &&
        x.p.toughness > a.p.power,
    );
    if (b) {
      usedBlocker.add(b);
      blockOf.set(a, b);
    }
  }
  // 2) chump se il danno non bloccato è letale
  let unblocked = sorted.filter((a) => !blockOf.has(a));
  let dmg = unblocked.reduce((s, a) => s + a.p.power, 0);
  if (dmg >= def.life) {
    const avail = blockers
      .filter((b) => !usedBlocker.has(b))
      .sort((a, b) => a.p.power + a.p.toughness - (b.p.power + b.p.toughness));
    const bigFirst = [...unblocked].sort((a, b) => b.p.power - a.p.power);
    for (const a of bigFirst) {
      if (dmg < def.life) break;
      const b = avail.shift();
      if (!b) break;
      usedBlocker.add(b);
      blockOf.set(a, b);
      dmg -= a.p.power;
    }
  }

  // risoluzione danni
  let faceDamage = 0;
  const dead: Creature[] = [];
  for (const a of attackers) {
    const b = blockOf.get(a);
    if (b) {
      b.damage += a.p.power;
      a.damage += b.p.power;
      if (b.damage >= b.p.toughness) dead.push(b);
      if (a.damage >= a.p.toughness) dead.push(a);
    } else {
      faceDamage += a.p.power;
    }
  }
  if (faceDamage > 0) def.life -= faceDamage;
  att.creatures = att.creatures.filter((c) => !dead.includes(c));
  def.creatures = def.creatures.filter((c) => !dead.includes(c));
  if (faceDamage > 0)
    say(log, `${att.name} attacca per ${faceDamage} (${def.name} a ${def.life})`);
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
): { winner: "A" | "B" | "draw"; lifeA: number; lifeB: number; turns: number } {
  const A = newPlayer("A", deckA, cfg, rng);
  const B = newPlayer("B", deckB, cfg, rng);
  const startA = rng() < 0.5;
  say(log, `Inizia ${startA ? "A" : "B"}. Vita ${cfg.startLife}-${cfg.startLife}.`, undefined, true);

  let turn = 0;
  let activeIsA = startA;
  while (turn < cfg.maxTurns * 2) {
    turn++;
    const me = activeIsA ? A : B;
    const opp = activeIsA ? B : A;
    const myColors = activeIsA ? colorsA : colorsB;
    const turnNo = Math.ceil(turn / 2);

    // Untap
    for (const l of me.lands) l.enteredThisTurn = false;
    for (const mp of me.manaPerms) mp.sick = false;
    for (const c of me.creatures) {
      c.sick = false;
      c.tapped = false;
      c.damage = 0;
    }

    // Pesca (salta la primissima mossa di chi inizia)
    const isFirstEver = turn === 1 && startA === activeIsA;
    if (!isFirstEver) {
      if (!draw(me)) {
        say(log, `${me.name} non può pescare: perde per deck out.`, undefined, true);
        return {
          winner: activeIsA ? "B" : "A",
          lifeA: A.life,
          lifeB: B.life,
          turns: turnNo,
        };
      }
    }

    say(log, `T${turnNo} ${me.name} (vita ${me.life}/${opp.life}):`, undefined, true);
    mainPhase(me, opp, myColors, log);
    combat(me, opp, log);

    if (opp.life <= 0) {
      say(log, `${me.name} vince al turno ${turnNo}.`, undefined, true);
      return {
        winner: activeIsA ? "A" : "B",
        lifeA: A.life,
        lifeB: B.life,
        turns: turnNo,
      };
    }
    activeIsA = !activeIsA;
  }

  // Turni esauriti: decide la vita.
  const winner = A.life > B.life ? "A" : B.life > A.life ? "B" : "draw";
  say(log, `Limite turni: vince ${winner} ai punti (A ${A.life}, B ${B.life}).`, undefined, true);
  return { winner, lifeA: A.life, lifeB: B.life, turns: cfg.maxTurns };
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
  let sampleLog: BattleLogLine[] = [];
  let haveDecisiveSample = false;

  const every = Math.max(1, Math.floor(cfg.games / 40));

  for (let g = 0; g < cfg.games; g++) {
    // Registra il log finché non troviamo una partita "decisa" da mostrare come
    // esempio (qualcuno vince prima del limite turni), entro le prime partite.
    const tryLog = !haveDecisiveSample && g < 80;
    const log: Log = { on: tryLog, lines: [] };
    const r = playMatch(profA, profB, colorsA, colorsB, cfg, rng, log);
    if (r.winner === "A") winsA++;
    else if (r.winner === "B") winsB++;
    else draws++;
    turnsSum += r.turns;
    lifeASum += r.lifeA;
    lifeBSum += r.lifeB;
    if (tryLog) {
      const decisive = r.winner !== "draw" && r.turns < cfg.maxTurns;
      if (sampleLog.length === 0 || decisive) {
        sampleLog = log.lines;
        if (decisive) haveDecisiveSample = true;
      }
    }
    if (onProgress && g % every === 0) onProgress(g / cfg.games);
  }
  if (onProgress) onProgress(1);

  const decided = winsA + winsB;
  return {
    games: cfg.games,
    winsA,
    winsB,
    draws,
    winRateA: decided > 0 ? winsA / decided : 0.5,
    avgTurns: turnsSum / cfg.games,
    avgLifeA: lifeASum / cfg.games,
    avgLifeB: lifeBSum / cfg.games,
    sampleLog,
  };
}
