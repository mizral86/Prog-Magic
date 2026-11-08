// Dati "meta" per la sezione Top mazzi. IMPORTANTE: non esiste una API
// gratuita affidabile del metagame, quindi questa è una FOTOGRAFIA presa alla
// data qui sotto, non un dato live. Le percentuali sono la quota di metagame
// degli ultimi 14-30 giorni secondo la fonte indicata per ogni formato; ogni
// lista è una decklist reale (60 + 15) giocata in un torneo di quel periodo.
// Per aggiornare: sostituire archetipi e liste, poi cambiare META_UPDATED.

import { Format } from "./decks";

export const META_UPDATED = "8 novembre 2026";

export interface MetaArchetype {
  name: string;
  note?: string;
  /** Quota di metagame, es. "12,5%". */
  share?: string;
  /** Da dove viene la lista: giocatore, torneo, data, piazzamento. */
  source?: string;
  /** Decklist completa (main + "Sideboard"), formato Arena/MTGO. */
  deck?: string;
}

/** Fonte delle percentuali, per formato. */
export const META_SOURCE: Record<Format, string> = {
  standard: "decklistdata.com, ultimi 14 giorni (MTGO)",
  pioneer: "decklistdata.com, ultimi 30 giorni (MTGO)",
  modern: "MTGGoldfish, ultimi 30 giorni",
  pauper: "decklistdata.com, ultimi 30 giorni (MTGO)",
  legacy: "decklistdata.com, ultimi 30 giorni (MTGO)",
  vintage: "decklistdata.com, ultimi 30 giorni (MTGO)",
  commander: "EDHREC, comandanti più usati nell'ultimo mese",
};

