// Segnapunti a tutto schermo per giocare dal vivo con un solo telefono al
// centro del tavolo. Ogni riquadro è girato verso chi lo usa: tocco sulla metà
// sinistra = −1, sulla destra = +1, tenendo premuto continua a contare.
// Il medaglione al centro apre dadi, moneta, chi inizia e nuova partita.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  addCmdDamage,
  addCounter,
  addLife,
  COUNTERS,
  LcGame,
  LcPlayer,
  lossReason,
  resetGame,
  seatsFor,
} from "../lifeCounter";

interface Props {
  game: LcGame;
  onChange: (g: LcGame) => void;
  onClose: () => void;
}

type Roll = { title: string; value: string; sub?: string };

const HOLD_MS = 420;
const REPEAT_MS = 110;

export function LifeCounter({ game, onChange, onClose }: Props) {
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [spin, setSpin] = useState<string | null>(null); // riquadro illuminato durante "chi inizia"
  const [starter, setStarter] = useState<string | null>(null); // badge "Inizi tu"
  const [panel, setPanel] = useState<string | null>(null); // segnalini aperti
  const gameRef = useRef(game);
  gameRef.current = game;

  // Funzione stabile per i tocchi ripetuti (lo stato cambia mentre si tiene premuto).
  const apply = (f: (g: LcGame) => LcGame) => onChange(f(gameRef.current));

  useEffect(() => {
    document.body.classList.add("tt-lock");
    return () => document.body.classList.remove("tt-lock");
  }, []);

  // Schermo sempre acceso finché il segnapunti è aperto.
  useEffect(() => {
    type WL = { release: () => Promise<void> };
    let lock: WL | null = null;
    let alive = true;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WL> } };
    const ask = () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      nav.wakeLock
        .request("screen")
        .then((l) => {
          if (alive) lock = l;
          else void l.release();
        })
        .catch(() => undefined);
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!starter) return;
    const t = window.setTimeout(() => setStarter(null), 4000);
    return () => window.clearTimeout(t);
  }, [starter]);

  const { cols, rows, seats } = seatsFor(game.players.length, game.rotate);
  const pairs = Math.floor(game.players.length / 2);
  // Il medaglione sta su un incrocio tra riquadri, mai sopra a un nome.
  const n = game.players.length;
  const hubTop =
    n <= 2 ? 50 : ((n % 2 === 1 ? pairs : Math.floor(pairs / 2)) / rows) * 100;

  function pickFirst() {
    setMenu(false);
    const ids = game.players.map((p) => p.id);
    const winner = ids[Math.floor(Math.random() * ids.length)];
    // Giro di luce sui riquadri che rallenta e si ferma sul prescelto.
    const steps = ids.length * 3 + ids.indexOf(winner) + 1;
    let i = 0;
    const tick = () => {
      setSpin(ids[i % ids.length]);
      i++;
      if (i < steps) window.setTimeout(tick, 70 + i * i * 1.4);
      else
        window.setTimeout(() => {
          setSpin(null);
          setStarter(winner);
          apply((g) => ({ ...g, first: winner }));
        }, 500);
    };
    tick();
  }

  function dice(sides: number) {
    setMenu(false);
    const v = 1 + Math.floor(Math.random() * sides);
    setRoll({ title: `Dado da ${sides}`, value: String(v) });
  }

  function coin() {
    setMenu(false);
    setRoll({ title: "Moneta", value: Math.random() < 0.5 ? "Testa" : "Croce" });
  }

  return (
    <div className="lc">
      <div
        className="lc-board"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {game.players.map((p, i) => (
          <Tile
            key={p.id}
            p={p}
            game={game}
            seat={seats[i]}
            lit={spin === p.id}
            starter={starter === p.id}
            panelOpen={panel === p.id}
            onPanel={(o) => setPanel(o ? p.id : null)}
            apply={apply}
          />
        ))}
      </div>

      <button
        className="lc-hub"
        style={{ top: `${hubTop}%` }}
        onClick={() => {
          setMenu(true);
          setConfirmReset(false);
        }}
        aria-label="Menu del segnapunti"
      >
        <span className="lc-hub-gem">✦</span>
      </button>

      {menu && (
        <div className="lc-veil" onClick={() => setMenu(false)}>
          <div className="lc-menu" onClick={(e) => e.stopPropagation()}>
            <div className="lc-menu-title">Segnapunti</div>
            <div className="lc-menu-grid">
              <button onClick={pickFirst}>
                <span>👑</span>Chi inizia?
              </button>
              <button onClick={coin}>
                <span>🪙</span>Moneta
              </button>
              <button onClick={() => dice(6)}>
                <span>🎲</span>Dado da 6
              </button>
              <button onClick={() => dice(20)}>
                <span>🔷</span>Dado da 20
              </button>
            </div>
            <button
              className={`lc-menu-wide ${confirmReset ? "danger" : ""}`}
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true);
                apply(resetGame);
                setPanel(null);
                setMenu(false);
              }}
            >
              {confirmReset
                ? `Sicuro? Tutti tornano a ${game.startLife}`
                : `↺ Nuova partita (vita ${game.startLife})`}
            </button>
            <button className="lc-menu-wide" onClick={onClose}>
              ⚙ Giocatori e impostazioni
            </button>
            <button className="lc-menu-wide ghost" onClick={() => setMenu(false)}>
              Torna alla partita
            </button>
          </div>
        </div>
      )}

      {roll && (
        <div className="lc-veil" onClick={() => setRoll(null)}>
          <div className="lc-roll" key={roll.value + Math.random()}>
            <div className="lc-roll-title">{roll.title}</div>
            <div className="lc-roll-value">{roll.value}</div>
            <div className="lc-roll-hint">tocca per chiudere</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TileProps {
  p: LcPlayer;
  game: LcGame;
  seat: { col: string; row: string; rot: number };
  lit: boolean;
  starter: boolean;
  panelOpen: boolean;
  onPanel: (open: boolean) => void;
  apply: (f: (g: LcGame) => LcGame) => void;
}

function Tile({ p, game, seat, lit, starter, panelOpen, onPanel, apply }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 180, h: 300 });
  const [delta, setDelta] = useState<{ v: number; at: number } | null>(null);
  const hold = useRef<{ t: number; r: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!delta) return;
    const t = window.setTimeout(() => setDelta(null), 1800);
    return () => window.clearTimeout(t);
  }, [delta]);

  useEffect(() => () => stopHold(), []);

  const sideways = seat.rot === 90 || seat.rot === 270;
  const w = sideways ? box.h : box.w;
  const h = sideways ? box.w : box.h;
  const big = Math.round(Math.max(36, Math.min(h * 0.46, w * 0.3, 150)));

  function bump(d: number) {
    apply((g) => addLife(g, p.id, d));
    setDelta((cur) => ({ v: (cur && Date.now() - cur.at < 1800 ? cur.v : 0) + d, at: Date.now() }));
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function startHold(d: number) {
    stopHold();
    bump(d);
    const t = window.setTimeout(() => {
      const r = window.setInterval(() => bump(d), REPEAT_MS);
      if (hold.current) hold.current.r = r;
    }, HOLD_MS);
    hold.current = { t, r: 0 };
  }

  function stopHold() {
    if (!hold.current) return;
    window.clearTimeout(hold.current.t);
    window.clearInterval(hold.current.r);
    hold.current = null;
  }

  const lost = lossReason(p);
  const others = game.players.filter((o) => o.id !== p.id);
  const chips: { k: string; icon: string; v: number | string; title: string }[] = [];
  for (const c of COUNTERS)
    if (p.counters[c.key] > 0) chips.push({ k: c.key, icon: c.icon, v: p.counters[c.key], title: c.label });
  if (game.commander)
    for (const o of others) {
      const v = p.cmd[o.id] ?? 0;
      if (v > 0) chips.push({ k: `cmd-${o.id}`, icon: "⚔", v: `${v} ${initials(o.name)}`, title: `Danni comandante da ${o.name}` });
    }

  const holdProps = (d: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startHold(d);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div
      ref={ref}
      className={`lc-tile tint-${p.tint} ${lit ? "lit" : ""} ${lost ? "lost" : ""}`}
      style={{ gridColumn: seat.col, gridRow: seat.row }}
    >
      <div
        className="lc-inner"
        style={{ width: w, height: h, transform: `translate(-50%, -50%) rotate(${seat.rot}deg)` }}
      >
        {p.art && <div className="lc-art" style={{ backgroundImage: `url("${p.art}")` }} />}
        <div className="lc-shade" />

        <button className="lc-half minus" aria-label={`${p.name}: togli 1 vita`} {...holdProps(-1)}>
          <span>−</span>
        </button>
        <button className="lc-half plus" aria-label={`${p.name}: aggiungi 1 vita`} {...holdProps(1)}>
          <span>+</span>
        </button>

        <div className="lc-center">
          <div className="lc-name">
            {game.monarch === p.id && <span title="Monarca">👑 </span>}
            {p.name}
          </div>
          <div className="lc-life" style={{ fontSize: big }}>
            {p.life}
            {delta && delta.v !== 0 && (
              <span className={`lc-delta ${delta.v > 0 ? "up" : "down"}`} key={delta.at}>
                {delta.v > 0 ? `+${delta.v}` : `−${-delta.v}`}
              </span>
            )}
          </div>
          {lost && <div className="lc-lost">💀 {lost}</div>}
          {starter && <div className="lc-starter">Inizi tu!</div>}
        </div>

        <button className="lc-chips" onClick={() => onPanel(true)} aria-label="Segnalini">
          {chips.map((c) => (
            <span key={c.k} className={`lc-chip ${c.k === "poison" ? "poison" : ""}`} title={c.title}>
              {c.icon} {c.v}
            </span>
          ))}
          <span className="lc-chip more">{chips.length ? "＋" : "Segnalini ＋"}</span>
        </button>

        {panelOpen && (
          <div className="lc-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lc-panel-head">
              <strong>{p.name}</strong>
              <button className="lc-close" onClick={() => onPanel(false)} aria-label="Chiudi">
                ✕
              </button>
            </div>
            <div className="lc-panel-body">
              {COUNTERS.filter((c) => c.key !== "tax" || game.commander).map((c) => (
                <Stepper
                  key={c.key}
                  label={`${c.icon} ${c.label}`}
                  hint={c.key === "tax" && p.counters.tax > 0 ? `prossimo lancio +${p.counters.tax * 2}` : c.hint}
                  value={p.counters[c.key]}
                  onAdd={(d) => apply((g) => addCounter(g, p.id, c.key, d))}
                />
              ))}
              {game.commander && (
                <>
                  <div className="lc-panel-sub">⚔ Danni da comandante ricevuti (tolgono anche vita)</div>
                  {others.map((o) => (
                    <Stepper
                      key={o.id}
                      label={`da ${o.name}`}
                      dot={o.tint}
                      value={p.cmd[o.id] ?? 0}
                      warn={(p.cmd[o.id] ?? 0) >= 21}
                      onAdd={(d) => apply((g) => addCmdDamage(g, p.id, o.id, d))}
                    />
                  ))}
                </>
              )}
              <button
                className={`lc-monarch ${game.monarch === p.id ? "on" : ""}`}
                onClick={() =>
                  apply((g) => ({ ...g, monarch: g.monarch === p.id ? undefined : p.id }))
                }
              >
                👑 {game.monarch === p.id ? "È il Monarca (tocca per togliere)" : "Diventa il Monarca"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({
  label,
  hint,
  value,
  dot,
  warn,
  onAdd,
}: {
  label: string;
  hint?: string;
  value: number;
  dot?: string;
  warn?: boolean;
  onAdd: (d: number) => void;
}) {
  return (
    <div className={`lc-step ${warn ? "warn" : ""}`}>
      <div className="lc-step-label">
        {dot && <span className={`lc-dot tint-${dot}`} />}
        <span>
          {label}
          {hint && <small>{hint}</small>}
        </span>
      </div>
      <button onClick={() => onAdd(-1)} aria-label="meno">
        −
      </button>
      <span className="lc-step-val">{value}</span>
      <button onClick={() => onAdd(1)} aria-label="più">
        +
      </button>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) return `G${parts[parts.length - 1]}`;
  return parts.map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}
