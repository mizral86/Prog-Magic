// Gioca > Impara: tutorial sul regolamento a lezioni brevi, con esempi animati
// su carte inventate e un piccolo quiz. I testi stanno in learn/lessons.ts in
// italiano e inglese: qui si mostra direttamente la lingua scelta, quindi la
// parte del tutorial è esclusa dal traduttore automatico (translate="no").
//
// Il progresso sta in localStorage "pm.learn.v1" (va sul profilo con il resto).

import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { getLang } from "../i18n";
import {
  CardColor,
  GLOSSARY,
  Lesson,
  LESSONS,
  OFFICIAL_RULES_URL,
  Quiz,
  Scene,
  SceneCard,
  Step,
  T,
} from "../learn/lessons";
import { ManaSymbol } from "./ManaSymbol";

const KEY = "pm.learn.v1";
const EN = getLang() === "en";
const L = (t: T) => (EN ? t[1] : t[0]);
const ui = (it: string, en: string) => (EN ? en : it);

interface Progress {
  done: string[];
}

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (p && Array.isArray(p.done)) return { done: p.done.filter((x: unknown) => typeof x === "string") };
  } catch {
    /* niente progresso salvato */
  }
  return { done: [] };
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignora */
  }
}

/** **grassetto** → <b>. */
function rich(s: string): ReactNode {
  return s.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>));
}

export function Learn({ start }: { start?: string | null }) {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [openId, setOpenId] = useState<string | null>(() =>
    start && LESSONS.some((l) => l.id === start) ? start : null,
  );

  useEffect(() => {
    if (start && LESSONS.some((l) => l.id === start)) setOpenId(start);
  }, [start]);

  const lesson = LESSONS.find((l) => l.id === openId) ?? null;

  function complete(id: string) {
    const next = { done: progress.done.includes(id) ? progress.done : [...progress.done, id] };
    setProgress(next);
    saveProgress(next);
    const idx = LESSONS.findIndex((l) => l.id === id);
    setOpenId(null);
    // Torna all'elenco con la lezione successiva in vista.
    requestAnimationFrame(() =>
      document.getElementById(`learn-${LESSONS[idx + 1]?.id ?? id}`)?.scrollIntoView({ block: "center" }),
    );
  }

  return (
    <div className="learn" translate="no">
      {lesson ? (
        <LessonView key={lesson.id} lesson={lesson} onClose={() => setOpenId(null)} onDone={() => complete(lesson.id)} />
      ) : (
        <LessonList done={progress.done} onOpen={setOpenId} onReset={() => {
          const p = { done: [] };
          setProgress(p);
          saveProgress(p);
        }} />
      )}
    </div>
  );
}

