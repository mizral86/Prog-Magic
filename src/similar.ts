// "Carte simili": dal testo regole (oracle, in inglese) di una carta ricava
// cosa fa (es. "infligge danno a qualsiasi bersaglio", "distrugge una
// creatura") e cerca su Scryfall altre carte con lo stesso effetto, in tutti i
// colori, con costo uguale o minore. Le più giocate prima (ordine EDHREC).

import { CardInfo } from "./types";
import { searchCards } from "./scryfall";

interface Effect {
  /** Riconosce l'effetto nel testo (minuscolo, nome carta sostituito da "~"). */
  re: RegExp;
  /** Frammento di query Scryfall che trova carte con lo stesso effetto. */
  q: string;
  /** Descrizione in italiano mostrata all'utente. */
  label: string;
  /** Se presente, costruisce query ed etichetta dal testo trovato (es. quale abilità). */
  build?: (m: RegExpMatchArray) => { q: string; label: string };
}

// Abilità che una carta può conferire, con il nome italiano.
const GRANTABLE: Record<string, string> = {
  flying: "volare",
  "first strike": "attacco improvviso",
  "double strike": "doppio attacco",
  trample: "travolgere",
  haste: "rapidità",
  lifelink: "legame vitale",
  deathtouch: "tocco letale",
  hexproof: "anti-malocchio",
  indestructible: "indistruttibile",
  vigilance: "cautela",
  menace: "minaccia",
  shroud: "velo",
};
const GRANT_RE = new RegExp(
  `target creature[^.]*? gains? (${Object.keys(GRANTABLE).join("|")})[^.]*? until end of turn`,
);

