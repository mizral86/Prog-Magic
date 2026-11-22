// Contenuti del tutorial "Impara" (Gioca > Impara): lezioni sul regolamento di
// Magic scritte con parole nostre (niente testo copiato dalle regole ufficiali,
// niente immagini o nomi di carte vere: gli esempi usano carte inventate).
//
// Ogni testo è una coppia [italiano, inglese]: la lingua si sceglie in
// Account, e il componente mostra direttamente quella giusta.
// Nei testi **parola** diventa grassetto.

/** Testo in due lingue: [italiano, inglese]. */
export type T = readonly [string, string];

export type CardColor = "W" | "U" | "B" | "R" | "G" | "C" | "land";

/** Carta finta di un esempio animato. x e y sono in % del tavolo. */
export interface SceneCard {
  name: T;
  color: CardColor;
  x: number;
  y: number;
  /** Forza/costituzione, es. "3/3". */
  pt?: string;
  tapped?: boolean;
  /** Debolezza da evocazione (💤). */
  sick?: boolean;
  /** Danni subiti in questo turno. */
  dmg?: number;
  /** Distrutta / risolta: sparisce. */
  gone?: boolean;
  /** Non ancora in gioco. */
  hidden?: boolean;
  /** Evidenziata. */
  glow?: boolean;
  /** Etichetta breve, es. "+3/+3". */
  note?: string;
}

export interface Frame {
  caption: T;
  /** Modifiche alle carte rispetto al fotogramma prima. */
  set?: Record<string, Partial<SceneCard>>;
  /** Punti vita [avversario, tu]. */
  life?: [number, number];
  /** Mana disponibile, es. "RRR". */
  mana?: string;
}

export interface Scene {
  cards: Record<string, SceneCard>;
  frames: Frame[];
  /** Mostra la zona della pila sulla destra. */
  stack?: boolean;
}

export interface Quiz {
  q: T;
  options: T[];
  correct: number;
  why: T;
}

export interface Step {
  title: T;
  body: T;
  scene?: Scene;
  quiz?: Quiz;
  /** Mostra il glossario delle parole chiave. */
  glossary?: boolean;
}

export interface Lesson {
  id: string;
  icon: string;
  title: T;
  sub: T;
  minutes: number;
  steps: Step[];
}

// Righe del tavolo (in % dell'altezza).
const OPP = 3;
const ATK = 30;
const ME = 47;
const LANDS = 74;

const n = (it: string, en: string): T => [it, en];

const ORCO = n("Orco", "Ogre");
const LUPO = n("Lupo", "Wolf");
const ELFO = n("Elfo", "Elf");

