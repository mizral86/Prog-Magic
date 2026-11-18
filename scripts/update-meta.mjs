// Aggiorna public/meta.json, i "mazzi del meta" mostrati nell'app.
//
// Gira ogni giorno nella GitHub Action .github/workflows/deploy.yml, ma si può
// lanciare anche a mano:
//
//   node scripts/update-meta.mjs <cartella MTGODecklistCache> <cartella MTGOFormatData>
//
// Fonti (entrambe pubbliche su GitHub, aggiornate ogni giorno):
// - MTGODecklistCache (github.com/Jiliac/MTGODecklistCache): tutte le liste
//   dei tornei MTGO (Challenge, League 5-0, qualificazioni) e di molti tornei
//   cartacei pubblicati su melee.gg.
// - MTGOFormatData (github.com/Badaro/MTGOFormatData): le regole per
//   riconoscere l'archetipo di ogni lista (es. "Dimir Midrange"), le stesse
//   usate dai siti di metagame. Qui sotto c'è una copia in JavaScript del
//   riconoscitore originale (MTGOArchetypeParser, in C#).
//
// Per ogni formato conta gli archetipi delle liste degli ultimi N giorni,
// calcola la quota di metagame e sceglie come lista d'esempio il miglior
// piazzamento più recente. Commander viene da EDHREC (comandanti più usati del
// mese); se EDHREC non risponde resta l'elenco precedente.
//
// Se una fonte manca o i dati sono troppo pochi, il formato tiene i dati di
// prima: il file non viene mai svuotato.

import fs from "node:fs";
import path from "node:path";

const [decksRoot, formatsRoot] = process.argv.slice(2);
if (!decksRoot || !formatsRoot) {
  console.error("Uso: node scripts/update-meta.mjs <MTGODecklistCache> <MTGOFormatData>");
  process.exit(1);
}

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/meta.json");
const TOP = 8; // archetipi mostrati per formato
const MIN_DECKS = 30; // sotto questa soglia il formato non viene toccato

/** Formato dell'app → cartella in MTGOFormatData, giorni considerati. */
const FORMATS = {
  standard: { dir: "Standard", label: "Standard", days: 14 },
  pioneer: { dir: "Pioneer", label: "Pioneer", days: 30 },
  modern: { dir: "Modern", label: "Modern", days: 30 },
  pauper: { dir: "Pauper", label: "Pauper", days: 30 },
  legacy: { dir: "Legacy", label: "Legacy", days: 30 },
  vintage: { dir: "Vintage", label: "Vintage", days: 30 },
};

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_LUNGHI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const readJson = (p) => JSON.parse(stripBom(fs.readFileSync(p, "utf8")));

/** Le regole sono scritte a mano: tollero virgole finali e commenti come il parser originale. */
function readLoose(p) {
  const text = stripBom(fs.readFileSync(p, "utf8"));
  try {
    return JSON.parse(text);
  } catch {
    const fixed = text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(fixed);
    } catch {
      console.warn(`File di regole non leggibile, lo salto: ${p}`);
      return {};
    }
  }
}

// --- Riconoscimento archetipi (porting di MTGOArchetypeParser) --------------

const COLOR_NAMES = {
  W: "Mono White", U: "Mono Blue", B: "Mono Black", R: "Mono Red", G: "Mono Green",
  WU: "Azorius", WB: "Orzhov", WR: "Boros", WG: "Selesnya", UB: "Dimir",
  UR: "Izzet", UG: "Simic", BR: "Rakdos", BG: "Golgari", RG: "Gruul",
  WUB: "Esper", WUR: "Jeskai", WUG: "Bant", WBR: "Mardu", WBG: "Abzan",
  WRG: "Naya", UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
  WUBR: "WUBR", WUBG: "WUBG", WURG: "WURG", WBRG: "WBRG", UBRG: "UBRG",
  WUBRG: "5 Color",
};

