// Consigli di matchup e piano di sideboard (euristici) a partire dai ruoli
// delle carte e dalle statistiche goldfish.
//
// Tutto è basato su regole trasparenti (velocità relativa, densità di
// rimozioni/counter/spazzavia, presenza di bersagli). Non conosce le sinergie
// specifiche di ogni carta: va letto come punto di partenza ragionato.

import { Deck, DeckEntry } from "./types";
import { SimStats } from "./sim/engine";
import {
  deckColorIdentity,
  deckRoleCounts,
  hosedColors,
  isAntiLifegain,
  isHoser,
  namesWithRole,
  rolesOf,
  topThreats,
} from "./cardRoles";

export interface SideMove {
  card: string;
  qty: number;
  reason: string;
}
export interface SideboardPlan {
  in: SideMove[];
  out: SideMove[];
  note: string;
}
export interface MatchupAdvice {
  summary: string;
  strongPlays: string[];
  watchOut: string[];
  sideboard: SideboardPlan;
}

function fmtList(names: string[], max = 4): string {
  const uniq = [...new Set(names)];
  if (uniq.length === 0) return "";
  if (uniq.length <= max) return uniq.join(", ");
  return uniq.slice(0, max).join(", ") + `, +${uniq.length - max}`;
}

// Profilo grezzo dell'avversario.
type Archetype = "aggro" | "control" | "midrange";
function archetype(stats: SimStats, entries: DeckEntry[]): Archetype {
  const c = deckRoleCounts(entries);
  if (stats.avgOnlineTurn <= 3.2 && c.threats >= 12) return "aggro";
  if (c.counters + c.boardwipes >= 5 && c.threats <= 8) return "control";
  return "midrange";
}

export function adviceFor(
  self: Deck,
  selfStats: SimStats,
  opp: Deck,
  oppStats: SimStats,
): MatchupAdvice {
  const selfC = deckRoleCounts(self.entries);
  const oppC = deckRoleCounts(opp.entries);
  const oppArch = archetype(oppStats, opp.entries);
  const speedGap = oppStats.avgOnlineTurn - selfStats.avgOnlineTurn; // >0 = sei più veloce

  // ---- Sintesi ----
  const speedWord =
    speedGap > 1.2 ? "più veloce" : speedGap < -1.2 ? "più lento" : "di pari passo";
  const summary = `Il tuo mazzo parte in media a T${selfStats.avgOnlineTurn.toFixed(
    1,
  )} contro T${oppStats.avgOnlineTurn.toFixed(
    1,
  )} dell'avversario: sei ${speedWord}. L'avversario sembra un profilo ${oppArch}.`;

  // ---- Giocate forti ----
  const strongPlays: string[] = [];
  if (speedGap > 1.2) {
    strongPlays.push(
      `Sei più veloce (T${selfStats.avgOnlineTurn.toFixed(1)} vs T${oppStats.avgOnlineTurn.toFixed(1)}): imposta l'aggressione, sviluppa minacce sulla curva e spingi danni prima che l'avversario stabilizzi.`,
    );
  } else if (speedGap < -1.2) {
    strongPlays.push(
      `Sei più lento: gioca in reattività, scambia risorse 1-per-1 e porta la partita alle fasi lunghe dove il tuo card advantage conta.`,
    );
  }
  if (selfC.removal > 0 && oppC.threats > 0) {
    const rem = fmtList(namesWithRole(self.entries, "removal"));
    const thr = fmtList(topThreats(opp.entries, 4));
    strongPlays.push(
      `Tieni le tue rimozioni (${rem}) per le minacce chiave dell'avversario (${thr}).`,
    );
  }
  if (selfC.counters > 0 && oppArch !== "aggro") {
    strongPlays.push(
      `Usa i counter (${fmtList(namesWithRole(self.entries, "counter"))}) sulle carte che spostano la partita (spazzavia, bombe, pescate) più che sul primo bersaglio.`,
    );
  }
  if (oppArch === "control" && (selfC.threats > 0 || selfC.discard > 0)) {
    strongPlays.push(
      `Contro il controllo: minacce ridondanti e a prova di spazzavia; se hai discard (${fmtList(
        namesWithRole(self.entries, "discard"),
      ) || "—"}) strappa counter/spazzavia prima di calare la minaccia decisiva.`,
    );
  }
  if (strongPlays.length === 0) {
    strongPlays.push(
      "Matchup equilibrato: gioca in tempo, non sovraestendere e cerca gli scambi di risorse favorevoli.",
    );
  }

  // ---- Attenzione a ----
  const watchOut: string[] = [];
  if (oppC.boardwipes > 0) {
    watchOut.push(
      `Spazzavia avversari (${fmtList(namesWithRole(opp.entries, "boardwipe"))}): non svuotare la mano, sviluppa a ondate.`,
    );
  }
  if (oppC.counters > 0) {
    watchOut.push(
      `Counter avversari (${fmtList(namesWithRole(opp.entries, "counter"))}): gioca attorno ai loro turni di mana aperto.`,
    );
  }
  if (oppC.removal >= 4) {
    watchOut.push(
      `Molte rimozioni (${oppC.removal}): le tue minacce singole cadranno, servono ridondanza o minacce difficili da rimuovere.`,
    );
  }
  if (oppArch === "aggro") {
    watchOut.push(
      `Avversario aggressivo (parte a T${oppStats.avgOnlineTurn.toFixed(1)}): la tua vita è una risorsa, stabilizza in fretta (rimozioni economiche, guadagno vita, spazzavia).`,
    );
  }
  if (watchOut.length === 0)
    watchOut.push("Nessuna minaccia evidente sulla sola lista: gioca standard.");

  // ---- Piano di sideboard ----
  const sideboard = buildSideboardPlan(self, opp, oppArch);

  return { summary, strongPlays, watchOut, sideboard };
}