export const LESSONS: Lesson[] = [
  // ───────────────────────────────────────────── 1
  {
    id: "basi",
    icon: "🌱",
    title: n("Le basi", "The basics"),
    sub: n("Vita, mazzo, mana, come si vince", "Life, deck, mana, how to win"),
    minutes: 4,
    steps: [
      {
        title: n("Come si vince", "How to win"),
        body: n(
          "Ogni giocatore parte con **20 punti vita**. Vinci quando l'avversario arriva a **0 punti vita**, quando deve pescare da un mazzo **vuoto**, oppure quando una carta dice che vinci tu. Esiste anche una via più rara: 10 segnalini **veleno**.",
          "Each player starts with **20 life**. You win when your opponent reaches **0 life**, when they have to draw from an **empty** library, or when a card says you win. There is also a rarer way: 10 **poison** counters.",
        ),
        scene: {
          cards: { orco: { name: ORCO, color: "R", pt: "3/3", x: 20, y: ME } },
          frames: [
            { caption: n("Ognuno parte da 20 punti vita.", "Everyone starts at 20 life."), life: [20, 20] },
            {
              caption: n("Il tuo Orco attacca e nessuno lo blocca…", "Your Ogre attacks and nobody blocks it…"),
              set: { orco: { y: ATK, tapped: true } },
            },
            { caption: n("…l'avversario perde 3 punti vita.", "…your opponent loses 3 life."), life: [17, 20] },
            { caption: n("Chi arriva a 0 perde la partita.", "Whoever reaches 0 loses the game.") },
          ],
        },
        quiz: {
          q: n("Con quanti punti vita si parte in una partita normale?", "How much life do you start with in a normal game?"),
          options: [n("20", "20"), n("7", "7"), n("10", "10")],
          correct: 0,
          why: n(
            "20 nelle partite normali. Nel Commander invece si parte da 40.",
            "20 in normal games. In Commander you start at 40 instead.",
          ),
        },
      },
      {
        title: n("Mazzo, mano e mulligan", "Deck, hand and mulligan"),
        body: n(
          "Un mazzo da torneo ha **almeno 60 carte** e al massimo **4 copie** di ogni carta (le terre base sono senza limite). Si mescola e si pescano **7 carte**. Se la mano non ti piace fai **mulligan**: rimescoli, ripeschi 7 carte e poi metti in fondo al mazzo **una carta per ogni mulligan** fatto. Chi inizia **non pesca** al primo turno.",
          "A constructed deck has **at least 60 cards** and at most **4 copies** of each card (basic lands are unlimited). Shuffle and draw **7 cards**. If you don't like your hand you **mulligan**: shuffle, draw 7 again, then put **one card per mulligan** taken on the bottom of your library. The player who goes first **doesn't draw** on their first turn.",
        ),
        quiz: {
          q: n("Fai il secondo mulligan. Con quante carte inizi?", "You take your second mulligan. How many cards do you keep?"),
          options: [n("5", "5"), n("6", "6"), n("7", "7")],
          correct: 0,
          why: n(
            "Peschi sempre 7 carte, poi ne metti in fondo una per ogni mulligan: 7 − 2 = 5.",
            "You always draw 7, then bottom one per mulligan: 7 − 2 = 5.",
          ),
        },
      },
      {
        title: n("Le terre e il mana", "Lands and mana"),
        body: n(
          "Le carte si pagano con il **mana**, che arriva soprattutto dalle **terre**. Puoi giocare **una terra per turno**. Per usarla la **TAPpi** (la giri di lato) e ottieni il suo mana. I colori sono cinque: **bianco, blu, nero, rosso e verde**, più il mana **incolore**. Nel costo di una carta il numero si paga con mana di qualunque tipo, i simboli colorati con quel colore preciso.",
          "Cards are paid for with **mana**, which mostly comes from **lands**. You can play **one land per turn**. To use it you **tap** it (turn it sideways) and get its mana. There are five colors: **white, blue, black, red and green**, plus **colorless** mana. In a card's cost the number can be paid with any mana, the colored symbols with that exact color.",
        ),
        scene: {
          cards: {
            m1: { name: n("Montagna", "Mountain"), color: "land", x: 6, y: LANDS },
            m2: { name: n("Montagna", "Mountain"), color: "land", x: 22, y: LANDS },
            m3: { name: n("Montagna", "Mountain"), color: "land", x: 38, y: LANDS, hidden: true },
            orco: { name: ORCO, color: "R", pt: "3/3", x: 22, y: ME, hidden: true },
          },
          frames: [
            { caption: n("Hai due Montagne in campo.", "You have two Mountains in play.") },
            {
              caption: n("Giochi la terra del turno: una sola.", "You play your land for the turn: just one."),
              set: { m3: { hidden: false, glow: true } },
            },
            {
              caption: n("Tappi le tre terre: hai 3 mana rosso.", "You tap all three: 3 red mana."),
              set: { m1: { tapped: true }, m2: { tapped: true }, m3: { tapped: true, glow: false } },
              mana: "RRR",
            },
            {
              caption: n("Li spendi per l'Orco, che costa 2 + rosso.", "You spend it on the Ogre, which costs 2 + red."),
              set: { orco: { hidden: false, glow: true } },
              mana: "",
            },
          ],
        },
        quiz: {
          q: n(
            "Una carta costa 2 + rosso. Hai stappate una Montagna (rosso) e due Isole (blu). Puoi lanciarla?",
            "A card costs 2 + red. You have one untapped Mountain (red) and two Islands (blue). Can you cast it?",
          ),
          options: [n("Sì", "Yes"), n("No, servono 3 mana rossi", "No, it needs 3 red"), n("No, servono 2 mana rossi", "No, it needs 2 red")],
          correct: 0,
          why: n(
            "Il rosso arriva dalla Montagna, il 2 si paga con qualunque mana: vanno bene le due Isole.",
            "The red comes from the Mountain, and the 2 can be any mana: the two Islands work.",
          ),
        },
      },
      {
        title: n("Le zone", "The zones"),
        body: n(
          "Le carte si muovono tra alcune **zone**: il **grimorio** (il tuo mazzo), la **mano**, il **campo di battaglia** (le carte in gioco), il **cimitero** (carte usate o distrutte, a faccia in su), l'**esilio** (carte tolte dalla partita) e la **pila**, dove aspettano le magie appena lanciate.",
          "Cards move between a few **zones**: the **library** (your deck), your **hand**, the **battlefield** (cards in play), the **graveyard** (used or destroyed cards, face up), **exile** (cards removed from the game) and the **stack**, where freshly cast spells wait.",
        ),
        quiz: {
          q: n("Dove va una creatura distrutta?", "Where does a destroyed creature go?"),
          options: [n("Nel cimitero", "To the graveyard"), n("In esilio", "To exile"), n("In fondo al mazzo", "To the bottom of the library")],
          correct: 0,
          why: n(
            "Distrutta = cimitero. L'esilio è un'altra cosa: la carta deve dire «esilia».",
            "Destroyed = graveyard. Exile is different: the card has to say “exile”.",
          ),
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 2
  {
    id: "carte",
    icon: "🃏",
    title: n("I tipi di carte", "Card types"),
    sub: n("Terre, creature, istantanei…", "Lands, creatures, instants…"),
    minutes: 4,
    steps: [
      {
        title: n("Terre", "Lands"),
        body: n(
          "Le terre **non sono magie**: non costano mana e non vanno in pila, quindi nessuno può rispondere. Le giochi solo nel **tuo turno**, in una **fase principale**, quando la pila è vuota, e al massimo **una per turno**.",
          "Lands **aren't spells**: they cost no mana and don't use the stack, so nobody can respond. You play them only on **your turn**, in a **main phase**, when the stack is empty, and at most **one per turn**.",
        ),
      },
      {
        title: n("Creature", "Creatures"),
        body: n(
          "Le creature restano in campo e combattono. I due numeri in basso sono **forza/costituzione**: un 3/2 infligge 3 danni e muore con 2. Una creatura appena arrivata ha **debolezza da evocazione**: fino al tuo prossimo turno non può attaccare né usare abilità con il simbolo di TAP. I danni non si accumulano: **spariscono a fine turno**.",
          "Creatures stay on the battlefield and fight. The two numbers at the bottom are **power/toughness**: a 3/2 deals 3 damage and dies to 2. A creature that just arrived has **summoning sickness**: until your next turn it can't attack or use abilities with the tap symbol. Damage doesn't stack up: it **wears off at end of turn**.",
        ),
        scene: {
          cards: { orco: { name: ORCO, color: "R", pt: "3/3", x: 30, y: ME, hidden: true } },
          frames: [
            { caption: n("Lanci l'Orco…", "You cast the Ogre…"), set: { orco: { hidden: false, sick: true } } },
            {
              caption: n("…ha debolezza da evocazione: questo turno non attacca.", "…it has summoning sickness: no attacking this turn."),
            },
            {
              caption: n("Al tuo turno dopo è pronto e può attaccare.", "On your next turn it's ready to attack."),
              set: { orco: { sick: false } },
            },
            {
              caption: n("Attacca!", "Attack!"),
              set: { orco: { y: ATK, tapped: true } },
            },
          ],
        },
        quiz: {
          q: n("Una creatura 2/3 subisce 2 danni. Cosa succede?", "A 2/3 creature takes 2 damage. What happens?"),
          options: [
            n("Sopravvive e i danni spariscono a fine turno", "It survives and the damage wears off at end of turn"),
            n("Muore", "It dies"),
            n("Diventa 2/1 per sempre", "It becomes a 2/1 forever"),
          ],
          correct: 0,
          why: n(
            "Muore solo con danni pari o superiori alla costituzione (3). A fine turno i danni si azzerano.",
            "It only dies to damage equal to or greater than its toughness (3). Damage resets at end of turn.",
          ),
        },
      },
      {
        title: n("Istantanei e stregonerie", "Instants and sorceries"),
        body: n(
          "Fanno il loro effetto una volta e poi finiscono nel **cimitero**. Le **stregonerie** si lanciano solo nel tuo turno, in una fase principale, a pila vuota. Gli **istantanei** si lanciano **in qualsiasi momento** in cui hai la priorità, anche nel turno dell'avversario e in risposta a un'altra magia.",
          "They do their thing once and then go to the **graveyard**. **Sorceries** can only be cast on your turn, in a main phase, with an empty stack. **Instants** can be cast **any time** you have priority, even on your opponent's turn and in response to another spell.",
        ),
        quiz: {
          q: n("Vuoi fare qualcosa durante il turno dell'avversario. Che carta ti serve?", "You want to do something during your opponent's turn. What card do you need?"),
          options: [n("Un istantaneo", "An instant"), n("Una stregoneria", "A sorcery"), n("Una terra", "A land")],
          correct: 0,
          why: n(
            "Solo gli istantanei (e le carte con lampo) si giocano nel turno altrui.",
            "Only instants (and cards with flash) can be played on someone else's turn.",
          ),
        },
      },
      {
        title: n("Artefatti, incantesimi e planeswalker", "Artifacts, enchantments and planeswalkers"),
        body: n(
          "Come creature e terre sono **permanenti**: restano in campo. Gli **artefatti** sono oggetti (alcuni, gli Equipaggiamenti, si attaccano alle creature). Gli **incantesimi** sono effetti duraturi; le **Aure** si attaccano a un permanente. I **planeswalker** sono alleati con **segnalini fedeltà**: una volta per turno usi una loro abilità, e l'avversario può attaccarli.",
          "Like creatures and lands they are **permanents**: they stay on the battlefield. **Artifacts** are objects (some, Equipment, attach to creatures). **Enchantments** are lasting effects; **Auras** attach to a permanent. **Planeswalkers** are allies with **loyalty counters**: once per turn you use one of their abilities, and your opponent can attack them.",
        ),
        quiz: {
          q: n("Quale di queste carte resta sul campo dopo averla lanciata?", "Which of these cards stays on the battlefield after you cast it?"),
          options: [n("Un incantesimo", "An enchantment"), n("Un istantaneo", "An instant"), n("Una stregoneria", "A sorcery")],
          correct: 0,
          why: n(
            "Gli incantesimi sono permanenti. Istantanei e stregonerie vanno subito nel cimitero.",
            "Enchantments are permanents. Instants and sorceries go straight to the graveyard.",
          ),
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 3
  {
    id: "turno",
    icon: "⏱",
    title: n("Il turno e le fasi", "The turn and its phases"),
    sub: n("Stap, mantenimento, pescata…", "Untap, upkeep, draw…"),
    minutes: 4,
    steps: [
      {
        title: n("Fase iniziale", "Beginning phase"),
        body: n(
          "Ogni turno inizia così: **Stap** (stappi tutti i tuoi permanenti), **Mantenimento** (si risolvono gli effetti «all'inizio del tuo mantenimento») e **Acquisizione** (peschi una carta). Chi inizia la partita salta la pescata del primo turno.",
          "Every turn starts like this: **Untap** (untap all your permanents), **Upkeep** (effects that say “at the beginning of your upkeep” happen) and **Draw** (you draw a card). The player who goes first skips the draw on turn one.",
        ),
        scene: {
          cards: {
            m1: { name: n("Foresta", "Forest"), color: "land", x: 6, y: LANDS, tapped: true },
            m2: { name: n("Foresta", "Forest"), color: "land", x: 22, y: LANDS, tapped: true },
            lupo: { name: LUPO, color: "G", pt: "2/2", x: 22, y: ME, tapped: true },
          },
          frames: [
            { caption: n("Il turno scorso hai usato tutto.", "Last turn you used everything.") },
            {
              caption: n("Stap: torna tutto dritto.", "Untap: everything straightens up."),
              set: { m1: { tapped: false }, m2: { tapped: false }, lupo: { tapped: false } },
            },
            { caption: n("Mantenimento: gli effetti «all'inizio del mantenimento».", "Upkeep: “at the beginning of upkeep” effects.") },
            { caption: n("Acquisizione: peschi una carta.", "Draw: you draw a card.") },
          ],
        },
        quiz: {
          q: n("Chi inizia la partita pesca al primo turno?", "Does the player going first draw on turn one?"),
          options: [n("No", "No"), n("Sì", "Yes"), n("Solo se ha fatto mulligan", "Only after a mulligan")],
          correct: 0,
          why: n("Chi inizia salta la pescata del primo turno: compensa il vantaggio di partire prima.", "The first player skips that draw: it offsets the advantage of going first."),
        },
      },
      {
        title: n("Fasi principali", "Main phases"),
        body: n(
          "Ce ne sono due: una **prima** e una **dopo** il combattimento. Lì giochi la terra del turno e lanci creature, stregonerie e gli altri permanenti. Consiglio: le creature che non devono attaccare lanciale spesso nella **seconda** fase principale, così l'avversario sa meno cose mentre decide come bloccare.",
          "There are two: one **before** and one **after** combat. That's where you play your land for the turn and cast creatures, sorceries and other permanents. Tip: creatures that won't attack are often best cast in the **second** main phase, so your opponent knows less while deciding how to block.",
        ),
      },
      {
        title: n("Combattimento e fase finale", "Combat and ending phase"),
        body: n(
          "Il **combattimento** ha cinque passi: inizio, dichiarazione degli attaccanti, dei bloccanti, danni e fine (lo vediamo nella prossima lezione). Nella **fase finale** si risolvono gli effetti «all'inizio della sottofase finale»; poi in **cancellazione** scarti fino ad avere **7 carte** in mano, i danni spariscono e finiscono gli effetti «fino alla fine del turno».",
          "**Combat** has five steps: beginning, declare attackers, declare blockers, damage and end (more in the next lesson). In the **ending phase**, “at the beginning of the end step” effects happen; then in **cleanup** you discard down to **7 cards**, damage wears off and “until end of turn” effects end.",
        ),
        quiz: {
          q: n("A fine turno hai 9 carte in mano. Cosa fai?", "At end of turn you have 9 cards in hand. What do you do?"),
          options: [n("Ne scarti 2", "Discard 2"), n("Niente", "Nothing"), n("Le rimetti nel mazzo", "Put them back in the library")],
          correct: 0,
          why: n("Il limite è 7 carte: scarti le eccedenti, scegliendo tu quali.", "The limit is 7 cards: you discard the extras, choosing which."),
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 4
  {
    id: "combattimento",
    icon: "⚔️",
    title: n("Il combattimento", "Combat"),
    sub: n("Attaccare, bloccare, danni", "Attacking, blocking, damage"),
    minutes: 5,
    steps: [
      {
        title: n("Attaccare", "Attacking"),
        body: n(
          "Nel tuo turno scegli quali creature attaccano e le **TAPpi**. Attaccano l'**avversario** (oppure un suo planeswalker). Non possono attaccare le creature già tappate né quelle con debolezza da evocazione.",
          "On your turn you choose which creatures attack and **tap** them. They attack your **opponent** (or one of their planeswalkers). Creatures that are already tapped or have summoning sickness can't attack.",
        ),
        scene: {
          cards: {
            orco: { name: ORCO, color: "R", pt: "3/3", x: 20, y: ME },
            lupo: { name: LUPO, color: "G", pt: "2/2", x: 45, y: ME },
          },
          frames: [
            { caption: n("Hai due creature pronte.", "You have two creatures ready."), life: [20, 20] },
            {
              caption: n("Dichiari gli attaccanti: li tappi e partono.", "Declare attackers: tap them and go."),
              set: { orco: { y: ATK, tapped: true }, lupo: { y: ATK, tapped: true } },
            },
            { caption: n("Nessun blocco: 3 + 2 = 5 danni.", "No blocks: 3 + 2 = 5 damage."), life: [15, 20] },
          ],
        },
      },
      {
        title: n("Bloccare", "Blocking"),
        body: n(
          "Chi difende sceglie quali sue creature **stappate** bloccano. Ogni bloccante ferma **un solo** attaccante, ma più bloccanti possono fermare lo stesso attaccante. Le creature non bloccate colpiscono il giocatore.",
          "The defender chooses which of their **untapped** creatures block. Each blocker stops **only one** attacker, but several blockers can gang up on the same attacker. Unblocked creatures hit the player.",
        ),
        scene: {
          cards: {
            orco: { name: ORCO, color: "R", pt: "3/3", x: 20, y: ME },
            lupo: { name: LUPO, color: "G", pt: "2/2", x: 50, y: OPP },
            elfo: { name: ELFO, color: "G", pt: "1/1", x: 72, y: OPP, tapped: true },
          },
          frames: [
            { caption: n("L'avversario ha un Lupo e un Elfo tappato.", "Your opponent has a Wolf and a tapped Elf.") },
            { caption: n("Il tuo Orco attacca.", "Your Ogre attacks."), set: { orco: { y: ATK, tapped: true } } },
            {
              caption: n("Il Lupo blocca. L'Elfo è tappato: non può.", "The Wolf blocks. The Elf is tapped: it can't."),
              set: { lupo: { x: 20, y: OPP, glow: true } },
            },
          ],
        },
        quiz: {
          q: n("Nell'esempio, chi poteva bloccare l'Orco?", "In the example, who could block the Ogre?"),
          options: [
            n("Solo il Lupo (l'Elfo è tappato)", "Only the Wolf (the Elf is tapped)"),
            n("Lupo ed Elfo insieme", "Wolf and Elf together"),
            n("Nessuno", "Nobody"),
          ],
          correct: 0,
          why: n("Le creature tappate non possono bloccare.", "Tapped creatures can't block."),
        },
      },
      {
        title: n("I danni", "Damage"),
        body: n(
          "I danni si infliggono **tutti nello stesso momento**: ogni creatura fa danni pari alla sua **forza** a chi ha davanti. Muore chi riceve danni pari o superiori alla sua **costituzione**.",
          "Combat damage is dealt **all at the same time**: each creature deals damage equal to its **power** to what it's fighting. A creature dies if it takes damage equal to or greater than its **toughness**.",
        ),
        scene: {
          cards: {
            orco: { name: ORCO, color: "R", pt: "3/3", x: 20, y: ATK, tapped: true },
            lupo: { name: LUPO, color: "G", pt: "2/2", x: 20, y: OPP },
          },
          frames: [
            { caption: n("Orco 3/3 contro Lupo 2/2.", "Ogre 3/3 against Wolf 2/2.") },
            {
              caption: n("Si colpiscono insieme: 3 danni al Lupo, 2 all'Orco.", "They hit each other at once: 3 to the Wolf, 2 to the Ogre."),
              set: { orco: { dmg: 2 }, lupo: { dmg: 3 } },
            },
            {
              caption: n("Il Lupo muore, l'Orco sopravvive (2 danni su 3).", "The Wolf dies, the Ogre survives (2 damage of 3)."),
              set: { lupo: { gone: true } },
            },
            { caption: n("A fine turno i danni dell'Orco spariscono.", "At end of turn the Ogre's damage wears off."), set: { orco: { dmg: 0 } } },
          ],
        },
        quiz: {
          q: n("Un Orco 3/3 blocca un Cavaliere 2/4. Cosa succede?", "A 3/3 Ogre blocks a 2/4 Knight. What happens?"),
          options: [n("Non muore nessuno", "Nobody dies"), n("Muore il Cavaliere", "The Knight dies"), n("Muoiono tutti e due", "Both die")],
          correct: 0,
          why: n("L'Orco fa 3 danni a un 4 di costituzione, il Cavaliere 2 a un 3: tutti e due sopravvivono.", "The Ogre deals 3 to a toughness of 4, the Knight deals 2 to a 3: both survive."),
        },
      },
      {
        title: n("Attacco improvviso e travolgere", "First strike and trample"),
        body: n(
          "Con **attacco improvviso** una creatura colpisce **prima** delle altre: se uccide chi ha davanti, non riceve danni. Con **travolgere** un attaccante bloccato assegna al bloccante solo i danni letali e il **resto va al giocatore**.",
          "With **first strike** a creature deals damage **before** the others: if it kills what it's fighting, it takes no damage. With **trample** a blocked attacker only needs to assign lethal damage to the blocker, and **the rest goes to the player**.",
        ),
        scene: {
          cards: {
            drago: { name: n("Drago", "Dragon"), color: "R", pt: "5/5", x: 20, y: ME, note: "⇶" },
            lupo: { name: LUPO, color: "G", pt: "2/2", x: 55, y: OPP },
          },
          frames: [
            { caption: n("Il Drago 5/5 con travolgere attacca.", "The 5/5 trampling Dragon attacks."), life: [20, 20], set: { drago: { y: ATK, tapped: true } } },
            { caption: n("Il Lupo 2/2 blocca.", "The 2/2 Wolf blocks."), set: { lupo: { x: 20, y: OPP, glow: true } } },
            {
              caption: n("2 danni bastano al Lupo, gli altri 3 passano.", "2 damage is enough for the Wolf, the other 3 go through."),
              set: { lupo: { dmg: 2 } },
              life: [17, 20],
            },
            { caption: n("Il Lupo muore.", "The Wolf dies."), set: { lupo: { gone: true } } },
          ],
        },
        quiz: {
          q: n("Una 5/5 con travolgere è bloccata da una 2/2. Quanti danni prende il giocatore?", "A 5/5 trampler is blocked by a 2/2. How much damage does the player take?"),
          options: [n("3", "3"), n("5", "5"), n("0", "0")],
          correct: 0,
          why: n("Al bloccante servono 2 danni letali, i 3 rimanenti travolgono.", "The blocker needs 2 lethal damage, the remaining 3 trample over."),
        },
      },
      {
        title: n("Trucchi in combattimento", "Combat tricks"),
        body: n(
          "Dopo che i bloccanti sono stati scelti puoi ancora lanciare **istantanei**, per esempio per dare +3/+3 a una tua creatura. Per questo un attacco «suicida» dell'avversario con molto mana libero spesso nasconde un trucco.",
          "After blockers are chosen you can still cast **instants**, for example to give one of your creatures +3/+3. That's why an opponent's “bad” attack with lots of open mana often hides a trick.",
        ),
        scene: {
          cards: {
            cav: { name: n("Cavaliere", "Knight"), color: "W", pt: "2/2", x: 20, y: ME },
            orco: { name: ORCO, color: "R", pt: "3/3", x: 55, y: OPP },
          },
          frames: [
            { caption: n("Il tuo Cavaliere 2/2 attacca.", "Your 2/2 Knight attacks."), set: { cav: { y: ATK, tapped: true } } },
            { caption: n("L'Orco 3/3 blocca, sembra finita…", "The 3/3 Ogre blocks, looks bad…"), set: { orco: { x: 20, y: OPP } } },
            {
              caption: n("Lanci un istantaneo: +3/+3 fino a fine turno.", "You cast an instant: +3/+3 until end of turn."),
              set: { cav: { pt: "5/5", note: "+3/+3", glow: true } },
            },
            { caption: n("Il Cavaliere 5/5 vince lo scontro.", "The 5/5 Knight wins the fight."), set: { orco: { dmg: 5 }, cav: { dmg: 3 } } },
            { caption: n("L'Orco muore.", "The Ogre dies."), set: { orco: { gone: true } } },
          ],
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 5
  {
    id: "pila",
    icon: "📚",
    title: n("La pila", "The stack"),
    sub: n("Rispondere a una magia", "Responding to a spell"),
    minutes: 4,
    steps: [
      {
        title: n("L'ultima entra, la prima esce", "Last in, first out"),
        body: n(
          "Quando lanci una magia non succede subito: va sulla **pila** e tutti possono **rispondere** con istantanei o abilità, che vanno **sopra**. Quando nessuno vuole aggiungere altro si risolve la magia **in cima**, cioè l'ultima arrivata, poi la successiva.",
          "When you cast a spell it doesn't happen right away: it goes on the **stack**, and everyone can **respond** with instants or abilities, which go **on top**. When nobody wants to add anything, the spell **on top** resolves first, the newest one, then the next.",
        ),
        scene: {
          stack: true,
          cards: {
            grifone: { name: n("Grifone", "Griffin"), color: "W", pt: "2/3", x: 20, y: OPP },
            getto: { name: n("Getto di fuoco", "Fire Spurt"), color: "R", x: 76, y: 26, hidden: true, note: "3" },
            parola: { name: n("Parola d'arresto", "Halting Word"), color: "U", x: 80, y: 40, hidden: true },
          },
          frames: [
            { caption: n("L'avversario ha un Grifone 2/3.", "Your opponent has a 2/3 Griffin.") },
            {
              caption: n("Lanci Getto di fuoco (3 danni) sul Grifone: va in pila.", "You cast Fire Spurt (3 damage) at the Griffin: it goes on the stack."),
              set: { getto: { hidden: false }, grifone: { glow: true } },
            },
            {
              caption: n("L'avversario risponde con Parola d'arresto, che neutralizza una magia: va sopra.", "Your opponent responds with Halting Word, which counters a spell: it goes on top."),
              set: { parola: { hidden: false, glow: true } },
            },
            {
              caption: n("Si risolve prima quella in cima: Parola d'arresto neutralizza Getto di fuoco.", "The top one resolves first: Halting Word counters Fire Spurt."),
              set: { parola: { gone: true }, getto: { gone: true } },
            },
            { caption: n("Il Grifone è salvo.", "The Griffin is safe."), set: { grifone: { glow: false } } },
          ],
        },
        quiz: {
          q: n(
            "Lanci una magia e l'avversario risponde con un istantaneo. Quale si risolve per prima?",
            "You cast a spell and your opponent responds with an instant. Which resolves first?",
          ),
          options: [n("L'istantaneo dell'avversario", "Your opponent's instant"), n("La tua magia", "Your spell"), n("Tutte e due insieme", "Both at once")],
          correct: 0,
          why: n("L'ultima arrivata in pila è la prima a risolversi.", "The last one onto the stack is the first to resolve."),
        },
      },
      {
        title: n("Priorità e abilità", "Priority and abilities"),
        body: n(
          "Chi ha la **priorità** può lanciare o passare; la cima della pila si risolve quando **entrambi passano di fila**, poi si ricomincia. Anche le **abilità innescate** («quando…», «ogni volta che…», «all'inizio di…») e le abilità attivate vanno in pila. **Non** usano la pila: giocare una terra e le abilità che producono mana.",
          "Whoever has **priority** can cast something or pass; the top of the stack resolves when **both players pass in a row**, then it starts again. **Triggered abilities** (“when…”, “whenever…”, “at the beginning of…”) and activated abilities use the stack too. Playing a land and mana abilities do **not** use the stack.",
        ),
        quiz: {
          q: n("Giocare una terra usa la pila?", "Does playing a land use the stack?"),
          options: [n("No", "No"), n("Sì", "Yes"), n("Solo nel turno avversario", "Only on the opponent's turn")],
          correct: 0,
          why: n("Le terre non sono magie: entrano subito e nessuno può rispondere.", "Lands aren't spells: they enter right away and nobody can respond."),
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 6
  {
    id: "parole",
    icon: "✨",
    title: n("Parole chiave", "Keywords"),
    sub: n("Volare, travolgere, lampo…", "Flying, trample, flash…"),
    minutes: 3,
    steps: [
      {
        title: n("Glossario", "Glossary"),
        body: n(
          "Molte abilità hanno un nome breve, la **parola chiave**. Qui trovi le più comuni: cerca quella che ti serve. Se una carta ti confonde, apri la sua scheda: sotto ci sono anche le casistiche.",
          "Many abilities have a short name, the **keyword**. Here are the most common ones: search for the one you need. If a card confuses you, open its page: the rulings are listed there too.",
        ),
        glossary: true,
        quiz: {
          q: n("Una creatura con volare può essere bloccata da…", "A creature with flying can be blocked by…"),
          options: [
            n("Creature con volare o raggiungere", "Creatures with flying or reach"),
            n("Qualsiasi creatura", "Any creature"),
            n("Nessuna creatura", "No creature"),
          ],
          correct: 0,
          why: n("Volare si blocca solo con volare o raggiungere.", "Flying can only be blocked by flying or reach."),
        },
      },
    ],
  },

  // ───────────────────────────────────────────── 7
  {
    id: "formati",
    icon: "🏆",
    title: n("I formati", "Formats"),
    sub: n("Standard, Commander, Pauper…", "Standard, Commander, Pauper…"),
    minutes: 3,
    steps: [
      {
        title: n("Formati costruiti", "Constructed formats"),
        body: n(
          "Porti un mazzo già fatto: **almeno 60 carte**, massimo **4 copie** per carta e una **sideboard** di 15 carte da scambiare tra una partita e l'altra. Cambia l'insieme di carte ammesse: **Standard** (solo le espansioni recenti), **Pioneer** e **Modern** (più ampi), **Legacy** e **Vintage** (quasi tutte le carte), **Pauper** (solo carte comuni). La sezione Mazzi ti dice in quali formati è legale il tuo mazzo.",
          "You bring a ready-made deck: **at least 60 cards**, at most **4 copies** of each and a 15-card **sideboard** to swap between games. What changes is the card pool: **Standard** (recent sets only), **Pioneer** and **Modern** (wider), **Legacy** and **Vintage** (almost every card), **Pauper** (commons only). The Decks section tells you which formats your deck is legal in.",
        ),
      },
      {
        title: n("Commander", "Commander"),
        body: n(
          "Il formato più giocato tra amici: mazzo da **100 carte**, **una sola copia** di ogni carta (terre base escluse), guidato da una **creatura leggendaria**, il comandante, che decide i colori ammessi. Si gioca di solito in **3-4 persone** partendo da **40 punti vita**; chi subisce **21 danni** dallo stesso comandante perde. Per contare vita e danni c'è il Segnapunti qui in Gioca.",
          "The most popular format among friends: a **100-card** deck, **one copy** of each card (basic lands aside), led by a **legendary creature**, the commander, which sets the allowed colors. Usually played by **3-4 people** starting at **40 life**; anyone who takes **21 damage** from the same commander loses. The Life counter here in Play tracks life and commander damage.",
        ),
        quiz: {
          q: n("Quante copie della stessa carta (non terra base) puoi avere in Commander?", "How many copies of the same card (not a basic land) can you run in Commander?"),
          options: [n("1", "1"), n("4", "4"), n("2", "2")],
          correct: 0,
          why: n("Commander è «singleton»: una copia per carta.", "Commander is “singleton”: one copy of each card."),
        },
      },
      {
        title: n("Limitato: draft e sealed", "Limited: draft and sealed"),
        body: n(
          "Nel **limitato** il mazzo si costruisce sul momento con buste appena aperte: nel **draft** si sceglie una carta a giro passando le buste, nel **sealed** si usano le carte di 6 buste. Il mazzo ha **almeno 40 carte**, di solito con 17 terre.",
          "In **limited** you build the deck on the spot from freshly opened packs: in **draft** you pick one card and pass the pack around, in **sealed** you use the cards from 6 packs. Decks have **at least 40 cards**, usually with 17 lands.",
        ),
      },
    ],
  },
];

/** Glossario delle parole chiave più comuni. */
export const GLOSSARY: { word: T; text: T }[] = [
  { word: n("Anti-malocchio", "Hexproof"), text: n("Gli avversari non possono sceglierla come bersaglio. Tu sì.", "Opponents can't target it. You can.") },
  { word: n("Attacco improvviso", "First strike"), text: n("Infligge danno da combattimento prima delle creature senza questa abilità.", "Deals combat damage before creatures without this ability.") },
  { word: n("Cautela", "Vigilance"), text: n("Attaccare non la fa TAPpare: resta pronta a bloccare.", "Attacking doesn't cause it to tap: it stays ready to block.") },
  { word: n("Difensore", "Defender"), text: n("Non può attaccare.", "It can't attack.") },
  { word: n("Doppio attacco", "Double strike"), text: n("Infligge danno da combattimento due volte: con l'attacco improvviso e poi di nuovo con il danno normale.", "Deals combat damage twice: in the first-strike step and again in the regular one.") },
  { word: n("Equipaggiare", "Equip"), text: n("Paghi il costo per attaccare l'Equipaggiamento a una tua creatura, solo quando potresti lanciare una stregoneria.", "Pay the cost to attach the Equipment to a creature you control, only when you could cast a sorcery.") },
  { word: n("Esiliare", "Exile"), text: n("Togliere una carta dalla partita mettendola nella zona di esilio.", "Remove a card from the game by putting it into exile.") },
  { word: n("Indistruttibile", "Indestructible"), text: n("Non viene distrutta dai danni né dagli effetti che «distruggono». Può comunque essere esiliata o sacrificata.", "Damage and “destroy” effects don't destroy it. It can still be exiled or sacrificed.") },
  { word: n("Lampo", "Flash"), text: n("Puoi lanciarla in qualsiasi momento in cui potresti lanciare un istantaneo.", "You can cast it any time you could cast an instant.") },
  { word: n("Legame vitale", "Lifelink"), text: n("I danni che infligge ti fanno anche guadagnare altrettanti punti vita.", "Damage it deals also makes you gain that much life.") },
  { word: n("Macinare", "Mill"), text: n("Mettere le prime carte di un grimorio nel cimitero.", "Put the top cards of a library into the graveyard.") },
  { word: n("Minacciare", "Menace"), text: n("Può essere bloccata solo da due o più creature.", "It can't be blocked except by two or more creatures.") },
  { word: n("Neutralizzare", "Counter"), text: n("Annullare una magia in pila: va nel cimitero senza fare effetto.", "Cancel a spell on the stack: it goes to the graveyard without doing anything.") },
  { word: n("Pedina", "Token"), text: n("Un permanente creato da un effetto, senza una carta vera. Se lascia il campo sparisce.", "A permanent created by an effect, with no real card. If it leaves the battlefield it disappears.") },
  { word: n("Prodezza", "Prowess"), text: n("Ogni volta che lanci una magia non creatura, prende +1/+1 fino a fine turno.", "Whenever you cast a noncreature spell, it gets +1/+1 until end of turn.") },
  { word: n("Profetizzare", "Scry"), text: n("Guardi le prime N carte del grimorio e le metti in cima o in fondo nell'ordine che vuoi.", "Look at the top N cards of your library and put them on top or on the bottom in any order.") },
  { word: n("Protezione", "Protection"), text: n("Dal colore o dalla cosa indicata non può essere bersagliata, bloccata, incantata o ferita.", "It can't be targeted, blocked, enchanted or damaged by the stated color or quality.") },
  { word: n("Raggiungere", "Reach"), text: n("Può bloccare creature con volare.", "It can block creatures with flying.") },
  { word: n("Rapidità", "Haste"), text: n("Può attaccare e usare abilità con il simbolo di TAP appena arriva: niente debolezza da evocazione.", "It can attack and use tap abilities right away: no summoning sickness.") },
  { word: n("Sacrificare", "Sacrifice"), text: n("Mettere un tuo permanente nel cimitero per tua scelta. Non è distruzione: indistruttibile non lo salva.", "Put a permanent you control into the graveyard by choice. It isn't destroying: indestructible doesn't save it.") },
  { word: n("Tocco letale", "Deathtouch"), text: n("Anche 1 solo danno inflitto a una creatura basta a distruggerla.", "Any amount of damage it deals to a creature is enough to destroy it.") },
  { word: n("Travolgere", "Trample"), text: n("Se è bloccata, i danni oltre quelli letali per i bloccanti vanno al giocatore.", "If it's blocked, damage beyond what's lethal to the blockers goes to the player.") },
  { word: n("Velo", "Shroud"), text: n("Nessuno può sceglierla come bersaglio, nemmeno tu.", "Nobody can target it, not even you.") },
  { word: n("Volare", "Flying"), text: n("Può essere bloccata solo da creature con volare o raggiungere.", "It can only be blocked by creatures with flying or reach.") },
];

/** Link al regolamento ufficiale completo. */
export const OFFICIAL_RULES_URL = "https://magic.wizards.com/en/rules";