function loadFormat(dir) {
  const base = path.join(formatsRoot, "Formats");
  const lands = new Map();
  const nonLands = new Map();
  for (const file of [path.join(base, "card_colors.json"), path.join(base, dir, "color_overrides.json")]) {
    if (!fs.existsSync(file)) continue;
    const j = readLoose(file);
    for (const c of j.Lands ?? []) lands.set(c.Name, c.Color);
    for (const c of j.NonLands ?? []) nonLands.set(c.Name, c.Color);
  }
  const specific = [];
  const generic = [];
  const archDir = path.join(base, dir, "Archetypes");
  for (const f of fs.readdirSync(archDir).filter((f) => f.endsWith(".json")).sort()) {
    const a = readLoose(path.join(archDir, f));
    if (a.Conditions?.length) specific.push(a);
  }
  const fbDir = path.join(base, dir, "Fallbacks");
  if (fs.existsSync(fbDir)) {
    for (const f of fs.readdirSync(fbDir).filter((f) => f.endsWith(".json")).sort()) {
      const a = readLoose(path.join(fbDir, f));
      if (a.CommonCards?.length) generic.push(a);
    }
  }
  return { lands, nonLands, specific, generic };
}

function deckColor(main, side, fmt) {
  const inLands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const inSpells = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of [...main, ...side]) {
    for (const col of fmt.lands.get(c.CardName) ?? "") if (col in inLands) inLands[col] += c.Count;
    for (const col of fmt.nonLands.get(c.CardName) ?? "") if (col in inSpells) inSpells[col] += c.Count;
  }
  const out = "WUBRG".split("").filter((k) => inLands[k] > 0 && inSpells[k] > 0).join("");
  return out || "C";
}

function test(main, side, arch) {
  const has = (list, name) => list.some((c) => c.CardName === name);
  const count = (list, names) => list.filter((c) => names.includes(c.CardName)).length;
  for (const cond of arch.Conditions ?? []) {
    const cards = cond.Cards;
    if (!cards?.length) continue;
    const first = cards[0];
    switch (cond.Type) {
      case "InMainboard": if (!has(main, first)) return false; break;
      case "InSideboard": if (!has(side, first)) return false; break;
      case "InMainOrSideboard": if (!has(main, first) && !has(side, first)) return false; break;
      case "OneOrMoreInMainboard": if (count(main, cards) < 1) return false; break;
      case "OneOrMoreInSideboard": if (count(side, cards) < 1) return false; break;
      case "OneOrMoreInMainOrSideboard": if (count(main, cards) + count(side, cards) < 1) return false; break;
      case "TwoOrMoreInMainboard": if (count(main, cards) < 2) return false; break;
      case "TwoOrMoreInSideboard": if (count(side, cards) < 2) return false; break;
      case "TwoOrMoreInMainOrSideboard": if (count(main, cards) + count(side, cards) < 2) return false; break;
      case "DoesNotContain": if (has(main, first) || has(side, first)) return false; break;
      case "DoesNotContainMainboard": if (has(main, first)) return false; break;
      case "DoesNotContainSideboard": if (has(side, first)) return false; break;
      default: return false; // regola sconosciuta: meglio non indovinare
    }
  }
  return true;
}

function archName(arch, color) {
  let name = arch.Name.replace("Generic", "");
  if (arch.IncludeColorInName) name = (COLOR_NAMES[color] ?? "") + name;
  // "MonoRedProwess" → "Mono Red Prowess" (come l'originale)
  name = name
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[^A-Z])(?=[A-Z])|(?<=[A-Za-z])(?=[^A-Za-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name;
}

/** Nome dell'archetipo, o null se non riconosciuto o ambiguo. */
function detect(main, side, fmt) {
  const color = deckColor(main, side, fmt);
  const matches = [];
  for (const arch of fmt.specific) {
    if (!test(main, side, arch)) continue;
    const variant = (arch.Variants ?? []).find((v) => test(main, side, v));
    const complexity = arch.Conditions.length + (variant ? variant.Conditions.length : 0);
    matches.push({ name: archName(variant ?? arch, color), complexity });
  }
  if (matches.length > 0) {
    // Più regole valide: vince la più semplice (ConflictSolvingMode.PreferSimpler).
    matches.sort((a, b) => a.complexity - b.complexity);
    return matches[0].name;
  }
  // Nessuna regola specifica: archetipo "generico" con più carte in comune.
  let best = null;
  let bestWeight = 0;
  for (const g of fmt.generic) {
    let w = 0;
    for (const c of [...main, ...side]) if (g.CommonCards.includes(c.CardName)) w += c.Count;
    if (w > bestWeight || (w === bestWeight && w > 0 && g.CommonCards.length < best.CommonCards.length)) {
      best = g;
      bestWeight = w;
    }
  }
  if (best && bestWeight / (main.length + side.length) > 0.1) return archName(best, color);
  return null;
}

// --- Lettura dei tornei -------------------------------------------------------

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".json")) yield p;
  }
}