// In ordine di importanza: si usano i primi effetti riconosciuti.
const EFFECTS: Effect[] = [
  // Rimozione "alla Pacifismo": la creatura resta ma non può attaccare/bloccare.
  {
    re: /enchanted creature can't attack or block|enchanted creature doesn't untap|enchanted creature can't attack, block/,
    q: "o:/enchanted creature (can't attack|doesn't untap)/",
    label: "blocca una creatura (tipo Pacifismo)",
  },
  { re: /destroy all creatures|destroy all (other )?nonland permanents/, q: 'o:"destroy all"', label: "distrugge tutte le creature" },
  { re: /damage to each creature/, q: 'o:"damage to each creature"', label: "danni a tutte le creature" },
  { re: /exile all creatures/, q: 'o:"exile all"', label: "esilia tutte le creature" },
  { re: /(gets|get) -\d+\/-\d+ until end of turn/, q: 'o:/gets? -[0-9X]+\\/-[0-9X]+/', label: "dà -N/-N" },
  // "exile up to one other target creature", "destroy target nonblack creature"…
  // Blink: esilia una TUA creatura e la rimette in campo (Ephemerate, Conjurer's
  // Closet). Va prima della rimozione, che invece colpisce di solito l'avversario.
  {
    re: /exile (up to \w+ )?(another )?target [^.]*you (control|own)[^.]*(then )?return/,
    q: "o:/exile [^.]*target [^.]*you control[^.]*return/",
    label: "fa uscire e rientrare una tua creatura (blink)",
  },
  {
    // "(?! card)": "exile target creature CARD from a graveyard" (Deathrite
    // Shaman) è odio per il cimitero, non rimozione di una creatura in campo.
    re: /exile (up to \w+ )?(another |other )?target ([\w-]+ )?(creature|permanent)(?! you control)(?! cards?\b)/,
    // Esclude i blink ("target creature you control"), che sono un'altra cosa.
    // Dopo "creature/permanent" non deve venire "card" (carte nel cimitero).
    q: "o:/exile (up to [a-z]+ )?(another |other )?target ([a-z-]+ )?(creature|permanent)([.,]| [^c]| c[^a]| ca[^r])/ -o:/exile [^.]*target [^.]*you control/",
    label: "esilia una creatura",
  },
  { re: /destroy (up to \w+ )?(another |other )?target ([\w-]+ )?(creature|permanent)/, q: 'o:/destroy (up to [a-z]+ )?(another |other )?target ([a-z-]+ )?(creature|permanent)/', label: "distrugge una creatura" },
  { re: /damage to any target/, q: 'o:"damage to any target"', label: "danni a qualsiasi bersaglio" },
  { re: /damage to target (creature|planeswalker|player)/, q: 'o:/damage to (any target|target (creature|player))/', label: "danni a un bersaglio" },
  { re: /fights? (another )?target creature|deals damage equal to its power to/, q: 'o:/fights? (another )?target|damage equal to its power to/', label: "lotta / morso" },
  { re: /destroy target (artifact|enchantment)/, q: 'o:/destroy target (artifact|enchantment)/', label: "distrugge artefatti o incantesimi" },
  { re: /return target (creature|nonland permanent|permanent)[^.]* to its owner's hand/, q: "o:\"to its owner's hand\"", label: "fa tornare in mano" },
  { re: /target player sacrifices|each opponent sacrifices/, q: 'o:/(player|opponent) sacrifices/', label: "fa sacrificare" },
  // Interazione con le magie
  // Blocca le magie dell'avversario nel tuo turno (City of Solitude, Voice of Victory).
  {
    re: /can't cast spells during your turn|only during (their|your) own turns?|can cast spells only during their own turns/,
    q: "o:/can't cast spells during your turn|only during (their|your) own turns?/",
    label: "impedisce agli avversari di giocare magie nel tuo turno",
  },
  { re: /counter target (spell|creature spell|noncreature spell|instant|activated)/, q: 'o:"counter target"', label: "neutralizza una magia" },
  { re: /target (player|opponent) discards|each opponent discards|reveals? (their|his or her) hand/, q: 'o:/discards?|reveals (their|his or her) hand/', label: "fa scartare" },
  // Vantaggio carte e ricerca
  { re: /search your library for (a|up to \w+) basic land/, q: 'o:/search your library for (a|up to \\w+) basic land/', label: "cerca terre (ramp)" },
  { re: /\{t\}: add /, q: 'o:"{T}: Add"', label: "produce mana" },
  { re: /search your library for an? (card|creature|instant|sorcery|artifact|enchantment)/, q: 'o:/search your library for an? (card|creature|instant|sorcery|artifact|enchantment)/', label: "cerca una carta nel mazzo" },
  { re: /return target [^.]*card from your graveyard to (the battlefield|your hand)/, q: 'o:/from your graveyard to (the battlefield|your hand)/', label: "recupera dal cimitero" },
  { re: /draw (two|three|four|x) cards/, q: 'o:/draw (two|three|four|x) cards/', label: "pesca più carte" },
  // Pesca "d'impulso": esilia dalla cima e puoi giocarle (Tempered in
  // Solitude, Wrenn's Resolve).
  {
    re: /exile the top (\w+ )?cards? of your library[^]*?you may (play|cast) (that card|those cards|them|it|cards exiled)/,
    q: "o:/exile the top [^.]*of your library/ o:/you may (play|cast) (that card|those cards|them|it|cards exiled)/",
    label: "esilia le prime carte e puoi giocarle (pesca d'impulso)",
  },
  { re: /look at the top \w+ cards of your library/, q: 'o:/look at the top \\w+ cards of your library/', label: "guarda le prime carte del mazzo" },
  { re: /whenever [^.]* draw a card|draw a card/, q: 'o:"draw a card"', label: "pesca una carta" },
  { re: /\bscry \d/, q: "o:scry", label: "profetizza" },
  { re: /\bmills? |into (their|your) graveyard from the top/, q: "o:mill", label: "macina" },
  // Creature e pedine
  { re: /create [^.]*token/, q: 'o:create o:token', label: "crea pedine" },
  { re: /\+1\/\+1 counter/, q: 'o:"+1/+1 counter"', label: "segnalini +1/+1" },
  { re: /creatures you control get \+\d+\/\+\d+/, q: 'o:"creatures you control get +"', label: "potenzia le tue creature" },
  { re: /target creature gets \+\d+\/\+\d+/, q: 'o:"target creature gets +"', label: "potenzia una creatura" },
  // Dà un'abilità precisa fino a fine turno (es. Guardian of Solitude: volare):
  // si cerca la STESSA abilità, non una qualsiasi (Boros Charm dà doppio attacco).
  {
    re: GRANT_RE,
    q: "",
    label: "",
    build: (m) => ({
      q: `o:/target creature[^.]* gains? ${m[1]}[^.]* until end of turn/`,
      label: `dà ${GRANTABLE[m[1]]} a una creatura fino a fine turno`,
    }),
  },
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
    const m = text.match(e.re);
    if (!m) continue;
    const eff = e.build ? { ...e, ...e.build(m) } : e;
    if (!found.some((f) => f.q === eff.q)) found.push(eff);
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

/** Forma della carta, per confrontare prima carte dello stesso tipo. */
function kindOf(card: CardInfo): { q: string; label: string } | null {
  const c = card.categories;
  if (c.includes("creature")) return { q: "t:creature", label: "creature" };
  if (c.includes("instant") || c.includes("sorcery"))
    return { q: "(t:instant or t:sorcery)", label: "istantanei e stregonerie" };
  if (c.includes("planeswalker")) return { q: "t:planeswalker", label: "planeswalker" };
  if (c.includes("enchantment")) return { q: "t:enchantment", label: "incantesimi" };
  if (c.includes("artifact")) return { q: "t:artifact", label: "artefatti" };
  if (c.includes("land")) return { q: "t:land", label: "terre" };
  return null;
}

export async function findSimilar(card: CardInfo): Promise<SimilarResult> {
  const effects = detectEffects(card);
  const exclude = `-!"${card.name.replace(/"/g, "")}"`;
  const cmc = Math.round(card.cmc);
  const alt = hasAltCost(card);
  // Costo uguale o minore: un'alternativa più cara serve a poco.
  const cmcRange = `cmc<=${cmc}`;
  const costNote = alt
    ? `costo ${cmc} o meno (ha anche un costo alternativo)`
    : `costo ${cmc} o meno`;
  const base = [exclude, "game:paper"];
  // Prima carte della stessa forma (creatura con creatura, magia istantanea con
  // magia…): una creatura che dà volare per un turno va confrontata con altre
  // creature, non con istantanei. Poi, se servono, anche le altre.
  const kind = kindOf(card);

  // "typed": tentativo ristretto allo stesso tipo di carta.
  const attempts: { q: string; reasons: string[]; typed?: boolean }[] = [];
  if (effects.length) {
    const all = effects.map((e) => e.q);
    const labels = effects.map((e) => e.label);
    if (kind) {
      attempts.push({ q: [...all, kind.q, ...base, cmcRange].join(" "), reasons: [...labels, kind.label, costNote], typed: true });
      attempts.push({ q: [effects[0].q, kind.q, ...base, cmcRange].join(" "), reasons: [labels[0], kind.label, costNote], typed: true });
    }
    attempts.push({ q: [...all, ...base, cmcRange].join(" "), reasons: [...labels, costNote] });
    attempts.push({ q: [effects[0].q, ...base, cmcRange].join(" "), reasons: [labels[0], costNote] });
    attempts.push({ q: [effects[0].q, ...base].join(" "), reasons: [labels[0], "qualsiasi costo"] });
  } else {
    // Nessun effetto riconosciuto: si usano solo le abilità chiave (volare,
    // tocco letale…), mai forza/costituzione o altre statistiche.
    const text = (card.oracleText ?? "").toLowerCase();
    const kws = KEYWORDS.filter((k) => new RegExp(`(^|\\n|, )${k}\\b`).test(text)).slice(0, 2);
    if (kws.length) {
      const kq = kws.map((k) => `keyword:"${k}"`).join(" ");
      const labels = kws.map((k) => `abilità ${k}`);
      if (kind) attempts.push({ q: [kq, kind.q, ...base, cmcRange].join(" "), reasons: [...labels, kind.label, costNote], typed: true });
      attempts.push({ q: [kq, ...base, cmcRange].join(" "), reasons: [...labels, costNote] });
      attempts.push({ q: [kq, ...base].join(" "), reasons: [...labels, "qualsiasi costo"] });
    }
  }

  // Si raccolgono risultati dal tentativo più preciso al più largo. Le carte
  // dello stesso tipo vanno in cima ma sono al massimo TYPED_MAX, così restano
  // posto per le migliori degli altri tipi (Solitude → Skyclave Apparition, ma
  // anche Swords to Plowshares e Path to Exile).
  const TYPED_MAX = 8;
  const TOTAL = 20;
  const out: CardInfo[] = [];
  const seen = new Set<string>();
  let reasons: string[] | null = null;
  let widened = false;
  const tried = new Set<string>();
  for (const a of attempts) {
    if (out.length >= TOTAL) break;
    if (tried.has(a.q)) continue; // con un solo effetto alcuni tentativi coincidono
    tried.add(a.q);
    const cards = await searchCards(a.q, { order: "edhrec", dir: "asc" });
    let added = 0;
    const limit = a.typed ? Math.min(TOTAL, TYPED_MAX) : TOTAL;
    for (const c of cards) {
      if (seen.has(c.name) || out.length >= limit) continue;
      seen.add(c.name);
      out.push(c);
      added++;
    }
    if (added && !reasons) reasons = a.reasons;
    else if (added) widened = true;
  }
  if (reasons) {
    return {
      cards: out,
      reasons: widened ? [...reasons, "poi carte di ogni tipo con lo stesso effetto"] : reasons,
    };
  }
  return { cards: [], reasons: effects.map((e) => e.label) };
}
