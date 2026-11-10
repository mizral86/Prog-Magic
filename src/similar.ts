// "Carte simili": dal testo regole (oracle, in inglese) di una carta ricava
// cosa fa (es. "infligge danno a qualsiasi bersaglio", "distrugge una
// creatura") e cerca su Scryfall altre carte con lo stesso effetto, in tutti i
// colori, con tipo e costo vicini. Le più giocate prima (ordine EDHREC).

import { CardInfo } from "./types";
import { searchCards } from "./scryfall";

interface Effect {
  /** Riconosce l'effetto nel testo (minuscolo, nome carta sostituito da "~"). */
  re: RegExp;
  /** Frammento di query Scryfall che trova carte con lo stesso effetto. */
  q: string;
  /** Descrizione in italiano mostrata all'utente. */
  label: string;
}

// In ordine di importanza: si usano i primi effetti riconosciuti.
const EFFECTS: Effect[] = [
  // Rimozione
  { re: /destroy all creatures|destroy all (other )?nonland permanents/, q: 'o:"destroy all"', label: "distrugge tutte le creature" },
  { re: /damage to each creature/, q: 'o:"damage to each creature"', label: "danni a tutte le creature" },
  { re: /exile all creatures/, q: 'o:"exile all"', label: "esilia tutte le creature" },
  { re: /(gets|get) -\d+\/-\d+ until end of turn/, q: 'o:/gets? -[0-9X]+\\/-[0-9X]+/', label: "dà -N/-N" },
  // "exile up to one other target creature", "destroy target nonblack creature"…
  { re: /exile (up to \w+ )?(another |other )?target ([\w-]+ )?(creature|permanent)/, q: 'o:/exile (up to [a-z]+ )?(another |other )?target ([a-z-]+ )?(creature|permanent)/', label: "esilia una creatura" },
  { re: /destroy (up to \w+ )?(another |other )?target ([\w-]+ )?(creature|permanent)/, q: 'o:/destroy (up to [a-z]+ )?(another |other )?target ([a-z-]+ )?(creature|permanent)/', label: "distrugge una creatura" },
  { re: /damage to any target/, q: 'o:"damage to any target"', label: "danni a qualsiasi bersaglio" },
  { re: /damage to target (creature|planeswalker|player)/, q: 'o:/damage to (any target|target (creature|player))/', label: "danni a un bersaglio" },
  { re: /fights? (another )?target creature|deals damage equal to its power to/, q: 'o:/fights? (another )?target|damage equal to its power to/', label: "lotta / morso" },
  { re: /destroy target (artifact|enchantment)/, q: 'o:/destroy target (artifact|enchantment)/', label: "distrugge artefatti o incantesimi" },
  { re: /return target (creature|nonland permanent|permanent)[^.]* to its owner's hand/, q: "o:\"to its owner's hand\"", label: "fa tornare in mano" },
  { re: /target player sacrifices|each opponent sacrifices/, q: 'o:/(player|opponent) sacrifices/', label: "fa sacrificare" },
  // Interazione con le magie
  { re: /counter target (spell|creature spell|noncreature spell|instant|activated)/, q: 'o:"counter target"', label: "neutralizza una magia" },
  { re: /target (player|opponent) discards|each opponent discards|reveals? (their|his or her) hand/, q: 'o:/discards?|reveals (their|his or her) hand/', label: "fa scartare" },
  // Vantaggio carte e ricerca
  { re: /search your library for (a|up to \w+) basic land/, q: 'o:/search your library for (a|up to \\w+) basic land/', label: "cerca terre (ramp)" },
  { re: /\{t\}: add /, q: 'o:"{T}: Add"', label: "produce mana" },
  { re: /search your library for an? (card|creature|instant|sorcery|artifact|enchantment)/, q: 'o:/search your library for an? (card|creature|instant|sorcery|artifact|enchantment)/', label: "cerca una carta nel mazzo" },
  { re: /return target [^.]*card from your graveyard to (the battlefield|your hand)/, q: 'o:/from your graveyard to (the battlefield|your hand)/', label: "recupera dal cimitero" },
  { re: /draw (two|three|four|x) cards/, q: 'o:/draw (two|three|four|x) cards/', label: "pesca più carte" },
  { re: /look at the top \w+ cards of your library/, q: 'o:/look at the top \\w+ cards of your library/', label: "guarda le prime carte del mazzo" },
  { re: /whenever [^.]* draw a card|draw a card/, q: 'o:"draw a card"', label: "pesca una carta" },
  { re: /\bscry \d/, q: "o:scry", label: "profetizza" },
  { re: /\bmills? |into (their|your) graveyard from the top/, q: "o:mill", label: "macina" },
  // Creature e pedine
  { re: /create [^.]*token/, q: 'o:create o:token', label: "crea pedine" },
  { re: /\+1\/\+1 counter/, q: 'o:"+1/+1 counter"', label: "segnalini +1/+1" },
  { re: /creatures you control get \+\d+\/\+\d+/, q: 'o:"creatures you control get +"', label: "potenzia le tue creature" },
  { re: /target creature gets \+\d+\/\+\d+/, q: 'o:"target creature gets +"', label: "potenzia una creatura" },
  { re: /target creature (gains|gets [^.]* and gains) (flying|first strike|double strike|trample|haste|lifelink|deathtouch|hexproof|indestructible|vigilance|menace)/, q: 'o:/target creature (gains|gets [^.]* and gains) (flying|first strike|double strike|trample|haste|lifelink|deathtouch|hexproof|indestructible|vigilance|menace)/', label: "dà un'abilità a una creatura" },
  { re: /tap target (creature|permanent)|doesn't untap/, q: "o:/tap target|doesn't untap/", label: "tappa / blocca" },
  // Solo se sei TU a guadagnare: "its controller gains life" (Swords, Solitude)
  // è uno svantaggio, non lo scopo della carta.
  { re: /you gain (\d+|x) life|you gain life equal/, q: 'o:/you gain (\\d+|x) life|you gain life equal/', label: "fa guadagnare punti vita" },
  { re: /each opponent loses \d+ life|target player loses \d+ life/, q: 'o:/(opponent|player) loses (\\d+|x) life/', label: "fa perdere punti vita" },
];

// Abilità chiave delle creature considerate quando non c'è altro.
const KEYWORDS = [
  "flying", "deathtouch", "lifelink", "trample", "haste", "vigilance",
  "first strike", "double strike", "hexproof", "menace", "reach", "flash",
];

export interface SimilarResult {
  cards: CardInfo[];
  /** Cosa abbiamo cercato, in italiano (es. "danni a qualsiasi bersaglio"). */
  reasons: string[];
}

/** Trova gli effetti principali della carta (al massimo due). */
export function detectEffects(card: CardInfo): Effect[] {
  let text = (card.oracleText ?? "").toLowerCase();
  // Il nome della carta nel testo non deve contare.
  for (const n of card.name.toLowerCase().split(" // ")) {
    if (n) text = text.split(n).join("~");
  }
  const found: Effect[] = [];
  for (const e of EFFECTS) {
    if (e.re.test(text) && !found.some((f) => f.q === e.q)) found.push(e);
    if (found.length >= 2) break;
  }
  return found;
}

// Costi alternativi che permettono di giocare la carta a meno del suo costo
// (es. Solitude con evoke): in quel caso si accettano anche carte economiche.
const ALT_COST =
  /\b(evoke|foretell|suspend|prototype|disguise|blitz|dash|emerge|delve|convoke|improvise|affinity for|spectacle|surge|madness|miracle|ninjutsu)\b|rather than pay this spell's mana cost|without paying its mana cost/;

export function hasAltCost(card: CardInfo): boolean {
  return ALT_COST.test((card.oracleText ?? "").toLowerCase());
}

export async function findSimilar(card: CardInfo): Promise<SimilarResult> {
  const effects = detectEffects(card);
  const exclude = `-!"${card.name.replace(/"/g, "")}"`;
  const cmc = Math.round(card.cmc);
  const alt = hasAltCost(card);
  const minCmc = alt ? 0 : Math.max(0, cmc - 1);
  const cmcRange = `cmc>=${minCmc} cmc<=${cmc + 1}`;
  const costNote = alt
    ? `costo fino a ${cmc + 1} (ha un costo alternativo, quindi anche più basso)`
    : `costo ${minCmc}–${cmc + 1}`;
  // Conta solo cosa fa la carta, non il tipo né le statistiche: una creatura
  // che esilia entrando (Solitude) va confrontata anche con istantanei che esiliano.
  const base = [exclude, "game:paper"];

  // Tentativi dal più preciso al più largo: ci si ferma al primo che trova carte.
  const attempts: { q: string; reasons: string[] }[] = [];
  if (effects.length) {
    const all = effects.map((e) => e.q);
    const labels = effects.map((e) => e.label);
    attempts.push({ q: [...all, ...base, cmcRange].join(" "), reasons: [...labels, costNote] });
    attempts.push({ q: [effects[0].q, ...base, cmcRange].join(" "), reasons: [labels[0], costNote] });
    attempts.push({ q: [effects[0].q, ...base].join(" "), reasons: [labels[0]] });
  } else {
    // Nessun effetto riconosciuto: si usano solo le abilità chiave (volare,
    // tocco letale…), mai forza/costituzione o altre statistiche.
    const text = (card.oracleText ?? "").toLowerCase();
    const kws = KEYWORDS.filter((k) => new RegExp(`(^|\\n|, )${k}\\b`).test(text)).slice(0, 2);
    if (kws.length) {
      const kq = kws.map((k) => `keyword:"${k}"`).join(" ");
      const labels = kws.map((k) => `abilità ${k}`);
      attempts.push({ q: [kq, exclude, "game:paper", cmcRange].join(" "), reasons: [...labels, costNote] });
      attempts.push({ q: [kq, exclude, "game:paper"].join(" "), reasons: labels });
    }
  }

  for (const a of attempts) {
    const cards = await searchCards(a.q, { order: "edhrec", dir: "asc" });
    if (cards.length) return { cards: cards.slice(0, 30), reasons: a.reasons };
  }
  return { cards: [], reasons: effects.map((e) => e.label) };
}