function loadTournaments(since) {
  const out = [];
  for (const file of walk(path.join(decksRoot, "Tournaments"))) {
    // Il percorso contiene la data: .../AAAA/MM/GG/nome.json
    const m = file.match(/(\d{4})[\\/](\d{2})[\\/](\d{2})[\\/][^\\/]+$/);
    if (!m) continue;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (date < since) continue;
    let t;
    try {
      t = readJson(file);
    } catch {
      continue;
    }
    if (!Array.isArray(t.Decks) || t.Decks.length === 0) continue;
    const site = file.includes("mtgo.com") ? "mtgo" : "paper";
    out.push({ date, site, info: t.Tournament ?? {}, decks: t.Decks, standings: t.Standings ?? [] });
  }
  return out;
}

function formatOf(t) {
  const f = String(t.info.Formats ?? "").toLowerCase();
  if (f) return f;
  // Alcuni file non hanno il formato: lo prendo dal nome del torneo.
  const n = String(t.info.Name ?? "").toLowerCase();
  return Object.keys(FORMATS).find((k) => n.startsWith(k)) ?? "";
}

/** "1st Place" → 1, "5-0" → 0 (League: lista vincente ma senza posizione). */
function placeOf(result) {
  const m = String(result ?? "").match(/^(\d+)(st|nd|rd|th)/i);
  return m ? Number(m[1]) : null;
}

function itDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESI[m - 1]} ${y}`;
}

function resultLabel(deck, t) {
  const place = placeOf(deck.Result);
  const st = t.standings.find((s) => s.Player === deck.Player);
  const record = st && st.Wins != null ? ` (${st.Wins}-${st.Losses}${st.Draws ? "-" + st.Draws : ""})` : "";
  if (place != null) return `${place}°${record}`;
  return String(deck.Result ?? "").trim();
}

function deckText(deck) {
  const line = (c) => `${c.Count} ${c.CardName}`;
  const main = (deck.Mainboard ?? []).map(line);
  const side = (deck.Sideboard ?? []).map(line);
  return side.length ? [...main, "Sideboard", ...side].join("\n") : main.join("\n");
}

/** Punteggio per scegliere la lista d'esempio: piazzamento migliore, poi più recente. */
function deckScore(e) {
  const place = placeOf(e.deck.Result);
  const isLeague = /^5-0$/.test(String(e.deck.Result ?? "").trim());
  // 1° = 100, 8° = 93, 5-0 in League = 90, altro = 50; MTGO un filo davanti.
  const base = place != null ? Math.max(60, 101 - place) : isLeague ? 90 : 50;
  return base + (e.t.site === "mtgo" ? 0.5 : 0);
}

const pct = (x) => (x * 100).toFixed(1).replace(".", ",") + "%";

function buildFormat(key, tournaments, today) {
  const cfg = FORMATS[key];
  const since = new Date(today.getTime() - cfg.days * 86400000).toISOString().slice(0, 10);
  const fmt = loadFormat(cfg.dir);
  const byArch = new Map();
  let total = 0;
  for (const t of tournaments) {
    if (t.date < since || formatOf(t) !== key) continue;
    for (const deck of t.decks) {
      const main = deck.Mainboard ?? [];
      const side = deck.Sideboard ?? [];
      if (main.length === 0) continue;
      total++;
      const name = detect(main, side, fmt);
      if (!name) continue;
      if (!byArch.has(name)) byArch.set(name, []);
      byArch.get(name).push({ deck, t });
    }
  }
  if (total < MIN_DECKS) return null;

  const archetypes = [...byArch.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, TOP)
    .map(([name, list]) => {
      // Lista d'esempio: tra le liste degli ultimi 7 giorni dell'archetipo
      // (o tutte, se non ce ne sono) quella col piazzamento migliore.
      const recentLimit = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const recent = list.filter((e) => e.t.date >= recentLimit);
      const pool = recent.length ? recent : list;
      const best = [...pool].sort(
        (a, b) => deckScore(b) - deckScore(a) || b.t.date.localeCompare(a.t.date),
      )[0];
      return {
        name,
        share: pct(list.length / total),
        source: `${best.deck.Player}, ${best.t.info.Name ?? "torneo"}, ${itDate(best.t.date)}, ${resultLabel(best.deck, best.t)}`,
        deck: deckText(best.deck),
      };
    });

  return {
    source: `MTGO e tornei cartacei (melee.gg), ultimi ${cfg.days} giorni · ${total} liste`,
    archetypes,
  };
}

// --- Commander da EDHREC --------------------------------------------------------

async function buildCommander() {
  try {
    const res = await fetch("https://json.edhrec.com/pages/commanders/month.json", {
      headers: { "User-Agent": "menga-magic-meta-updater", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`EDHREC ${res.status}`);
    const j = await res.json();
    const lists = j?.container?.json_dict?.cardlists ?? [];
    const views = lists.flatMap((l) => l.cardviews ?? []);
    const top = views
      .filter((v) => v && typeof v.name === "string")
      .slice(0, TOP)
      .map((v) => {
        const n = Number(v.num_decks ?? v.inclusion ?? 0);
        return {
          name: v.name,
          note: n > 0 ? `comandante · ${n.toLocaleString("it-IT")} mazzi su EDHREC` : "comandante",
          deck: `Commander\n1 ${v.name}`,
        };
      });
    if (top.length < 3) throw new Error("EDHREC: elenco vuoto");
    return { source: "EDHREC, comandanti più usati nell'ultimo mese", archetypes: top };
  } catch (err) {
    console.warn(`Commander non aggiornato: ${err.message}`);
    return null;
  }
}

// --- Main -----------------------------------------------------------------------

const today = new Date();
const todayIso = today.toISOString().slice(0, 10);
const old = fs.existsSync(OUT) ? readJson(OUT) : { formats: {} };
const maxDays = Math.max(...Object.values(FORMATS).map((f) => f.days));
const since = new Date(today.getTime() - maxDays * 86400000).toISOString().slice(0, 10);
const tournaments = loadTournaments(since);
console.log(`Tornei letti dal ${since}: ${tournaments.length}`);

const formats = { ...old.formats };
const changed = [];
for (const key of Object.keys(FORMATS)) {
  let f = null;
  try {
    f = buildFormat(key, tournaments, today);
  } catch (err) {
    console.warn(`${key}: errore (${err.message}), tengo i dati precedenti.`);
    continue;
  }
  if (!f) {
    console.warn(`${key}: troppo poche liste, tengo i dati precedenti.`);
    continue;
  }
  formats[key] = f;
  changed.push(key);
  console.log(`${key}: ${f.source}`);
  for (const a of f.archetypes) console.log(`   ${a.share.padStart(6)}  ${a.name}`);
}
const commander = await buildCommander();
if (commander) {
  formats.commander = commander;
  changed.push("commander");
}

if (changed.length === 0) {
  console.error("Nessun formato aggiornato: meta.json resta com'è.");
  process.exit(0);
}

// La data cambia solo se cambiano i mazzi, così l'app non scarica di nuovo
// un file identico.
const sameData = JSON.stringify(old.formats) === JSON.stringify(formats);
const [y, m, d] = todayIso.split("-").map(Number);
const out = {
  updated: sameData ? old.updated : todayIso,
  updatedLabel: sameData ? old.updatedLabel : `${d} ${MESI_LUNGHI[m - 1]} ${y}`,
  formats,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(sameData ? "Nessuna novità nei mazzi." : `Scritto ${OUT} (${out.updatedLabel}).`);
