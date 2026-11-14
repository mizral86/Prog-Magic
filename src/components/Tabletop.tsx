// Tavolo libero a tutto schermo: mano in basso, campo al centro, mazzo /
// cimitero / esilio a destra. Le carte si trascinano col dito (o col mouse)
// tra le zone, senza regole imposte. Tocco sul campo = tappa/stappa;
// pressione lunga (o tasto destro) = menu della carta con immagine grande.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CardInfo } from "../types";
import {
  copyAsToken,
  createToken,
  draw,
  moveCard,
  mulligan,
  newGame,
  nextTurn,
  shuffleLibrary,
  TableState,
  TCard,
  untapAll,
  updateCard,
  Zone,
  ZONE_LABEL,
} from "../tabletop";

interface Props {
  names: string[];
  lookup: Map<string, CardInfo>;
  onPlay: boolean;
  title: string;
  open: boolean;
  onClose: () => void;
}

const LONG_PRESS_MS = 450;
const DRAG_PX = 8;

interface Press {
  uid: number;
  zone: Zone;
  pointerId: number;
  startX: number;
  startY: number;
  /** Punto della carta afferrato, in frazione della sua larghezza/altezza. */
  fx: number;
  fy: number;
  moved: boolean;
  longFired: boolean;
  timer: number;
}