// Valuta l'utilità di una carta del sideboard contro l'avversario.
function sideUsefulness(
  entry: DeckEntry,
  opp: Deck,
  oppArch: Archetype,
): { score: number; reason: string } | null {
  if (!entry.card) return null;
  const roles = rolesOf(entry.card);
  const oppC = deckRoleCounts(opp.entries);
  const oppColors = deckColorIdentity(opp.entries);
  let score = 0;
  const reasons: string[] = [];

  // Carte-odio ristrette: valgono SOLO nel matchup giusto (colore/anti-lifegain).
  if (isHoser(entry.card)) {
    const hit = hosedColors(entry.card).filter((c) => oppColors.includes(c));
    if (hit.length > 0) {
      score += 6;
      reasons.push(`colpisce specificamente i colori avversari (${hit.join("/")})`);
    }
    if (isAntiLifegain(entry.card) && oppC.lifegain >= 3) {
      score += 5;
      reasons.push("ostacola il guadagno di vita dell'avversario");
    }
    if (score === 0) return null; // odio non pertinente: non entra
    return { score, reason: reasons.join("; ") };
  }

  if (roles.has("artifact-enchant-hate") && oppC.artifactEnchantTargets >= 3) {
    score += 6;
    reasons.push(`l'avversario ha ${oppC.artifactEnchantTargets} tra artefatti/incantesimi`);
  }
  if ((roles.has("removal") || roles.has("creature-removal")) && oppC.threats >= 10) {
    score += 5;
    reasons.push(`molte minacce avversarie (${oppC.threats})`);
  }
  if (roles.has("counter") && oppArch !== "aggro") {
    score += 4;
    reasons.push("l'avversario è lento e ha bersagli importanti da neutralizzare");
  }
  if (roles.has("discard") && oppArch === "control") {
    score += 5;
    reasons.push("contro il controllo lo discard strappa counter/bombe");
  }
  if (roles.has("threat") && oppArch === "control") {
    score += 4;
    reasons.push("minaccia proattiva contro un mazzo reattivo");
  }
  if (roles.has("uncounterable") && oppArch === "control") {
    score += 5;
    reasons.push("non neutralizzabile: passa sopra i counter del controllo");
  }
  if (roles.has("lifegain") && oppArch === "aggro") {
    score += 5;
    reasons.push("guadagno vita contro l'aggro");
  }
  if (roles.has("graveyard-hate") && oppC.usesGraveyard >= 6) {
    score += 5;
    reasons.push(`l'avversario usa il cimitero (${oppC.usesGraveyard} carte)`);
  }
  if (roles.has("boardwipe") && oppArch === "aggro") {
    score += 6;
    reasons.push("spazzavia contro un board aggressivo");
  }

  if (score === 0) return null;
  return { score, reason: reasons.join("; ") };
}

// Valuta quanto una carta del main è "debole" contro l'avversario (da togliere).
function cutScore(entry: DeckEntry, opp: Deck, oppArch: Archetype): number {
  if (!entry.card) return -1;
  const roles = rolesOf(entry.card);
  const oppC = deckRoleCounts(opp.entries);
  let score = 0;
  // Rimozione da creature quasi morta se l'avversario ha poche creature.
  if (roles.has("creature-removal") && oppC.threats <= 4) score += 6;
  // Guadagno vita poco utile contro il controllo.
  if (roles.has("lifegain") && oppArch === "control") score += 4;
  // Counter meno brillanti contro aggro rapidissimo con minacce ridondanti.
  if (roles.has("counter") && oppArch === "aggro") score += 2;
  // Carte molto costose e reattive contro l'aggro veloce.
  if (oppArch === "aggro" && !entry.card.isLand && entry.card.cmc >= 5) score += 3;
  return score;
}

