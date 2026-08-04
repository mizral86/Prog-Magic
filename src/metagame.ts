// Dati "meta" per la sezione Top mazzi. IMPORTANTE: non esiste una API
// gratuita affidabile del metagame, quindi la lista curata qui sotto è
// INDICATIVA (aggiornata alla data sotto) e NON un dato live: gli archetipi
// cambiano nel tempo. I link puntano a fonti sempre aggiornate (MTGGoldfish,
// MTGTop8, EDHREC): sono la fonte autorevole, la lista è solo un punto di
// partenza.

import { Format } from "./decks";

export const META_UPDATED = "gennaio 2026";

export interface MetaArchetype {
  name: string;
  note?: string;
  /**
   * Decklist "scheletro" INDICATIVA: le carte-firma reali dell'archetipo (da
   * completare/aggiornare). Non è una lista da torneo garantita-attuale. In
   * import, i nomi non riconosciuti da Scryfall vengono semplicemente scartati.
   */
  deck?: string;
}

// Archetipi di riferimento per formato (storicamente forti / molto giocati).
export const META: Record<Format, MetaArchetype[]> = {
  standard: [
    {
      name: "Izzet Cauldron",
      note: "tempo/valore rosso-blu",
      deck: `4 Cori-Steel Cutter\n4 Torch the Tower\n2 Agatha's Soul Cauldron\n4 Manifold Mouse\n4 Marauding Mako\n3 Stormchaser's Talent\n2 Into the Flood Maw\n9 Island\n8 Mountain`,
    },
    {
      name: "Golgari Midrange",
      note: "rimozioni + minacce",
      deck: `4 Sheoldred, the Apocalypse\n4 Cut Down\n3 Go for the Throat\n4 Deep-Cavern Bat\n3 Gix's Command\n2 Mosswood Dreamer\n2 The Cruelty of Gix\n9 Swamp\n6 Forest`,
    },
    {
      name: "Mono-Red Aggro",
      note: "pressione veloce",
      deck: `4 Monastery Swiftspear\n4 Heartfire Hero\n4 Kumano Faces Kakkazan\n4 Screaming Nemesis\n4 Burst Lightning\n4 Lightning Strike\n2 Witchstalker Frenzy\n20 Mountain`,
    },
  ],
  pioneer: [
    {
      name: "Izzet Phoenix",
      note: "aggro-combo con Arclight Phoenix",
      deck: `4 Arclight Phoenix\n4 Ledger Shredder\n4 Sprite Dragon\n4 Consider\n4 Opt\n4 Treasure Cruise\n3 Lightning Axe\n3 Pieces of the Puzzle\n8 Island\n6 Mountain`,
    },
    {
      name: "Rakdos Midrange",
      note: "rimozione + minacce efficienti",
      deck: `4 Bloodtithe Harvester\n4 Fable of the Mirror-Breaker\n4 Thoughtseize\n4 Fatal Push\n3 Sheoldred, the Apocalypse\n2 Graveyard Trespasser\n2 Kroxa, Titan of Death's Hunger\n8 Swamp\n5 Mountain`,
    },
    {
      name: "Amalia Combo",
      note: "combo Amalia + Wildgrowth Walker",
      deck: `4 Amalia Benavides Aguirre\n4 Wildgrowth Walker\n4 Prosperous Innkeeper\n4 Collected Company\n3 Voice of the Blessed\n2 Extraction Specialist\n9 Forest\n5 Swamp`,
    },
  ],
  modern: [
    {
      name: "Boros Energy",
      note: "aggro-midrange a energia",
      deck: `4 Guide of Souls\n4 Ocelot Pride\n4 Ajani, Nacatl Pariah\n4 Amped Raptor\n4 Goblin Bushwhacker\n4 Galvanic Discharge\n4 Static Prison\n3 Lightning Bolt\n2 Phlage, Titan of Fire's Fury\n4 Arid Mesa\n2 Sacred Foundry\n5 Mountain\n2 Plains`,
    },
    {
      name: "Izzet Wizards / Murktide",
      note: "tempo con controincantesimi",
      deck: `4 Murktide Regent\n4 Dragon's Rage Channeler\n4 Ledger Shredder\n4 Counterspell\n4 Lightning Bolt\n2 Unholy Heat\n4 Consider\n4 Expressive Iteration\n4 Steam Vents\n4 Spirebluff Canal\n5 Island\n2 Mountain`,
    },
    {
      name: "Amulet Titan",
      note: "ramp combo con Primeval Titan",
      deck: `4 Primeval Titan\n4 Amulet of Vigor\n4 Arboreal Grazer\n3 Azusa, Lost but Seeking\n4 Summoner's Pact\n2 Cultivator Colossus\n2 Urza's Saga\n4 Simic Growth Chamber\n2 Boros Garrison\n2 Selesnya Sanctuary\n1 Tolaria West\n6 Forest`,
    },
  ],
  pauper: [
    {
      name: "Kuldotha Boros",
      note: "aggro affinity rosso-bianco",
      deck: `4 Kuldotha Rebirth\n4 Goblin Bushwhacker\n4 Experimental Synthesizer\n4 Galvanic Blast\n4 Lightning Bolt\n4 Kessig Flamebreather\n4 Ornithopter\n4 Memnite\n4 Great Furnace\n4 Goblin Assault Team`,
    },
    {
      name: "Gruul Ramp / Ponza",
      note: "accelerazione + minacce",
      deck: `4 Utopia Sprawl\n4 Arbor Elf\n4 Annoyed Altisaur\n4 Fangren Marauder\n3 Wildheart Invoker\n4 Ancient Grudge\n14 Forest\n5 Mountain`,
    },
    {
      name: "Dimir / Mono-U Faeries",
      note: "tempo con controincantesimi",
      deck: `4 Spellstutter Sprite\n4 Ninja of the Deep Hours\n4 Faerie Miscreant\n4 Snap\n4 Counterspell\n4 Brainstorm\n4 Ponder\n18 Island`,
    },
  ],
  legacy: [
    {
      name: "Izzet Delver (Tempo)",
      note: "creature a basso costo + disturbo",
      deck: `4 Delver of Secrets\n4 Dragon's Rage Channeler\n2 Murktide Regent\n4 Daze\n4 Force of Will\n4 Brainstorm\n4 Ponder\n3 Wasteland\n4 Volcanic Island\n5 Island`,
    },
    {
      name: "Reanimator",
      note: "rianima minacce enormi in fretta",
      deck: `4 Reanimate\n4 Animate Dead\n3 Exhume\n2 Griselbrand\n2 Archon of Cruelty\n4 Entomb\n4 Dark Ritual\n4 Faithless Looting\n4 Brainstorm\n9 Swamp`,
    },
    {
      name: "Death & Taxes",
      note: "prison bianco con disturbo",
      deck: `4 Thalia, Guardian of Thraben\n4 Stoneforge Mystic\n1 Batterskull\n4 Swords to Plowshares\n4 Aether Vial\n4 Mother of Runes\n2 Palace Jailer\n4 Rishadan Port\n4 Wasteland\n12 Plains`,
    },
  ],
  vintage: [
    {
      name: "Ragavan Xerox",
      note: "tempo con cantrip e restricted",
      deck: `4 Ragavan, Nimble Pilferer\n4 Dragon's Rage Channeler\n2 Murktide Regent\n4 Force of Will\n4 Mental Misstep\n1 Black Lotus\n1 Mox Sapphire\n1 Mox Ruby\n4 Brainstorm\n4 Ponder\n4 Volcanic Island`,
    },
    {
      name: "Dredge",
      note: "cimitero aggressivo",
      deck: `4 Bazaar of Baghdad\n4 Bridge from Below\n3 Ichorid\n4 Narcomoeba\n4 Cabal Therapy\n2 Golgari Grave-Troll\n2 Dread Return\n4 Creeping Chill\n4 Prized Amalgam`,
    },
    {
      name: "MUD / Shops",
      note: "artefatti + prison",
      deck: `4 Mishra's Workshop\n4 Foundry Inspector\n4 Arcbound Ravager\n1 Karn, the Great Creator\n4 Chalice of the Void\n4 Sphere of Resistance\n4 Phyrexian Metamorph\n4 Wasteland`,
    },
  ],
  commander: [
    {
      name: "Vedi EDHREC per i comandanti più giocati",
      note: "il meta EDH è troppo vario per un top-3 fisso",
    },
  ],
};

// MTGGoldfish usa direttamente il nome formato.
export function goldfishUrl(format: Format): string {
  return `https://www.mtggoldfish.com/metagame/${format}#paper`;
}

// MTGTop8 usa codici formato.
const TOP8_CODE: Record<Format, string> = {
  standard: "ST",
  pioneer: "PI",
  modern: "MO",
  pauper: "PAU",
  legacy: "LE",
  vintage: "VI",
  commander: "EDH",
};
export function mtgtop8Url(format: Format): string {
  return `https://www.mtgtop8.com/format?f=${TOP8_CODE[format]}`;
}

export const EDHREC_URL = "https://edhrec.com/";