function LessonList({ done, onOpen, onReset }: { done: string[]; onOpen: (id: string) => void; onReset: () => void }) {
  const count = LESSONS.filter((l) => done.includes(l.id)).length;
  const next = LESSONS.find((l) => !done.includes(l.id))?.id;
  return (
    <>
      <div className="learn-progress">
        <span className="muted small">
          {count === LESSONS.length
            ? ui("Hai completato tutte le lezioni! 🎉", "You've completed every lesson! 🎉")
            : ui(`Il tuo percorso: ${count} lezioni su ${LESSONS.length}`, `Your progress: ${count} of ${LESSONS.length} lessons`)}
        </span>
        <div className="learn-bar">
          <i style={{ width: `${(count / LESSONS.length) * 100}%` }} />
        </div>
      </div>
      <div className="learn-list">
        {LESSONS.map((l, i) => {
          const isDone = done.includes(l.id);
          return (
            <button
              key={l.id}
              id={`learn-${l.id}`}
              className={`learn-item${l.id === next ? " next" : ""}`}
              onClick={() => onOpen(l.id)}
            >
              <span className="learn-icon">{l.icon}</span>
              <span className="learn-item-text">
                <span className="learn-item-title">
                  {i + 1}. {L(l.title)}
                </span>
                <span className="learn-item-sub">{L(l.sub)}</span>
              </span>
              <span className={`learn-item-end${isDone ? " ok" : ""}`}>
                {isDone ? "✓" : l.id === next ? "▶" : `${l.minutes} min`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted small learn-foot">
        {ui(
          "Riassunto non ufficiale scritto per quest'app: in caso di dubbio vale il ",
          "Unofficial summary written for this app: when in doubt, the ",
        )}
        <a href={OFFICIAL_RULES_URL} target="_blank" rel="noreferrer">
          {ui("regolamento completo (in inglese)", "comprehensive rules")}
        </a>
        {ui(".", " apply.")}
        {count > 0 && (
          <>
            {" "}
            <button className="linklike" onClick={onReset}>
              {ui("Ricomincia da capo", "Start over")}
            </button>
          </>
        )}
      </p>
    </>
  );
}

function LessonView({ lesson, onClose, onDone }: { lesson: Lesson; onClose: () => void; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const step = lesson.steps[idx];
  const last = idx === lesson.steps.length - 1;

  useEffect(() => {
    document.querySelector(".learn")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [idx]);

  return (
    <div className="learn-lesson">
      <div className="learn-head">
        <button className="linklike" onClick={onClose}>
          ‹ {ui("Lezioni", "Lessons")}
        </button>
        <span className="muted small">
          {lesson.icon} {L(lesson.title)} · {ui("passo", "step")} {idx + 1} {ui("di", "of")} {lesson.steps.length}
        </span>
      </div>
      <StepView key={`${lesson.id}-${idx}`} step={step} />
      <div className="learn-nav">
        <button onClick={() => (idx === 0 ? onClose() : setIdx(idx - 1))}>‹ {ui("Indietro", "Back")}</button>
        <button className="primary" onClick={() => (last ? onDone() : setIdx(idx + 1))}>
          {last ? ui("Fine ✓", "Done ✓") : ui("Avanti ›", "Next ›")}
        </button>
      </div>
      {lesson.steps.length > 1 && (
        <div className="learn-dots">
          {lesson.steps.map((_, i) => (
            <button
              key={i}
              className={i === idx ? "on" : ""}
              onClick={() => setIdx(i)}
              aria-label={`${ui("Passo", "Step")} ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StepView({ step }: { step: Step }) {
  return (
    <>
      <div className="panel learn-card">
        <h2>{L(step.title)}</h2>
        <p>{rich(L(step.body))}</p>
      </div>
      {step.scene && <SceneView scene={step.scene} />}
      {step.glossary && <Glossary />}
      {step.quiz && <QuizView quiz={step.quiz} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Esempio animato

interface Shown {
  cards: [string, SceneCard][];
  life?: [number, number];
  mana?: string;
}

function frameState(scene: Scene, upTo: number): Shown {
  const cards: Record<string, SceneCard> = {};
  for (const [id, c] of Object.entries(scene.cards)) cards[id] = { ...c };
  let life: [number, number] | undefined;
  let mana: string | undefined;
  for (let i = 0; i <= upTo; i++) {
    const f = scene.frames[i];
    for (const [id, patch] of Object.entries(f.set ?? {})) cards[id] = { ...cards[id], ...patch };
    if (f.life) life = f.life;
    if (f.mana !== undefined) mana = f.mana;
  }
  return { cards: Object.entries(cards), life, mana };
}

const FRAME_MS = 1900;

function SceneView({ scene }: { scene: Scene }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastFrame = scene.frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (frame >= lastFrame) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setFrame((f) => f + 1), FRAME_MS);
    return () => window.clearTimeout(t);
  }, [playing, frame, lastFrame]);

  const shown = useMemo(() => frameState(scene, frame), [scene, frame]);

  function play() {
    if (frame >= lastFrame) setFrame(0);
    setPlaying(true);
  }

  return (
    <div className="learn-scene">
      <div className="learn-table" onClick={() => !playing && frame < lastFrame && setFrame(frame + 1)}>
        <div className="learn-midline" />
        {scene.stack && <div className="learn-stack-zone">{ui("Pila", "Stack")}</div>}
        {shown.life && (
          <>
            <span className="learn-life opp">
              {ui("Avversario", "Opponent")} <b>{shown.life[0]}</b>
            </span>
            <span className="learn-life me">
              {ui("Tu", "You")} <b>{shown.life[1]}</b>
            </span>
          </>
        )}
        {shown.mana && (
          <span className="learn-mana">
            {shown.mana.split("").map((s, i) => (
              <ManaSymbol key={i} sym={s} size={18} />
            ))}
          </span>
        )}
        {shown.cards.map(([id, c]) => (
          <FakeCard key={id} card={c} />
        ))}
      </div>
      <div className="learn-scene-bar">
        <span className="learn-caption">{L(scene.frames[frame].caption)}</span>
        <button className="learn-play" onClick={play} disabled={playing}>
          {playing ? "…" : frame >= lastFrame ? `↺ ${ui("Rivedi", "Replay")}` : `▶ ${ui("Guarda", "Play")}`}
        </button>
      </div>
    </div>
  );
}

const COLOR_CLASS: Record<CardColor, string> = {
  W: "w",
  U: "u",
  B: "b",
  R: "r",
  G: "g",
  C: "c",
  land: "land",
};

function FakeCard({ card }: { card: SceneCard }) {
  const cls = [
    "learn-fcard",
    `fc-${COLOR_CLASS[card.color]}`,
    card.tapped ? "tapped" : "",
    card.glow ? "glow" : "",
    card.gone || card.hidden ? "gone" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const dead = card.pt && card.dmg ? card.dmg >= Number(card.pt.split("/")[1]) : false;
  return (
    <div className={cls} style={{ left: `${card.x}%`, top: `${card.y}%` }}>
      <span className="fc-name">{L(card.name)}</span>
      {card.color === "land" && <span className="fc-land-icon">⛰</span>}
      {card.sick && <span className="fc-sick">💤</span>}
      {card.note && <span className="fc-note">{card.note}</span>}
      {!!card.dmg && <span className={`fc-dmg${dead ? " dead" : ""}`}>−{card.dmg}</span>}
      {card.pt && <span className="fc-pt">{card.pt}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz e glossario

function QuizView({ quiz }: { quiz: Quiz }) {
  const [picked, setPicked] = useState<number | null>(null);
  // Le risposte in ordine sparso, così quella giusta non è sempre la prima.
  const order = useMemo(() => {
    const o = quiz.options.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  }, [quiz]);
  const right = picked === quiz.correct;
  return (
    <div className="panel learn-quiz">
      <p>
        <b>{ui("Quiz:", "Quiz:")}</b> {L(quiz.q)}
      </p>
      {order.map((i) => (
        <button
          key={i}
          className={`learn-opt${picked === i ? (right ? " yes" : " no") : ""}`}
          onClick={() => !right && setPicked(i)}
        >
          {picked === i ? (right ? "✓ " : "✗ ") : ""}
          {L(quiz.options[i])}
        </button>
      ))}
      {picked !== null && (
        <p className={`learn-why ${right ? "yes" : "no"}`}>
          {right ? `👍 ${ui("Esatto!", "Correct!")} ${L(quiz.why)}` : ui("Non proprio: riprova.", "Not quite: try again.")}
        </p>
      )}
    </div>
  );
}

function Glossary() {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = useMemo(() => {
    const k = norm(q.trim());
    return GLOSSARY.filter((g) => !k || norm(`${g.word[0]} ${g.word[1]} ${L(g.text)}`).includes(k)).sort((a, b) =>
      L(a.word).localeCompare(L(b.word)),
    );
  }, [q]);
  return (
    <div className="panel learn-gloss">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={ui("Cerca una parola chiave…", "Search a keyword…")}
      />
      <dl>
        {list.map((g) => (
          <Fragment key={g.word[0]}>
            <dt>
              {L(g.word)}
              {EN ? "" : <span className="muted small"> · {g.word[1]}</span>}
            </dt>
            <dd>{L(g.text)}</dd>
          </Fragment>
        ))}
        {list.length === 0 && <p className="muted small">{ui("Nessuna parola trovata.", "No keyword found.")}</p>}
      </dl>
    </div>
  );
}
