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
// Le decklist sono complete (~60 carte main), INDICATIVE: carte reali ma non
// una lista da torneo garantita-attuale.
export const META: Record<Format, MetaArchetype[]> = {
  standard: [
    {
      name: "Izzet Cauldron",
      note: "tempo/valore rosso-blu",
      deck: `4 Cori-Steel Cutter\n4 Manifold Mouse\n4 Marauding Mako\n4 Monastery Swiftspear\n4 Heartfire Hero\n3 Slickshot Show-Off\n2 Agatha's Soul Cauldron\n4 Torch the Tower\n4 Stormchaser's Talent\n3 Into the Flood Maw\n3 Sleight of Hand\n4 Burst Lightning\n4 Thundering Falls\n4 Riverpyre Verge\n6 Mountain\n3 Island`,
    },
    {
      name: "Golgari Midrange",
      note: "rimozioni + minacce",
      deck: `4 Sheoldred, the Apocalypse\n4 Cut Down\n4 Go for the Throat\n4 Deep-Cavern Bat\n4 Preacher of the Schism\n4 Overlord of the Balemurk\n3 Gix's Command\n3 Mosswood Dreamer\n2 The Cruelty of Gix\n4 Nowhere to Run\n4 Blooming Marsh\n4 Underground Mortuary\n2 Restless Cottage\n7 Swamp\n7 Forest`,
    },
    {
      name: "Mono-Red Aggro",
      note: "pressione veloce",
      deck: `4 Monastery Swiftspear\n4 Heartfire Hero\n4 Kumano Faces Kakkazan\n4 Screaming Nemesis\n4 Emberheart Challenger\n4 Manifold Mouse\n3 Slickshot Show-Off\n4 Burst Lightning\n4 Lightning Strike\n4 Monstrous Rage\n2 Witchstalker Frenzy\n2 Urabrask's Forge\n2 Rockface Village\n15 Mountain`,
    },
  ],
  pioneer: [
    {
      name: "Izzet Phoenix",
      note: "aggro-combo con Arclight Phoenix",
      deck: `4 Arclight Phoenix\n4 Ledger Shredder\n4 Sprite Dragon\n4 Consider\n4 Opt\n4 Treasure Cruise\n4 Pieces of the Puzzle\n3 Lightning Axe\n3 Fiery Impulse\n2 Crackling Drake\n4 Picklock Prankster\n2 Galvanic Iteration\n4 Steam Vents\n4 Spirebluff Canal\n4 Riverglide Pathway\n2 Otawara, Soaring City\n2 Island\n2 Mountain`,
    },
    {
      name: "Rakdos Midrange",
      note: "rimozione + minacce efficienti",
      deck: `4 Bloodtithe Harvester\n4 Fable of the Mirror-Breaker\n4 Thoughtseize\n4 Fatal Push\n3 Sheoldred, the Apocalypse\n3 Graveyard Trespasser\n3 Kroxa, Titan of Death's Hunger\n2 Bloodchief's Thirst\n3 Preacher of the Schism\n2 Go for the Throat\n4 Duress\n4 Blood Crypt\n4 Haunted Ridge\n2 Den of the Bugbear\n8 Swamp\n6 Mountain`,
    },
    {
      name: "Amalia Combo",
      note: "combo Amalia + Wildgrowth Walker",
      deck: `4 Amalia Benavides Aguirre\n4 Wildgrowth Walker\n4 Prosperous Innkeeper\n4 Collected Company\n4 Voice of the Blessed\n4 Extraction Specialist\n4 Skyclave Apparition\n4 Knight of Autumn\n4 Overgrown Tomb\n4 Godless Shrine\n4 Temple Garden\n2 Branchloft Pathway\n7 Forest\n4 Swamp\n3 Plains`,
    },
  ],
  modern: [
    {
      name: "Boros Energy",
      note: "aggro-midrange a energia",
      deck: `4 Guide of Souls\n4 Ocelot Pride\n4 Ajani, Nacatl Pariah\n4 Amped Raptor\n4 Goblin Bushwhacker\n4 Emberheart Challenger\n4 Galvanic Discharge\n4 Static Prison\n4 Lightning Bolt\n3 Phlage, Titan of Fire's Fury\n4 Arid Mesa\n2 Sacred Foundry\n2 Inspiring Vantage\n1 Elegant Parlor\n9 Mountain\n3 Plains`,
    },
    {
      name: "Izzet Wizards / Murktide",
      note: "tempo con controincantesimi",
      deck: `4 Murktide Regent\n4 Dragon's Rage Channeler\n4 Ledger Shredder\n4 Counterspell\n4 Lightning Bolt\n3 Unholy Heat\n4 Consider\n4 Expressive Iteration\n3 Spell Pierce\n2 Brazen Borrower\n3 Mishra's Bauble\n3 Force of Negation\n4 Scalding Tarn\n4 Steam Vents\n4 Spirebluff Canal\n1 Otawara, Soaring City\n4 Island\n1 Mountain`,
    },
    {
      name: "Amulet Titan",
      note: "ramp combo con Primeval Titan",
      deck: `4 Primeval Titan\n4 Amulet of Vigor\n4 Arboreal Grazer\n3 Azusa, Lost but Seeking\n4 Summoner's Pact\n2 Cultivator Colossus\n3 Explore\n1 Dryad of the Ilysian Grove\n3 Ancient Stirrings\n4 Simic Growth Chamber\n2 Boros Garrison\n2 Selesnya Sanctuary\n2 Gruul Turf\n2 Urza's Saga\n2 Tolaria West\n1 Boseiju, Who Endures\n1 Cavern of Souls\n4 Wooded Foothills\n12 Forest`,
    },
  ],
  pauper: [
    {
      name: "Kuldotha Boros",
      note: "aggro affinity rosso-bianco",
      deck: `4 Kuldotha Rebirth\n4 Goblin Bushwhacker\n4 Experimental Synthesizer\n4 Galvanic Blast\n4 Lightning Bolt\n4 Kessig Flamebreather\n4 Ornithopter\n4 Memnite\n4 Krark-Clan Shaman\n4 Makeshift Munitions\n4 Great Furnace\n12 Mountain\n4 Plains`,
    },
    {
      name: "Gruul Ramp / Ponza",
      note: "accelerazione + minacce",
      deck: `4 Utopia Sprawl\n4 Arbor Elf\n4 Annoyed Altisaur\n4 Fangren Marauder\n4 Wildheart Invoker\n4 Ancient Grudge\n4 Krosan Tusker\n4 Quirion Ranger\n4 Ash Barrens\n14 Forest\n10 Mountain`,
    },
    {
      name: "Dimir / Mono-U Faeries",
      note: "tempo con controincantesimi",
      deck: `4 Spellstutter Sprite\n4 Ninja of the Deep Hours\n4 Faerie Seer\n4 Faerie Miscreant\n4 Moon-Circuit Hacker\n4 Snap\n4 Counterspell\n4 Brainstorm\n4 Ponder\n3 Preordain\n3 Exclude\n18 Island`,
    },
  ],
  legacy: [
    {
      name: "Izzet Delver (Tempo)",
      note: "creature a basso costo + disturbo",
      deck: `4 Delver of Secrets\n4 Dragon's Rage Channeler\n2 Murktide Regent\n4 Daze\n4 Force of Will\n4 Brainstorm\n4 Ponder\n4 Lightning Bolt\n4 Chart a Course\n3 Spell Pierce\n3 Unholy Heat\n2 Force of Negation\n4 Volcanic Island\n4 Scalding Tarn\n4 Wasteland\n1 Mystic Sanctuary\n4 Island\n1 Mountain`,
    },
    {
      name: "Reanimator",
      note: "rianima minacce enormi in fretta",
      deck: `4 Reanimate\n4 Animate Dead\n3 Exhume\n2 Griselbrand\n2 Archon of Cruelty\n1 Atraxa, Grand Unifier\n4 Entomb\n4 Dark Ritual\n4 Faithless Looting\n4 Brainstorm\n4 Ponder\n3 Careful Study\n3 Chrome Mox\n4 Polluted Delta\n4 Bloodstained Mire\n2 Underground Sea\n2 Badlands\n5 Swamp\n1 Island`,
    },
    {
      name: "Death & Taxes",
      note: "prison bianco con disturbo",
      deck: `4 Thalia, Guardian of Thraben\n4 Stoneforge Mystic\n1 Batterskull\n1 Kaldra Compleat\n4 Swords to Plowshares\n4 Aether Vial\n4 Mother of Runes\n2 Palace Jailer\n3 Solitude\n4 Flickerwisp\n2 Skyclave Apparition\n4 Recruiter of the Guard\n4 Rishadan Port\n4 Wasteland\n1 Karakas\n2 Cavern of Souls\n12 Plains`,
    },
  ],
  vintage: [
    {
      name: "Ragavan Xerox",
      note: "tempo con cantrip e restricted",
      deck: `4 Ragavan, Nimble Pilferer\n4 Dragon's Rage Channeler\n2 Murktide Regent\n4 Force of Will\n4 Mental Misstep\n4 Brainstorm\n4 Ponder\n4 Lightning Bolt\n3 Unholy Heat\n1 Black Lotus\n1 Mox Sapphire\n1 Mox Ruby\n1 Mox Jet\n1 Ancestral Recall\n1 Time Walk\n1 Treasure Cruise\n4 Volcanic Island\n4 Scalding Tarn\n2 Polluted Delta\n1 Tolarian Academy\n9 Island`,
    },
    {
      name: "Dredge",
      note: "cimitero aggressivo",
      deck: `4 Bridge from Below\n3 Ichorid\n4 Narcomoeba\n4 Cabal Therapy\n2 Golgari Grave-Troll\n2 Dread Return\n4 Creeping Chill\n4 Prized Amalgam\n4 Faithless Looting\n3 Stinkweed Imp\n4 Golgari Thug\n4 Bazaar of Baghdad\n4 Cephalid Coliseum\n3 Mana Confluence\n3 Gemstone Mine\n4 City of Brass\n4 Lion's Eye Diamond`,
    },
    {
      name: "MUD / Shops",
      note: "artefatti + prison",
      deck: `4 Foundry Inspector\n4 Arcbound Ravager\n1 Karn, the Great Creator\n4 Chalice of the Void\n4 Sphere of Resistance\n4 Phyrexian Metamorph\n4 Thorn of Amethyst\n4 Lodestone Golem\n4 Steel Overseer\n4 Signal Pest\n1 Trinisphere\n2 Walking Ballista\n4 Mishra's Workshop\n4 Ancient Tomb\n4 Wasteland\n1 Tolarian Academy\n2 City of Traitors\n1 Sol Ring\n4 Mishra's Factory`,
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