export const META: Record<Format, MetaArchetype[]> = {
  standard: [
    {
      name: "Landfall",
      share: "15,7%",
      source: "unagieel, Standard Challenge 16, 7 nov 2026, 8°",
      deck: "4 Carnivorous Cultivator\n4 Icetill Explorer\n4 Llanowar Elves\n4 Mightform Harmonizer\n4 Sazh's Chocobo\n3 Mossborn Hydra\n1 Archdruid's Charm\n2 Esper Origins\n4 Earthbender Ascension\n3 Sapling Nursery\n13 Forest\n4 Fabled Passage\n3 Ba Sing Se\n3 Elven Passage\n1 Cryptic Caves\n1 Demolition Field\n1 Escape Tunnel\n1 Pit of Offerings\nSideboard\n4 Hard-Hitting Question\n2 Karn, Argent Defender\n1 Mossborn Hydra\n1 Origin of Metalbending\n1 Sapling Nursery\n2 Surrak, Elusive Hunter\n2 Torpor Orb\n2 Warg Tactics",
    },
    {
      name: "Jund Sacrifice",
      share: "13,9%",
      source: "pizzangry, Standard Challenge 16, 29 ott 2026, 1° (9-0)",
      deck: "4 Biotech Specialist\n4 Gene Pollinator\n4 Greedy Freebooter\n4 The Sackville-Bagginses\n2 Llanowar Elves\n2 Umbral Collar Zealot\n1 Bristlebud Farmer\n1 Mutagen Man, Living Ooze\n1 Sentinel of the Nameless City\n1 Smaug the Magnificent\n2 Torch the Tower\n4 Lively Dirge\n2 Stir Up Trouble\n4 Obsessive Pursuit\n2 The Misty Mountains Cold\n4 Blooming Marsh\n4 Starting Town\n3 Blood Crypt\n3 Overgrown Tomb\n2 Stomping Ground\n1 Blazemire Verge\n1 Forest\n1 Mountain\n1 Swamp\n1 Thornspire Verge\n1 Wastewood Verge\nSideboard\n2 Duress\n2 Fire Magic\n1 Guerrilla Gorilla\n1 Heritage Reclamation\n2 Professor Dellian Fel\n2 Shoot the Sheriff\n2 Strategic Betrayal\n1 The Ooze\n1 Torch the Tower\n1 Vicious Rivalry",
    },
    {
      name: "Dimir Midrange",
      share: "9,8%",
      source: "starfall, MTGO Standard League, 8 nov 2026, 5-0",
      deck: "4 Dream Beavers\n4 Enduring Curiosity\n4 Floodpits Drowner\n4 Spyglass Siren\n3 The Wondrous Wasp\n1 Tishana's Tidebinder\n1 Wan Shi Tong, Librarian\n4 Kaito, Bane of Nightmares\n3 Requiting Hex\n3 We Say Thee Nay!\n2 Bitter Triumph\n2 Shoot the Sheriff\n2 Spell Snare\n4 Gloomlake Verge\n4 Island\n4 Multiversal Passage\n4 Swamp\n4 Watery Grave\n2 Soulstone Sanctuary\n1 Restless Reef\nSideboard\n1 Annul\n1 Day of Black Sun\n2 Duress\n2 Flashfreeze\n1 M.O.D.O.K.\n1 Negate\n1 Raven Eagle\n1 Requiting Hex\n2 Spell Snare\n1 Strategic Betrayal\n1 Tishana's Tidebinder\n1 Wan Shi Tong, Librarian",
    },
    {
      name: "Lifegain",
      share: "7,7%",
      source: "pokerswizard, Standard Challenge 16, 7 nov 2026, 7°",
      deck: "4 Amalia Benavides Aguirre\n4 Enlightened Confidant\n4 Haliya, Guided by Light\n4 Hinterland Sanctifier\n3 Moseo, Vein's New Dean\n2 Deep-Cavern Bat\n2 Liliana the Faultless\n2 Starscape Cleric\n1 Aunt May\n1 Ajani Resolute\n3 Erode\n4 Case of the Uneaten Feast\n4 Lunar Convocation\n4 Concealed Courtyard\n4 Godless Shrine\n4 Multiversal Passage\n4 Plains\n4 Starting Town\n1 Great Arashin City\n1 Swamp\nSideboard\n3 Duress\n1 Ghost Vacuum\n2 Pyrrhic Strike\n1 Seam Rip\n2 Shattered Acolyte\n2 Sheltered by Ghosts\n2 Space-Time Anomaly\n2 Strategic Betrayal",
    },
  ],
  pioneer: [
    {
      name: "Golgari Midrange",
      share: "12,5%",
      source: "Arianne, Pioneer Challenge 32, 3 nov 2026, 1°",
      deck: "4 Badgermole Cub\n4 Graveyard Trespasser\n3 Sheoldred, the Apocalypse\n3 Professor Dellian Fel\n4 Fatal Push\n3 Abrupt Decay\n2 Bitter Triumph\n4 Thoughtseize\n3 Culling Ritual\n1 Duress\n4 Unholy Annex // Ritual Chamber\n4 Blooming Marsh\n4 Llanowar Wastes\n4 Mutavault\n4 Overgrown Tomb\n2 Restless Cottage\n2 Swamp\n1 Boseiju, Who Endures\n1 Castle Locthwain\n1 Forest\n1 Takenuma, Abandoned Mire\n1 Urborg, Tomb of Yawgmoth\nSideboard\n2 Damping Sphere\n3 Duress\n3 Extinction Event\n2 Invoke Despair\n1 Professor Dellian Fel\n4 Strategic Betrayal",
    },
    {
      name: "Mono-Green Devotion",
      share: "11,2%",
      source: "HouseOfManaMTG, Pioneer Challenge 16, 7 nov 2026, 3°",
      deck: "4 Badgermole Cub\n4 Cavalier of Thorns\n4 Elvish Mystic\n4 Llanowar Elves\n4 Old-Growth Troll\n2 Outcaster Trailblazer\n2 Ulvenwald Oddity\n4 Kiora, Behemoth Beckoner\n2 Garruk, Curse Breaker\n4 Storm the Festival\n3 Invasion of Ixalan\n2 Oath of Nissa\n13 Forest\n4 Nykthos, Shrine to Nyx\n2 Boseiju, Who Endures\n2 Lair of the Hydra\nSideboard\n2 Arasta of the Endless Web\n1 Cityscape Leveler\n1 Emrakul, the Promised End\n2 Scrapshooter\n2 Setessan Petitioner\n3 Tail Swipe\n2 The Stone Brain\n2 Unlicensed Hearse",
    },
    {
      name: "Mono-Red Prowess",
      share: "9,7%",
      source: "haruhilmi24, Pioneer Challenge 16, 7 nov 2026, 6°",
      deck: "4 Eidolon of the Great Revel\n4 Emberheart Challenger\n4 Monastery Swiftspear\n4 Screaming Nemesis\n4 Voice of Victory\n4 Monstrous Rage\n3 Boros Charm\n3 Burst Lightning\n3 Lightning Helix\n4 Kumano Faces Kakkazan\n2 Sheltered by Ghosts\n4 Battlefield Forge\n4 Inspiring Vantage\n4 Mountain\n4 Sacred Foundry\n2 Ramunap Ruins\n1 Den of the Bugbear\n1 Needleverge Pathway\n1 Sokenzan, Crucible of Defiance\nSideboard\n1 Case of the Crimson Pulse\n2 Deflecting Palm\n2 Erode\n3 Magebane Lizard\n2 Pyroclasm\n2 Sunspine Lynx\n2 Unlicensed Hearse\n1 Urabrask's Forge",
    },
    {
      name: "Izzet Prowess",
      share: "8,9%",
      source: "_Falcon_, Pioneer Challenge 16, 31 ott 2026, 1°",
      deck: "4 Monastery Swiftspear\n3 Emberheart Challenger\n3 Pompous Battlemage\n2 Screaming Nemesis\n4 Academic Dispute\n3 Burst Lightning\n3 Reckless Rage\n2 Monstrous Rage\n4 Sleight of Hand\n3 Boomerang Basics\n3 Heroes' Hangout\n2 Flow State\n4 Stormchaser's Talent\n4 Riverpyre Verge\n4 Spirebluff Canal\n4 Steam Vents\n3 Mountain\n3 Shivan Reef\n1 Island\n1 Riverglide Pathway\nSideboard\n1 Boomerang Basics\n2 Essence Burn\n1 Firebending Lesson\n1 Ghost Vacuum\n1 Iroh's Demonstration\n1 It'll Quench Ya!\n1 Octopus Form\n2 Ral, Crackling Wit\n2 Redcap Melee\n1 Soul-Guide Lantern\n2 Spell Pierce",
    },
  ],
  modern: [
    {
      name: "Eldrazi Ramp (Broodscale)",
      share: "10,3%",
      source: "badgods, Modern Challenge 32, 4 nov 2026, 1° (8-1)",
      deck: "4 Basking Broodscale\n4 Emrakul, the Promised End\n4 Sowing Mycospawn\n2 Devourer of Destiny\n2 Sire of Seven Deaths\n1 Haywire Mite\n4 Kozilek's Command\n3 Dismember\n4 Ancient Stirrings\n4 Malevolent Rumble\n2 Blade of the Bloodchief\n1 Soul-Guide Lantern\n1 Springleaf Drum\n1 Talisman of Resilience\n1 Vexing Bauble\n6 Forest\n4 Eldrazi Temple\n4 Ugin's Labyrinth\n4 Urza's Saga\n2 Boseiju, Who Endures\n1 Gemstone Caverns\n1 Shifting Woodland\nSideboard\n1 Cavern of Souls\n1 Chalice of the Void\n1 Grafdigger's Cage\n2 Nature's Claim\n2 The Stone Brain\n1 Thief of Existence\n3 Thought-Knot Seer\n2 Trinisphere\n1 Vexing Bauble\n1 Warping Wail",
    },
    {
      name: "Izzet Prowess",
      share: "7,2%",
      source: "sedotwc, Modern Challenge 32, 2 nov 2026, 1° (8-1)",
      deck: "4 Dragon's Rage Channeler\n4 Monastery Swiftspear\n4 Slickshot Show-Off\n4 Lava Dart\n4 Lightning Bolt\n2 Mutagenic Growth\n2 Violent Urge\n4 Preordain\n3 Boomerang Basics\n2 Expressive Iteration\n4 Cori-Steel Cutter\n4 Mishra's Bauble\n1 Tormod's Crypt\n3 Bloodstained Mire\n3 Mountain\n3 Steam Vents\n2 Arid Mesa\n2 Fiery Islet\n2 Scalding Tarn\n2 Wooded Foothills\n1 Thundering Falls\nSideboard\n4 Consign to Memory\n1 Expressive Iteration\n1 Meltdown\n1 Murktide Regent\n1 Obsidian Charmaw\n1 Spell Pierce\n2 Spell Snare\n1 Tormod's Crypt\n3 Unholy Heat",
    },
    {
      name: "Affinity",
      share: "6,6%",
      source: "KizmaHusky, Modern Challenge 32, 18 ott 2026, 1° (8-1)",
      deck: "4 Kappa Cannoneer\n4 Pinnacle Emissary\n2 Emry, Lurker of the Loch\n1 Salvage Titan\n2 Metallic Rebuke\n1 Sink into Stupor\n2 Preordain\n4 Engineered Explosives\n4 Mishra's Bauble\n4 Mox Opal\n4 Tormod's Crypt\n3 Claws of Gix\n2 Welding Jar\n1 Pithing Needle\n1 Shadowspear\n1 Skateboard\n4 Weapons Manufacturing\n4 Fiery Islet\n4 Spirebluff Canal\n4 Urza's Saga\n2 Island\n1 Shivan Reef\n1 Steam Vents\nSideboard\n1 Blood Moon\n3 Consign to Memory\n1 Damping Sphere\n1 Disruptor Flute\n3 Galvanic Blast\n1 Grafdigger's Cage\n1 Metallic Rebuke\n1 Mystical Dispute\n1 Shattering Spree\n1 Swan Song\n1 Whipflare",
    },
    {
      name: "Domain Zoo",
      share: "5,9%",
      source: "Sarlanga, Modern Challenge 32, 23 ott 2026, 1° (6-2)",
      deck: "4 Ragavan, Nimble Pilferer\n4 Scion of Draco\n4 Territorial Kavu\n3 Psychic Frog\n2 Quantum Riddler\n1 Emperor of Bones\n1 Teferi, Time Raveler\n3 Stubborn Denial\n2 Fatal Push\n2 Lightning Bolt\n4 Thoughtseize\n4 Leyline Binding\n4 Leyline of the Guildpact\n4 Polluted Delta\n4 Scalding Tarn\n4 Wooded Foothills\n2 Blood Crypt\n1 Breeding Pool\n1 Hallowed Fountain\n1 Mountain\n1 Overgrown Tomb\n1 Raucous Theater\n1 Sacred Foundry\n1 Spara's Headquarters\n1 Steam Vents\nSideboard\n1 Celestial Purge\n3 Consign to Memory\n1 Force of Despair\n3 Mystical Dispute\n3 Obsidian Charmaw\n2 Rest in Peace\n1 Teferi, Time Raveler\n1 Wear // Tear",
    },
  ],
  pauper: [
    {
      name: "Mono-Red Madness",
      share: "14,9%",
      source: "Miaycle, Pauper League, 21 ott 2026, 5-0",
      deck: "4 Kitchen Imp\n4 Sneaky Snacker\n4 Voldaren Epicure\n4 Fiery Temper\n4 Lightning Bolt\n2 Demand Answers\n4 Alms of the Vein\n4 Faithless Looting\n4 Grab the Prize\n4 Highway Robbery\n4 Vampire's Kiss\n6 Mountain\n4 Jagged Barrens\n2 Bojuka Bog\n2 Rakdos Carnarium\n2 Razortrap Gorge\n2 Swamp\nSideboard\n3 Cast into the Fire\n2 Dark Withering\n2 Drown in Sorrow\n2 Extract a Confession\n2 Faerie Macabre\n2 Gorilla Shaman\n2 Relic of Progenitus",
    },
    {
      name: "Dimir Faeries",
      share: "9,2%",
      source: "Purgatory_01, Pauper League, 21 ott 2026, 5-0",
      deck: "4 Baleful Strix\n4 Ninja of the Deep Hours\n4 Spellstutter Sprite\n3 Augur of Bolas\n3 Faerie Seer\n2 Thorn of the Black Rose\n4 Brainstorm\n4 Counterspell\n4 Snuff Out\n3 Cast Down\n1 Dispel\n4 Lórien Revealed\n1 Arms of Hadar\n1 Extract a Confession\n10 Island\n4 Contaminated Aquifer\n1 Bojuka Bog\n1 Dimir Aqueduct\n1 Seething Landscape\n1 Swamp\nSideboard\n4 Annul\n1 Arms of Hadar\n2 Blue Elemental Blast\n1 Dispel\n4 Hydroblast\n1 Murmuring Mystic\n2 Relic of Progenitus",
    },
    {
      name: "Mono-Blue Terror",
      share: "8,2%",
      source: "discoverN, Pauper Challenge 16, 7 nov 2026, 2°",
      deck: "4 Cryptic Serpent\n4 Tolarian Terror\n2 Delver of Secrets\n2 Murmuring Mystic\n4 Brainstorm\n4 Counterspell\n4 Mental Note\n4 Thought Scour\n3 Dispel\n4 Lórien Revealed\n3 Deem Inferior\n3 Ponder\n2 Sleep of the Dead\n1 Deep Analysis\n16 Island\nSideboard\n4 Annul\n4 Blue Elemental Blast\n3 Gut Shot\n4 Hydroblast",
    },
    {
      name: "Dimir Control",
      share: "7,1%",
      source: "bombaj, Pauper League, 21 ott 2026, 5-0",
      deck: "4 Baleful Strix\n3 Murmuring Mystic\n3 Thorn of the Black Rose\n4 Counterspell\n4 Plunder the Trollshaws\n4 Snuff Out\n3 Cut Down\n3 Spell Pierce\n2 Cast Down\n1 Suffocating Fumes\n4 Lórien Revealed\n4 Preordain\n1 Extract a Confession\n2 Campfire\n9 Island\n4 Contaminated Aquifer\n2 Ice Tunnel\n1 Bojuka Bog\n1 Dimir Aqueduct\n1 Swamp\nSideboard\n3 Annul\n1 Arms of Hadar\n2 Dispel\n3 Duress\n4 Hydroblast\n1 Nihil Spellbomb\n1 Relic of Progenitus",
    },
  ],
  legacy: [
    {
      name: "Dimir Tempo",
      share: "12,8%",
      source: "vdboule, Legacy League, 8 nov 2026, 5-0",
      deck: "4 Moonshadow\n4 Nethergoyf\n2 Dauthi Voidwalker\n2 Orcish Bowmasters\n1 Brazen Borrower\n2 Kaito, Bane of Nightmares\n4 Brainstorm\n4 Fatal Push\n4 Force of Will\n3 Daze\n1 Snuff Out\n4 Thoughtseize\n2 Ponder\n4 Mishra's Bauble\n4 Polluted Delta\n4 Wasteland\n3 Underground Sea\n1 Bloodstained Mire\n1 Flooded Strand\n1 Island\n1 Marsh Flats\n1 Misty Rainforest\n1 Scalding Tarn\n1 Swamp\n1 Undercity Sewers\nSideboard\n1 Barrowgoyf\n1 Brazen Borrower\n3 Consign to Memory\n2 Force of Negation\n1 Hydroblast\n2 Nihil Spellbomb\n1 Null Rod\n2 Orcish Bowmasters\n2 Toxic Deluge",
    },
    {
      name: "Tron",
      share: "6,8%",
      source: "Zoza, Legacy League, 8 nov 2026, 5-0",
      deck: "4 Glaring Fleshraker\n4 Karn, the Great Creator\n3 Tezzeret, Cruel Captain\n2 Ugin, Eye of the Storms\n4 Kozilek's Command\n4 Grim Monolith\n4 Lotus Petal\n4 The One Ring\n3 Manifold Key\n2 Trinisphere\n1 Mishra's Research Desk\n1 Mox Opal\n1 Mystic Forge\n1 Pithing Needle\n1 Portable Hole\n1 Voltaic Key\n4 Ancient Tomb\n4 Planar Nexus\n4 Urza's Saga\n4 Urza's Tower\n4 Urza's Workshop\nSideboard\n2 Disruptor Flute\n1 Ensnaring Bridge\n3 Leyline of the Void\n1 Liquimetal Coating\n1 Mycosynth Lattice\n1 Mystic Forge\n1 Paradox Engine\n1 Perilous Snare\n2 Portable Hole\n1 Tormod's Crypt\n1 Warping Wail",
    },
    {
      name: "Ocelot Aggro (Boros)",
      share: "6,6%",
      source: "Comrade1312, Legacy League, 8 nov 2026, 5-0",
      deck: "4 Ajani, Nacatl Pariah\n4 Amped Raptor\n4 Guide of Souls\n4 Ocelot Pride\n4 White Orchid Phantom\n3 Thalia, Guardian of Thraben\n3 Voice of Victory\n4 Swords to Plowshares\n3 Erode\n3 Goblin Bombardment\n4 Arid Mesa\n4 Wasteland\n3 Flagstones of Trokair\n3 Plateau\n3 Sunbaked Canyon\n2 Karakas\n2 Plains\n1 Elegant Parlor\n1 Lazotep Quarry\n1 Mountain\nSideboard\n3 Deafening Silence\n2 Disruptor Flute\n2 Mindbreak Trap\n2 Null Rod\n2 Pyroblast\n2 Surgical Extraction\n2 Wrath of the Skies",
    },
  ],
  vintage: [
    {
      name: "Lurrus Control",
      share: "18,6%",
      source: "Ark4n, Vintage Challenge 32, 7 nov 2026, 1° (8-1)",
      deck: "3 Orcish Bowmasters\n3 Psychic Frog\n3 Ragavan, Nimble Pilferer\n2 Bilbo, Thief in the Night\n4 Fatal Push\n4 Force of Will\n3 Force of Negation\n2 Spell Pierce\n1 Ancestral Recall\n1 Brainstorm\n1 Mental Misstep\n2 Flow State\n2 Lórien Revealed\n1 Demonic Tutor\n1 Gitaxian Probe\n1 Time Walk\n1 Timetwister\n1 Treasure Cruise\n1 Black Lotus\n1 Mox Jet\n1 Mox Pearl\n1 Mox Ruby\n1 Mox Sapphire\n1 Vexing Bauble\n4 Wasteland\n3 Polluted Delta\n3 Underground Sea\n2 Scalding Tarn\n2 Volcanic Island\n1 Island\n1 Strip Mine\n1 Undercity Sewers\n1 Urza's Saga\nSideboard\n1 Lurrus of the Dream-Den\n2 Consign to Memory\n1 Dismember\n2 Grafdigger's Cage\n1 Nihil Spellbomb\n3 Null Rod\n1 Pithing Needle\n2 Pyroblast\n1 Snuff Out\n1 The Tabernacle at Pendrell Vale",
    },
    {
      name: "Lurrus PO",
      share: "11,3%",
      source: "andersoneclair, Vintage Challenge 32, 7 nov 2026, 4°",
      deck: "4 Thundertrap Trainer\n1 Snapcaster Mage\n4 Force of Will\n4 Paradoxical Outcome\n2 Flame of Anor\n2 Force of Negation\n2 Swords to Plowshares\n1 Ancestral Recall\n1 Mental Misstep\n1 Pyroblast\n4 Stock Up\n1 Forth Eorlingas!\n1 Gitaxian Probe\n1 Lórien Revealed\n1 Suplex\n1 Time Walk\n1 Black Lotus\n1 Mana Crypt\n1 Mana Vault\n1 Mox Emerald\n1 Mox Jet\n1 Mox Opal\n1 Mox Pearl\n1 Mox Ruby\n1 Mox Sapphire\n1 Pithing Needle\n1 Sol Ring\n1 Soul-Guide Lantern\n1 Vexing Bauble\n1 Dress Down\n3 Tundra\n3 Volcanic Island\n2 Misty Rainforest\n1 Flooded Strand\n1 Island\n1 Meticulous Archive\n1 Polluted Delta\n1 Scalding Tarn\n1 Tolarian Academy\n1 Urza's Saga\nSideboard\n1 Lurrus of the Dream-Den\n2 Consign to Memory\n2 Containment Priest\n2 Null Rod\n2 Overencumbered\n1 Pithing Needle\n2 Pyroblast\n1 Seal of Cleansing\n2 Swords to Plowshares",
    },
    {
      name: "Mono-White Initiative",
      share: "9,8%",
      source: "nicoprietob, Vintage Challenge 32, 7 nov 2026, 21°",
      deck: "4 Anointed Peacekeeper\n4 Archon of Emeria\n4 Chancellor of the Annex\n4 Clarion Conqueror\n4 Seasoned Dungeoneer\n4 White Plume Adventurer\n4 Witch Enchanter\n4 Chrome Mox\n4 Void Mirror\n1 Black Lotus\n1 Mana Crypt\n1 Mox Emerald\n1 Mox Jet\n1 Mox Pearl\n1 Mox Ruby\n1 Mox Sapphire\n1 Vexing Bauble\n4 Ancient Tomb\n4 Cavern of Souls\n4 Wasteland\n2 Plains\n1 Karakas\n1 Strip Mine\nSideboard\n3 Archon of Absolution\n1 Containment Priest\n4 Leyline of the Void\n3 Null Rod\n4 Swords to Plowshares",
    },
    {
      name: "Raker Shops",
      share: "9,7%",
      source: "AstroZombie74, Vintage League, 7 nov 2026, 5-0",
      deck: "4 Glaring Fleshraker\n4 Scrawling Crawler\n4 Tezzeret, Cruel Captain\n1 Karn, the Great Creator\n4 Grim Monolith\n4 Sensei's Divining Top\n4 The One Ring\n3 Manifold Key\n2 Mox Opal\n1 Black Lotus\n1 Chalice of the Void\n1 Mana Crypt\n1 Mana Vault\n1 Mox Emerald\n1 Mox Jet\n1 Mox Pearl\n1 Mox Ruby\n1 Mox Sapphire\n1 Mystic Forge\n1 Sol Ring\n1 The Fantasticar\n1 Time Vault\n1 Trinisphere\n1 Vexing Bauble\n4 Ancient Tomb\n4 Mishra's Workshop\n4 Talon Gates of Madara\n1 Inventors' Fair\n1 Tolarian Academy\n1 Urza's Saga\nSideboard\n2 Argentum Masticore\n3 Dismember\n2 Grafdigger's Cage\n3 Mindbreak Trap\n1 Mycosynth Lattice\n1 Pithing Needle\n2 Portable Hole\n1 Soul-Guide Lantern",
    },
  ],
  commander: [
    {
      name: "Jace, Multiverse Architect",
      note: "comandante · 9.600 mazzi su EDHREC",
      deck: "Commander\\n1 Jace, Multiverse Architect",
    },
    {
      name: "Y'shtola, Night's Blessed",
      note: "comandante · 6.310 mazzi su EDHREC",
      deck: "Commander\\n1 Y'shtola, Night's Blessed",
    },
    {
      name: "Giada, Font of Hope",
      note: "comandante · 5.590 mazzi su EDHREC",
      deck: "Commander\\n1 Giada, Font of Hope",
    },
    {
      name: "Tam, the Possibility",
      note: "comandante · 4.960 mazzi su EDHREC",
      deck: "Commander\\n1 Tam, the Possibility",
    },
    {
      name: "Vraska, Soul of Stone",
      note: "comandante · 4.940 mazzi su EDHREC",
      deck: "Commander\\n1 Vraska, Soul of Stone",
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