function buildSideboardPlan(
  self: Deck,
  opp: Deck,
  oppArch: Archetype,
): SideboardPlan {
  const side = self.side.filter((e) => e.card);
  if (side.length === 0) {
    return {
      in: [],
      out: [],
      note: "Nessun sideboard inserito per questo mazzo: aggiungi una sezione 'Sideboard' alla lista per ricevere un piano.",
    };
  }

  // Carte da far entrare: le più utili contro l'avversario.
  const scored = side
    .map((e) => {
      const u = sideUsefulness(e, opp, oppArch);
      return u ? { entry: e, ...u } : null;
    })
    .filter((x): x is { entry: DeckEntry; score: number; reason: string } => !!x)
    .sort((a, b) => b.score - a.score);

  const IN: SideMove[] = [];
  let inTotal = 0;
  const MAX_SWAP = 5;
  for (const s of scored) {
    if (inTotal >= MAX_SWAP) break;
    const qty = Math.min(s.entry.quantity, MAX_SWAP - inTotal);
    IN.push({ card: s.entry.card!.name, qty, reason: s.reason });
    inTotal += qty;
  }

  if (inTotal === 0) {
    return {
      in: [],
      out: [],
      note: "Il sideboard attuale non offre carte chiaramente migliori per questo matchup: probabilmente si gioca la stessa lista.",
    };
  }

  // Carte da togliere: le più deboli del main contro l'avversario.
  const cutCandidates = self.entries
    .filter((e) => e.card)
    .map((e) => ({ entry: e, score: cutScore(e, opp, oppArch) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const OUT: SideMove[] = [];
  let outTotal = 0;
  for (const c of cutCandidates) {
    if (outTotal >= inTotal) break;
    const qty = Math.min(c.entry.quantity, inTotal - outTotal);
    OUT.push({
      card: c.entry.card!.name,
      qty,
      reason: cutReason(c.entry, opp, oppArch),
    });
    outTotal += qty;
  }

  // Se non abbiamo trovato abbastanza tagli "cattivi", tagliamo le carte
  // più costose/reattive rimaste (fallback generico).
  if (outTotal < inTotal) {
    const already = new Set(OUT.map((m) => m.card));
    const fallback = self.entries
      .filter((e) => e.card && !e.card.isLand && !already.has(e.card.name))
      .sort((a, b) => (b.card!.cmc ?? 0) - (a.card!.cmc ?? 0));
    for (const e of fallback) {
      if (outTotal >= inTotal) break;
      const qty = Math.min(e.quantity, inTotal - outTotal);
      OUT.push({
        card: e.card!.name,
        qty,
        reason: "taglio di flessibilità per far spazio alle carte in entrata",
      });
      outTotal += qty;
    }
  }

  return {
    in: IN,
    out: OUT,
    note: `Piano automatico contro un profilo ${oppArch}: ${inTotal} dentro / ${outTotal} fuori. Suggerimento indicativo, adatta al tuo stile.`,
  };
}

function cutReason(entry: DeckEntry, opp: Deck, oppArch: Archetype): string {
  const roles = rolesOf(entry.card!);
  const oppC = deckRoleCounts(opp.entries);
  if (roles.has("creature-removal") && oppC.threats <= 4)
    return "rimozione da creatura poco utile: l'avversario ha poche creature";
  if (roles.has("lifegain") && oppArch === "control")
    return "guadagno vita poco rilevante contro il controllo";
  if (roles.has("counter") && oppArch === "aggro")
    return "counter meno incisivo contro l'aggro rapido";
  if (oppArch === "aggro" && entry.card!.cmc >= 5)
    return "troppo lenta contro l'aggressione";
  return "carta debole in questo matchup";
}

// Applica il piano al main per ottenere le entries post-side (per la sim).
export function postSideEntries(deck: Deck, plan: SideboardPlan): DeckEntry[] {
  const map = new Map<string, DeckEntry>();
  for (const e of deck.entries) {
    if (!e.card) continue;
    map.set(e.card.name, { ...e });
  }
  // Togli.
  for (const m of plan.out) {
    const e = map.get(m.card);
    if (!e) continue;
    e.quantity -= m.qty;
    if (e.quantity <= 0) map.delete(m.card);
  }
  // Aggiungi (dal sideboard).
  for (const m of plan.in) {
    const sideEntry = deck.side.find((s) => s.card?.name === m.card);
    if (!sideEntry?.card) continue;
    const existing = map.get(m.card);
    if (existing) existing.quantity += m.qty;
    else map.set(m.card, { quantity: m.qty, name: m.card, card: sideEntry.card });
  }
  return [...map.values()];
}
