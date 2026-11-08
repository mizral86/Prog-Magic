import { useMemo, useState } from "react";
import { parseDecklist, ParsedLine } from "../deckParser";
import { resolveCards } from "../scryfall";
import { CardInfo, Deck, DeckEntry } from "../types";
import { DEFAULT_CONFIG, expandDeck, SimConfig, SimStats } from "../sim/engine";
import { runBattleInWorker, runInWorker } from "../sim/runner";
import { BattleResult, DEFAULT_BATTLE } from "../sim/battle";
import { compareDecks, Comparison } from "../compare";
import { adviceFor, MatchupAdvice, postSideEntries } from "../advice";
import { StatsView, CurveBucket } from "../components/StatsView";
import { Replay } from "../components/Replay";
import { ComparisonView } from "../components/ComparisonView";
import { AdviceView } from "../components/AdviceView";
import { MetricsGlossary } from "../components/MetricsGlossary";
import { BattleResultView } from "../components/BattleResultView";
import { FormatSuggestions } from "../components/FormatSuggestions";
import { SAMPLE_A, SAMPLE_B } from "../sampleDecks";
import { getCompareSlots } from "../compareTray";
import { useDecks } from "../decks";
import { deckToText } from "../deckIO";
import { META, META_UPDATED } from "../metagame";
import { FORMATS, Format } from "../decks";

const FORMAT_LABEL: Record<Format, string> = {
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  pauper: "Pauper",
  legacy: "Legacy",
  vintage: "Vintage",
  commander: "Commander",
};

interface DeckResult {
  deck: Deck;
  stats: SimStats;
  curve: CurveBucket[];
  landCount: number;
  resolvedSize: number;
}

type Status = "idle" | "resolving" | "sim-pre" | "sim-post" | "done" | "error";

function buildDeck(
  name: string,
  parsedMain: ParsedLine[],
  parsedSide: ParsedLine[],
  cards: Map<string, CardInfo>,
): Deck {
  const unresolved: string[] = [];
  let size = 0;
  const toEntry = (l: ParsedLine): DeckEntry => {
    const card = cards.get(l.name.toLowerCase());
    if (!card) unresolved.push(l.name);
    return { quantity: l.quantity, name: l.name, card };
  };
  const entries = parsedMain.map((l) => {
    size += l.quantity;
    return toEntry(l);
  });
  const side = parsedSide.map(toEntry);
  return { name, entries, side, unresolved, size };
}

function computeCurve(deck: Deck): CurveBucket[] {
  const order = ["0", "1", "2", "3", "4", "5", "6", "7+"];
  const buckets = new Map<string, number>(order.map((k) => [k, 0]));
  for (const e of deck.entries) {
    if (!e.card || e.card.isLand) continue;
    const key = e.card.cmc >= 7 ? "7+" : String(Math.floor(e.card.cmc));
    buckets.set(key, (buckets.get(key) ?? 0) + e.quantity);
  }
  return order.map((label) => ({ label, count: buckets.get(label) ?? 0 }));
}

function countLands(deck: Deck): number {
  let n = 0;
  for (const e of deck.entries) if (e.card?.isLand) n += e.quantity;
  return n;
}

function resolvedSize(deck: Deck): number {
  let n = 0;
  for (const e of deck.entries) if (e.card) n += e.quantity;
  return n;
}

function expandEntries(entries: DeckEntry[]): CardInfo[] {
  return expandDeck(
    entries.filter((e) => e.card).map((e) => ({ card: e.card!, quantity: e.quantity })),
  );
}