export function Tabletop({ names, lookup, onPlay, title, open, onClose }: Props) {
  const [state, setState] = useState<TableState>(() => newGame(names, onPlay));
  const history = useRef<TableState[]>([]);
  const [menu, setMenu] = useState<{ uid: number; zone: Zone } | null>(null);
  const [viewer, setViewer] = useState<Zone | null>(null);
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ uid: number; zone: Zone } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const [board, setBoard] = useState({ w: 360, h: 400 });
  const handRef = useRef<HTMLDivElement>(null);
  const [handRowW, setHandRowW] = useState(360);
  const handStep = useRef(1);

  // Dimensione delle carte sul campo in base alla larghezza del campo.
  const cardW = Math.round(Math.max(50, Math.min(110, board.w / 5.2)));
  const cardH = Math.round(cardW * 1.396);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoard({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBoard({ w: el.clientWidth, h: el.clientHeight });
    const hr = handRef.current;
    const ro2 = new ResizeObserver(() => hr && setHandRowW(hr.clientWidth));
    if (hr) {
      ro2.observe(hr);
      setHandRowW(hr.clientWidth);
    }
    return () => {
      ro.disconnect();
      ro2.disconnect();
    };
  }, [open]);

  // Blocca lo scorrimento della pagina sotto il tavolo.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("tt-lock");
    return () => document.body.classList.remove("tt-lock");
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  function commit(next: TableState) {
    if (next === state) return;
    history.current.push(state);
    if (history.current.length > 80) history.current.shift();
    setState(next);
  }

  function undo() {
    const prev = history.current.pop();
    if (prev) setState(prev);
  }

  function restart() {
    history.current = [];
    setState(newGame(names, onPlay));
    setMore(false);
    setToast("Nuova partita: mazzo mescolato, 7 carte in mano.");
  }

  const info = (c: TCard) => lookup.get(c.name.toLowerCase());
  const imgOf = (c: TCard, big = false) => {
    if (c.img) return c.img;
    const i = info(c);
    return big ? i?.imageLargeUrl ?? i?.imageUrl : i?.imageUrl ?? i?.imageSmallUrl;
  };
  const labelOf = (c: TCard) => info(c)?.printedName ?? c.name;

  // ---------- trascinamento ----------

  function onDown(e: React.PointerEvent, c: TCard, zone: Zone) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* alcuni browser non lo permettono durante lo scroll */
    }
    const p: Press = {
      uid: c.uid,
      zone,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fx: r.width ? (e.clientX - r.left) / r.width : 0.5,
      fy: r.height ? (e.clientY - r.top) / r.height : 0.5,
      moved: false,
      longFired: false,
      timer: window.setTimeout(() => {
        if (press.current === p && !p.moved) {
          p.longFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
          setMenu({ uid: c.uid, zone });
        }
      }, LONG_PRESS_MS),
    };
    // Le carte tappate sono ruotate: afferro dal centro.
    if (c.tapped) {
      p.fx = 0.5;
      p.fy = 0.5;
    }
    press.current = p;
  }

  // Tasto destro (computer) o pressione lunga di Android: menu della carta.
  function openMenuAt(e: React.MouseEvent, c: TCard, zone: Zone) {
    e.preventDefault();
    if (press.current?.moved) return;
    setMenu({ uid: c.uid, zone });
  }

  function placeGhost(x: number, y: number) {
    const g = ghostRef.current;
    const p = press.current;
    if (!g || !p) return;
    g.style.transform = `translate(${x - p.fx * cardW}px, ${y - p.fy * cardH}px)`;
  }

  function zoneAt(x: number, y: number): { zone: Zone; handIdx?: number } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const z = el?.closest("[data-zone]") as HTMLElement | null;
    if (!z) return null;
    const zone = z.dataset.zone as Zone;
    if (zone === "hand") {
      const h = el?.closest("[data-hand-idx]") as HTMLElement | null;
      if (h) {
        // Le carte in mano si sovrappongono: conta solo la parte visibile.
        const r = h.getBoundingClientRect();
        const i = Number(h.dataset.handIdx);
        const vis = Math.min(r.width, handStep.current);
        return { zone, handIdx: x > r.left + vis / 2 ? i + 1 : i };
      }
    }
    return { zone };
  }

  function onMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId || p.longFired) return;
    if (!p.moved) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_PX) return;
      p.moved = true;
      window.clearTimeout(p.timer);
      setDragging({ uid: p.uid, zone: p.zone });
    }
    placeGhost(e.clientX, e.clientY);
    const z = zoneAt(e.clientX, e.clientY)?.zone ?? null;
    setHover((h) => (h === z ? h : z));
  }

  function onUp(e: React.PointerEvent) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    window.clearTimeout(p.timer);
    press.current = null;
    setHover(null);
    if (p.moved) {
      setDragging(null);
      drop(p, e.clientX, e.clientY);
    } else if (!p.longFired) {
      tapAction(p.uid, p.zone);
    }
  }

  function onCancel() {
    const p = press.current;
    if (p) window.clearTimeout(p.timer);
    press.current = null;
    setDragging(null);
    setHover(null);
  }

  function drop(p: Press, x: number, y: number) {
    const target = zoneAt(x, y);
    if (!target) return;
    if (target.zone === "battlefield") {
      const r = boardRef.current!.getBoundingClientRect();
      const left = x - p.fx * cardW - r.left;
      const top = y - p.fy * cardH - r.top;
      const fx = clamp(left / r.width, 0, Math.max(0, 1 - cardW / r.width));
      const fy = clamp(top / r.height, 0, Math.max(0, 1 - cardH / r.height));
      commit(moveCard(state, p.uid, "battlefield", { x: fx, y: fy }));
    } else if (target.zone === "hand") {
      commit(moveCard(state, p.uid, "hand", { index: target.handIdx }));
    } else if (target.zone !== p.zone) {
      commit(moveCard(state, p.uid, target.zone));
    }
  }

  function tapAction(uid: number, zone: Zone) {
    if (zone === "battlefield") {
      const c = state.battlefield.find((x) => x.uid === uid);
      if (c) commit(updateCard(state, uid, { tapped: !c.tapped }));
    } else if (zone === "library") {
      commit(draw(state, 1));
    } else if (zone === "hand") {
      setMenu({ uid, zone });
    } else {
      setViewer(zone);
    }
  }

  // ---------- render ----------

  const dragCard = dragging
    ? state[dragging.zone].find((c) => c.uid === dragging.uid) ?? null
    : null;

  const pileTop = (z: Zone): TCard | undefined =>
    z === "library" ? state.library[0] : state[z][state[z].length - 1];

  // Mano "a ventaglio": le carte si sovrappongono quanto basta per starci tutte,
  // così niente scorrimento e il trascinamento funziona in ogni direzione.
  const handW = Math.round(Math.max(62, Math.min(110, handRowW / 5)));
  const handH = Math.round(handW * 1.396);
  const nHand = state.hand.length;
  const step =
    nHand > 1 ? Math.max(14, Math.min(handW + 6, (handRowW - handW) / (nHand - 1))) : handW;
  handStep.current = step;
  const handTotal = nHand > 0 ? step * (nHand - 1) + handW : 0;
  const handOffset = Math.max(0, (handRowW - handTotal) / 2);

  return (
    <div className={`tt ${open ? "" : "tt-hidden"}`} onContextMenu={(e) => e.preventDefault()}>
      {/* barra superiore */}
      <div className="tt-top">
        <button className="tt-btn" onClick={onClose} title="Chiudi il tavolo">
          ✕
        </button>
        <span className="tt-title" title={title}>
          T{state.turn}
        </span>
        <button
          className="tt-btn primary"
          onClick={() => commit(nextTurn(state))}
          title="Nuovo turno: stappa tutto e pesca"
        >
          ▶ Turno
        </button>
        <button className="tt-btn" onClick={() => commit(draw(state, 1))}>
          Pesca
        </button>
        <button className="tt-btn" onClick={() => commit(untapAll(state))}>
          Stappa
        </button>
        <span className="tt-spacer" />
        <button
          className="tt-btn"
          onClick={undo}
          disabled={history.current.length === 0}
          title="Annulla l'ultima mossa"
        >
          ↶
        </button>
        <button className="tt-btn" onClick={() => setMore((m) => !m)} title="Altro">
          ⋯
        </button>
        {more && (
          <div className="tt-more" onClick={() => setMore(false)}>
            <button onClick={() => commit(shuffleLibrary(state))}>🔀 Mescola il mazzo</button>
            <button
              onClick={() => {
                commit(mulligan(state));
                setToast(
                  `Mulligan ${state.mulligans + 1}: tieni la mano e metti ${state.mulligans + 1} ` +
                    `carte in fondo (tieni premuto → Sotto al mazzo).`,
                );
              }}
            >
              ♻ Mulligan
            </button>
            <button onClick={() => setViewer("library")}>👁 Guarda il mazzo</button>
            <button onClick={() => commit(createToken(state, "Pedina"))}>➕ Pedina generica</button>
            <button onClick={restart}>🆕 Nuova partita</button>
          </div>
        )}
      </div>

      {/* punti vita */}
      <div className="tt-life">
        <LifeBox
          label="Tu"
          value={state.life}
          onChange={(d) => commit({ ...state, life: state.life + d })}
        />
        <span className="tt-deckname" title={title}>
          {title}
        </span>
        <LifeBox
          label="Avversario"
          value={state.oppLife}
          onChange={(d) => commit({ ...state, oppLife: state.oppLife + d })}
        />
      </div>

      <div className="tt-main">
        {/* campo */}
        <div
          ref={boardRef}
          data-zone="battlefield"
          className={`tt-board ${hover === "battlefield" ? "tt-drop" : ""}`}
        >
          {state.battlefield.length === 0 && (
            <div className="tt-hint">
              Trascina qui le carte dalla mano.
              <br />
              Tocco = tappa/stappa · tieni premuto = menu
            </div>
          )}
          {state.battlefield.map((c, i) => (
            <div
              key={c.uid}
              className={`tt-card tt-onboard ${c.tapped ? "tapped" : ""} ${
                dragging?.uid === c.uid ? "tt-ghosted" : ""
              }`}
              style={{
                width: cardW,
                height: cardH,
                left: (c.x ?? 0) * board.w,
                top: (c.y ?? 0) * board.h,
                zIndex: i + 1,
              }}
              onPointerDown={(e) => onDown(e, c, "battlefield")}
              onContextMenu={(e) => openMenuAt(e, c, "battlefield")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
            >
              <CardFace card={c} url={imgOf(c)} label={labelOf(c)} />
              {!!c.counters && (
                <span className={`tt-counter ${c.counters < 0 ? "neg" : ""}`}>
                  {c.counters > 0 ? `+${c.counters}` : c.counters}
                </span>
              )}
              {c.token && <span className="tt-token">pedina</span>}
            </div>
          ))}
        </div>

        {/* mazzo, cimitero, esilio */}
        <div className="tt-piles">
          {(["library", "graveyard", "exile"] as Zone[]).map((z) => {
            const top = pileTop(z);
            return (
              <div
                key={z}
                data-zone={z}
                className={`tt-pile ${hover === z ? "tt-drop" : ""}`}
              >
                <div className="tt-pile-slot">
                  {top ? (
                    <div
                      className={`tt-card ${dragging?.uid === top.uid ? "tt-ghosted" : ""}`}
                      onPointerDown={(e) => onDown(e, top, z)}
                      onContextMenu={(e) => openMenuAt(e, top, z)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onCancel}
                    >
                      {z === "library" ? (
                        <CardBack />
                      ) : (
                        <CardFace card={top} url={imgOf(top)} label={labelOf(top)} />
                      )}
                    </div>
                  ) : (
                    <div className="tt-empty" onClick={() => setViewer(z)} />
                  )}
                  <span className="tt-pile-count">{state[z].length}</span>
                </div>
                <button className="tt-pile-label" onClick={() => setViewer(z)}>
                  {ZONE_LABEL[z]}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* mano */}
      <div data-zone="hand" className={`tt-hand ${hover === "hand" ? "tt-drop" : ""}`}>
        <div className="tt-hand-head">
          Mano · {state.hand.length}
          {state.mulligans > 0 && <span> · mulligan {state.mulligans}</span>}
          <span className="tt-hand-tip">trascina sul campo per giocare · tocca per il menu</span>
        </div>
        <div className="tt-hand-row" ref={handRef} style={{ height: handH }}>
          {state.hand.length === 0 && <div className="tt-hand-empty">mano vuota</div>}
          {state.hand.map((c, i) => (
            <div
              key={c.uid}
              data-hand-idx={i}
              className={`tt-card tt-inhand ${dragging?.uid === c.uid ? "tt-ghosted" : ""}`}
              style={{ width: handW, height: handH, left: handOffset + i * step, zIndex: i + 1 }}
              onPointerDown={(e) => onDown(e, c, "hand")}
              onContextMenu={(e) => openMenuAt(e, c, "hand")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
            >
              <CardFace card={c} url={imgOf(c)} label={labelOf(c)} />
            </div>
          ))}
        </div>
      </div>

      {/* carta trascinata */}
      {dragCard && (
        <div ref={ghostRef} className="tt-ghost" style={{ width: cardW, height: cardH }}>
          {dragging?.zone === "library" ? (
            <CardBack />
          ) : (
            <CardFace card={dragCard} url={imgOf(dragCard)} label={labelOf(dragCard)} />
          )}
        </div>
      )}
      <GhostInit ghostRef={ghostRef} press={press} cardW={cardW} cardH={cardH} active={!!dragCard} />

      {toast && <div className="tt-toast">{toast}</div>}

      {viewer && (
        <ZoneViewer
          zone={viewer}
          state={state}
          imgOf={imgOf}
          labelOf={labelOf}
          commit={commit}
          onOpen={(uid) => setMenu({ uid, zone: viewer })}
          onClose={() => setViewer(null)}
        />
      )}
      {menu && (
        <CardMenu
          state={state}
          menu={menu}
          imgOf={imgOf}
          labelOf={labelOf}
          lookup={lookup}
          onClose={() => setMenu(null)}
          commit={(s) => {
            commit(s);
            setMenu(null);
          }}
          commitKeep={commit}
        />
      )}

    </div>
  );
}

// Posiziona il fantasma appena compare (prima del primo pointermove successivo).
function GhostInit({
  ghostRef,
  press,
  cardW,
  cardH,
  active,
}: {
  ghostRef: React.RefObject<HTMLDivElement>;
  press: React.MutableRefObject<Press | null>;
  cardW: number;
  cardH: number;
  active: boolean;
}) {
  useLayoutEffect(() => {
    const g = ghostRef.current;
    const p = press.current;
    if (!active || !g || !p) return;
    g.style.transform = `translate(${p.startX - p.fx * cardW}px, ${p.startY - p.fy * cardH}px)`;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function CardFace({ card, url, label }: { card: TCard; url?: string; label: string }) {
  if (card.faceDown) return <CardBack />;
  if (!url)
    return (
      <div className="tt-textcard">
        <span>{label}</span>
      </div>
    );
  return <img src={url} alt={label} draggable={false} loading="lazy" />;
}

function CardBack() {
  return (
    <div className="tt-back">
      <span>MMG</span>
    </div>
  );
}

function LifeBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (d: number) => void;
}) {
  return (
    <div className="tt-lifebox">
      <span className="tt-life-label">{label}</span>
      <button onClick={() => onChange(-1)} aria-label={`${label} −1`}>
        −
      </button>
      <span className={`tt-life-val ${value <= 0 ? "dead" : ""}`}>{value}</span>
      <button onClick={() => onChange(1)} aria-label={`${label} +1`}>
        +
      </button>
    </div>
  );
}

function CardMenu({
  state,
  menu,
  imgOf,
  labelOf,
  lookup,
  onClose,
  commit,
  commitKeep,
}: {
  state: TableState;
  menu: { uid: number; zone: Zone };
  imgOf: (c: TCard, big?: boolean) => string | undefined;
  labelOf: (c: TCard) => string;
  lookup: Map<string, CardInfo>;
  onClose: () => void;
  commit: (s: TableState) => void;
  commitKeep: (s: TableState) => void;
}) {
  // La carta può essere cambiata di zona: la ritrovo ovunque sia.
  const zones: Zone[] = ["battlefield", "hand", "library", "graveyard", "exile"];
  let card: TCard | undefined;
  let zone: Zone = menu.zone;
  for (const z of zones) {
    const c = state[z].find((x) => x.uid === menu.uid);
    if (c) {
      card = c;
      zone = z;
      break;
    }
  }
  if (!card) return null;
  const c = card;
  const ci = lookup.get(c.name.toLowerCase());
  const url = c.faceDown && zone === "battlefield" ? imgOf({ ...c, faceDown: false }, true) : imgOf(c, true);
  const mv = (to: Zone, o?: Parameters<typeof moveCard>[3]) => commit(moveCard(state, c.uid, to, o));

  return (
    <div className="tt-sheet-bg" onClick={onClose}>
      <div className="tt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-sheet-img">
          {url ? (
            <img src={url} alt={labelOf(c)} draggable={false} />
          ) : (
            <div className="tt-textcard big">
              <span>{labelOf(c)}</span>
            </div>
          )}
        </div>
        <div className="tt-sheet-body">
          <div className="tt-sheet-title">
            {labelOf(c)}
            {c.token && <span className="muted small"> · pedina</span>}
          </div>
          <div className="muted small">
            {ZONE_LABEL[zone]}
            {ci?.typeLine ? ` · ${ci.typeLine}` : ""}
          </div>

          {zone === "battlefield" && (
            <>
              <div className="tt-actions">
                <button onClick={() => commit(updateCard(state, c.uid, { tapped: !c.tapped }))}>
                  {c.tapped ? "Stappa" : "Tappa"}
                </button>
                <button onClick={() => commit(updateCard(state, c.uid, { faceDown: !c.faceDown }))}>
                  {c.faceDown ? "Scopri" : "A faccia in giù"}
                </button>
                <button onClick={() => commit(copyAsToken(state, c.uid))}>Copia (pedina)</button>
              </div>
              <div className="tt-counters">
                <span>Segnalini</span>
                <button
                  onClick={() => commitKeep(updateCard(state, c.uid, { counters: (c.counters ?? 0) - 1 }))}
                >
                  −
                </button>
                <strong>{c.counters ?? 0}</strong>
                <button
                  onClick={() => commitKeep(updateCard(state, c.uid, { counters: (c.counters ?? 0) + 1 }))}
                >
                  +
                </button>
              </div>
              {(ci?.tokens?.length ?? 0) > 0 && (
                <div className="tt-actions">
                  {ci!.tokens!.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        commit(
                          createToken(
                            state,
                            t.name,
                            `https://api.scryfall.com/cards/${t.id}?format=image&version=normal`,
                          ),
                        )
                      }
                    >
                      ➕ {t.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="tt-actions tt-moves">
            {zone !== "battlefield" && (
              <>
                <button className="primary" onClick={() => mv("battlefield")}>
                  Metti in campo
                </button>
                <button onClick={() => mv("battlefield", { faceDown: true })}>
                  In campo coperta
                </button>
              </>
            )}
            {zone !== "hand" && <button onClick={() => mv("hand")}>In mano</button>}
            {zone !== "graveyard" && <button onClick={() => mv("graveyard")}>Al cimitero</button>}
            {zone !== "exile" && <button onClick={() => mv("exile")}>In esilio</button>}
            <button onClick={() => mv("library")}>Sopra al mazzo</button>
            <button onClick={() => mv("library", { bottom: true })}>Sotto al mazzo</button>
          </div>
          <button className="tt-sheet-close" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoneViewer({
  zone,
  state,
  imgOf,
  labelOf,
  commit,
  onOpen,
  onClose,
}: {
  zone: Zone;
  state: TableState;
  imgOf: (c: TCard) => string | undefined;
  labelOf: (c: TCard) => string;
  commit: (s: TableState) => void;
  onOpen: (uid: number) => void;
  onClose: () => void;
}) {
  // Cimitero/esilio: l'ultima carta arrivata per prima.
  const list = zone === "library" ? state[zone] : state[zone].slice().reverse();
  return (
    <div className="tt-sheet-bg" onClick={onClose}>
      <div className="tt-sheet tt-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="tt-viewer-head">
          <strong>
            {ZONE_LABEL[zone]} · {list.length}
          </strong>
          {zone === "library" && (
            <button onClick={() => commit(shuffleLibrary(state))}>🔀 Mescola</button>
          )}
          <button onClick={onClose}>Chiudi</button>
        </div>
        {zone === "library" && (
          <div className="muted small">Dalla cima al fondo. Tocca una carta per spostarla.</div>
        )}
        {list.length === 0 ? (
          <div className="muted small" style={{ padding: 16 }}>
            Nessuna carta.
          </div>
        ) : (
          <div className="tt-viewer-grid">
            {list.map((c) => (
              <button key={c.uid} className="tt-viewer-card" onClick={() => onOpen(c.uid)}>
                <CardFace card={c} url={imgOf(c)} label={labelOf(c)} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