export default function SimulatorPage() {
  const slots = getCompareSlots();
  const [textA, setTextA] = useState(slots.A?.text ?? SAMPLE_A);
  const [textB, setTextB] = useState(slots.B?.text ?? SAMPLE_B);
  const [nameA, setNameA] = useState(slots.A?.name ?? "Mono-Red Aggro");
  const [nameB, setNameB] = useState(slots.B?.name ?? "Azorius Control");
  const [numGames, setNumGames] = useState(10000);
  const [onPlay, setOnPlay] = useState(true);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);

  const [resultA, setResultA] = useState<DeckResult | null>(null);
  const [resultB, setResultB] = useState<DeckResult | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [postComparison, setPostComparison] = useState<Comparison | null>(null);
  const [adviceA, setAdviceA] = useState<MatchupAdvice | null>(null);
  const [adviceB, setAdviceB] = useState<MatchupAdvice | null>(null);
  const [lookup, setLookup] = useState<Map<string, CardInfo>>(new Map());
  const [simEntries, setSimEntries] = useState<{
    a: DeckEntry[];
    b: DeckEntry[];
  } | null>(null);

  const [battleStatus, setBattleStatus] = useState<
    "idle" | "resolving" | "running" | "done" | "error"
  >("idle");
  const [battleProgress, setBattleProgress] = useState(0);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleError, setBattleError] = useState<string | null>(null);

  const battleBusy = battleStatus === "resolving" || battleStatus === "running";
  const busy =
    status === "resolving" ||
    status === "sim-pre" ||
    status === "sim-post" ||
    battleBusy;

  const statusText = useMemo(() => {
    switch (status) {
      case "resolving":
        return "Risoluzione carte su Scryfall…";
      case "sim-pre":
        return `Simulazione pre-side (${numGames.toLocaleString("it-IT")} partite/mazzo)…`;
      case "sim-post":
        return "Simulazione post-side…";
      case "error":
        return error ?? "Errore.";
      default:
        return "";
    }
  }, [status, error, numGames]);

  async function handleSimulate() {
    setError(null);
    setResultA(null);
    setResultB(null);
    setComparison(null);
    setPostComparison(null);
    setAdviceA(null);
    setAdviceB(null);
    setProgressA(0);
    setProgressB(0);
    setStatus("resolving");

    const pA = parseDecklist(textA);
    const pB = parseDecklist(textB);
    if (pA.main.length === 0 || pB.main.length === 0) {
      setError("Inserisci entrambe le liste (mazzo principale non vuoto).");
      setStatus("error");
      return;
    }

    const allNames = [...pA.main, ...pA.side, ...pB.main, ...pB.side].map(
      (l) => l.name,
    );

    let resolved;
    try {
      resolved = await resolveCards(allNames);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      return;
    }
    setLookup(resolved.cards);

    const deckA = buildDeck(nameA, pA.main, pA.side, resolved.cards);
    const deckB = buildDeck(nameB, pB.main, pB.side, resolved.cards);
    setSimEntries({ a: deckA.entries, b: deckB.entries });

    const expA = expandEntries(deckA.entries);
    const expB = expandEntries(deckB.entries);
    if (expA.length < 7 || expB.length < 7) {
      setError(
        "Troppe poche carte risolte per simulare. Controlla i nomi (vedi carte non trovate).",
      );
      setResultA(mkResult(deckA, undefined));
      setResultB(mkResult(deckB, undefined));
      setStatus("error");
      return;
    }

    const cfg: SimConfig = { ...DEFAULT_CONFIG, numGames, onPlay };

    setStatus("sim-pre");
    let statsA: SimStats, statsB: SimStats;
    try {
      [statsA, statsB] = await Promise.all([
        runInWorker(expA, cfg, setProgressA),
        runInWorker(expB, cfg, setProgressB),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      return;
    }

    setResultA(mkResult(deckA, statsA));
    setResultB(mkResult(deckB, statsB));
    setComparison(compareDecks(deckA.entries, statsA, deckB.entries, statsB));

    const advA = adviceFor(deckA, statsA, deckB, statsB);
    const advB = adviceFor(deckB, statsB, deckA, statsA);
    setAdviceA(advA);
    setAdviceB(advB);

    const hasSidePlan =
      advA.sideboard.in.length > 0 || advB.sideboard.in.length > 0;
    if (hasSidePlan) {
      setStatus("sim-post");
      setProgressA(0);
      setProgressB(0);
      const postAEntries = postSideEntries(deckA, advA.sideboard);
      const postBEntries = postSideEntries(deckB, advB.sideboard);
      try {
        const [postStatsA, postStatsB] = await Promise.all([
          runInWorker(expandEntries(postAEntries), cfg, setProgressA),
          runInWorker(expandEntries(postBEntries), cfg, setProgressB),
        ]);
        setPostComparison(
          compareDecks(postAEntries, postStatsA, postBEntries, postStatsB),
        );
      } catch (e) {
        console.error("Post-side sim fallita:", e);
      }
    }

    setStatus("done");
  }

  async function handleBattle() {
    setBattleError(null);
    setBattleResult(null);
    setBattleProgress(0);
    setBattleStatus("resolving");

    const pA = parseDecklist(textA);
    const pB = parseDecklist(textB);
    if (pA.main.length === 0 || pB.main.length === 0) {
      setBattleError("Inserisci entrambe le liste.");
      setBattleStatus("error");
      return;
    }
    const allNames = [...pA.main, ...pA.side, ...pB.main, ...pB.side].map(
      (l) => l.name,
    );
    let resolved;
    try {
      resolved = await resolveCards(allNames);
    } catch (e) {
      setBattleError(e instanceof Error ? e.message : String(e));
      setBattleStatus("error");
      return;
    }
    setLookup(resolved.cards);
    const deckA = buildDeck(nameA, pA.main, pA.side, resolved.cards);
    const deckB = buildDeck(nameB, pB.main, pB.side, resolved.cards);
    setSimEntries({ a: deckA.entries, b: deckB.entries });
    const expA = expandEntries(deckA.entries);
    const expB = expandEntries(deckB.entries);
    if (expA.length < 7 || expB.length < 7) {
      setBattleError("Troppe poche carte risolte. Controlla i nomi.");
      setBattleStatus("error");
      return;
    }
    setBattleStatus("running");
    try {
      const result = await runBattleInWorker(
        expA,
        expB,
        { ...DEFAULT_BATTLE },
        setBattleProgress,
      );
      setBattleResult(result);
      setBattleStatus("done");
    } catch (e) {
      setBattleError(e instanceof Error ? e.message : String(e));
      setBattleStatus("error");
    }
  }

  function mkResult(deck: Deck, stats: SimStats | undefined): DeckResult {
    return {
      deck,
      stats: stats as SimStats,
      curve: computeCurve(deck),
      landCount: countLands(deck),
      resolvedSize: resolvedSize(deck),
    };
  }

  const haveResults = resultA?.stats && resultB?.stats;

  return (
    <div className="page">
      <h1 className="page-title">Simulazione match</h1>
      <p className="subtitle">
        Incolla due mazzi (con eventuale <span className="mono">Sideboard</span>),
        l'app li risolve su Scryfall e gira migliaia di simulazioni Monte Carlo.
        Poi stima il matchup, spiega i numeri, suggerisce le giocate e un piano
        di sideboard, e mostra un replay illustrato di una partita
        rappresentativa.
      </p>

      <div className="decks-grid">
        <DeckPanel
          title="Mazzo A"
          name={nameA}
          setName={setNameA}
          text={textA}
          setText={setTextA}
          result={resultA}
        />
        <DeckPanel
          title="Mazzo B"
          name={nameB}
          setName={setNameB}
          text={textB}
          setText={setTextB}
          result={resultB}
        />
      </div>

      <div className="controls">
        <button className="primary" onClick={handleSimulate} disabled={busy}>
          {status === "sim-pre" || status === "sim-post" || status === "resolving"
            ? "Simulazione…"
            : "▶ Goldfish"}
        </button>
        <button className="primary" onClick={handleBattle} disabled={busy}>
          {battleBusy ? "In corso…" : "⚔️ Partite reali"}
        </button>
        <label className="field">
          Partite
          <select
            value={numGames}
            onChange={(e) => setNumGames(Number(e.target.value))}
            disabled={busy}
          >
            <option value={1000}>1.000</option>
            <option value={5000}>5.000</option>
            <option value={10000}>10.000</option>
            <option value={50000}>50.000</option>
          </select>
        </label>
        <label className="field">
          <input
            type="checkbox"
            checked={onPlay}
            onChange={(e) => setOnPlay(e.target.checked)}
            disabled={busy}
          />
          In gioco per primo (no pesca T1)
        </label>
        <span className={`status-line ${status === "error" ? "error" : ""}`}>
          {statusText}
        </span>
      </div>

      {(status === "sim-pre" || status === "sim-post") && (
        <div className="progress-wrap">
          <div className="progress">
            <div style={{ width: `${progressA * 100}%` }} />
          </div>
          <div className="progress">
            <div style={{ width: `${progressB * 100}%` }} />
          </div>
        </div>
      )}

      {battleStatus === "error" && (
        <div className="status-line error" style={{ marginTop: 8 }}>
          {battleError}
        </div>
      )}
      {battleBusy && (
        <div className="progress-wrap">
          <div className="progress">
            <div style={{ width: `${battleProgress * 100}%` }} />
          </div>
        </div>
      )}
      {battleResult && (
        <BattleResultView
          result={battleResult}
          nameA={nameA}
          nameB={nameB}
          lookup={lookup}
        />
      )}

      {haveResults && comparison && (
        <>
          <ComparisonView
            comparison={comparison}
            nameA={resultA!.deck.name}
            nameB={resultB!.deck.name}
            title="Confronto pre-side (stima)"
          />
          <div style={{ marginTop: 12 }}>
            <MetricsGlossary />
          </div>
        </>
      )}

      {postComparison && comparison && (
        <ComparisonView
          comparison={postComparison}
          nameA={resultA!.deck.name}
          nameB={resultB!.deck.name}
          title="Confronto post-side (stima)"
          prevProbA={comparison.probAFavored}
        />
      )}

      {haveResults && adviceA && adviceB && (
        <>
          <h2 className="section-title">Suggerimenti & sideboard</h2>
          <p className="section-sub">
            Consigli euristici basati su velocità relativa e ruoli delle carte
            (rimozioni, counter, spazzavia, minacce…). Punto di partenza, non
            oro colato.
          </p>
          <div className="advice-grid">
            <AdviceView
              advice={adviceA}
              selfName={resultA!.deck.name}
              oppName={resultB!.deck.name}
            />
            <AdviceView
              advice={adviceB}
              selfName={resultB!.deck.name}
              oppName={resultA!.deck.name}
            />
          </div>
        </>
      )}

      {haveResults && (
        <div className="results">
          <h2 className="section-title">Statistiche di consistenza</h2>
          <div className="results-grid">
            <div className="panel">
              <h2>{resultA!.deck.name}</h2>
              <StatsView
                stats={resultA!.stats}
                curve={resultA!.curve}
                landCount={resultA!.landCount}
                deckSize={resultA!.resolvedSize}
              />
            </div>
            <div className="panel">
              <h2>{resultB!.deck.name}</h2>
              <StatsView
                stats={resultB!.stats}
                curve={resultB!.curve}
                landCount={resultB!.landCount}
                deckSize={resultB!.resolvedSize}
              />
            </div>
          </div>

          <h2 className="section-title">Replay illustrato (partita media)</h2>
          <div className="results-grid">
            <div className="panel">
              <h2>{resultA!.deck.name}</h2>
              <Replay
                game={resultA!.stats.representativeGame}
                deckName={resultA!.deck.name}
                lookup={lookup}
                keyCmc={resultA!.stats.keyCmc}
              />
            </div>
            <div className="panel">
              <h2>{resultB!.deck.name}</h2>
              <Replay
                game={resultB!.stats.representativeGame}
                deckName={resultB!.deck.name}
                lookup={lookup}
                keyCmc={resultB!.stats.keyCmc}
              />
            </div>
          </div>
        </div>
      )}

      {simEntries && (
        <FormatSuggestions
          entriesA={simEntries.a}
          entriesB={simEntries.b}
          nameA={nameA}
          nameB={nameB}
          lookup={lookup}
        />
      )}

      <div className="footer-note">
        <strong>Come leggere i numeri.</strong> Le simulazioni sono "goldfish":
        ogni mazzo gioca da solo, senza avversario. Misurano consistenza, salute
        del mana e velocità. Il confronto (pre e post-side) è una stima che
        aggiunge l'interazione sulla carta, <em>non</em> una win-rate reale.
        Limiti attuali: il mana include terre e ramp (mana dork/rock e ricerca
        terre) in modo semplificato; le creature-mana non tappano il turno in
        cui entrano; le carte a doppia faccia usano la faccia frontale; i costi
        ibridi contano come generico; i ruoli delle carte sono dedotti dal testo
        (approssimazione). Dati e immagini © Scryfall.
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
interface DeckPanelProps {
  title: string;
  name: string;
  setName: (v: string) => void;
  text: string;
  setText: (v: string) => void;
  result: DeckResult | null;
}

function DeckPanel({ title, name, setName, text, setText, result }: DeckPanelProps) {
  const { decks } = useDecks();
  const sideCount = result
    ? result.deck.side.reduce((s, e) => s + (e.card ? e.quantity : 0), 0)
    : 0;
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="deck-sources">
        <label className="field deck-source">
          Mazzi del meta · {META_UPDATED}
          <select
            value=""
            onChange={(e) => {
              const [f, idx] = e.target.value.split(":");
              const a = META[f as Format]?.[Number(idx)];
              if (a?.deck) {
                setText(a.deck);
                setName(`${a.name} (${FORMAT_LABEL[f as Format]})`);
              }
            }}
          >
            <option value="">— scegli un mazzo del meta —</option>
            {FORMATS.map((f) => (
              <optgroup key={f} label={FORMAT_LABEL[f]}>
                {META[f].map((a, i) =>
                  a.deck ? (
                    <option key={i} value={`${f}:${i}`}>
                      {a.name}
                      {a.share ? ` · ${a.share}` : ""}
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
          </select>
        </label>
        {decks.length > 0 && (
          <label className="field deck-source">
            I miei mazzi
            <select
              value=""
              onChange={(e) => {
                const d = decks.find((x) => x.id === e.target.value);
                if (d) {
                  setText(deckToText(d));
                  setName(d.name);
                }
              }}
            >
              <option value="">— scegli un tuo mazzo —</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <input
        className="deck-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome del mazzo"
      />
      <textarea
        className="deck-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Es.\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n3 Abrade"}
        spellCheck={false}
      />
      {result && (
        <>
          <div className="deck-meta">
            {result.resolvedSize} carte risolte
            {result.deck.size !== result.resolvedSize &&
              ` (su ${result.deck.size} inserite)`}{" "}
            · {result.landCount} terre
            {sideCount > 0 && ` · ${sideCount} sideboard`}
          </div>
          {result.deck.unresolved.length > 0 && (
            <div className="unresolved">
              ⚠️ Non trovate su Scryfall (escluse):{" "}
              {result.deck.unresolved.join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
