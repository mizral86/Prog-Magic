// Trova le carte sparse in una foto (es. un pool di carte su un tavolo), anche
// ruotate. Niente librerie esterne: la foto viene rimpicciolita, si cercano i
// bordi, si riempie lo sfondo partendo dai lati dell'immagine e quello che
// resta (le carte) viene diviso in macchie. Per ogni macchia si calcola il
// rettangolo orientato (con gli assi principali) e si tengono quelle con la
// forma di una carta.

import { CARD_RATIO } from "./scanner";

/** Carta trovata nella foto, in pixel dell'immagine originale. */
export interface CardBox {
  cx: number;
  cy: number;
  /** Lato corto e lato lungo. */
  w: number;
  h: number;
  /** Direzione del lato lungo, in radianti (π/2 = carta dritta). */
  angle: number;
}

const WORK_SIDE = 720;

export function detectCards(frame: HTMLCanvasElement): CardBox[] {
  const k = Math.min(1, WORK_SIDE / Math.max(frame.width, frame.height));
  const W = Math.max(8, Math.round(frame.width * k));
  const H = Math.max(8, Math.round(frame.height * k));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const N = W * H;

  // Luminosità e saturazione (le carte si staccano dal tavolo anche per colore).
  const lum = new Float32Array(N);
  const r = new Float32Array(N);
  const g = new Float32Array(N);
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    r[i] = px[i * 4];
    g[i] = px[i * 4 + 1];
    b[i] = px[i * 4 + 2];
    lum[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  }

  // Gradiente (Sobel) sul colore: massimo dei tre canali.
  const mag = new Float32Array(N);
  const chans = [r, g, b];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let best = 0;
      for (const ch of chans) {
        const gx =
          ch[i - W + 1] + 2 * ch[i + 1] + ch[i + W + 1] - ch[i - W - 1] - 2 * ch[i - 1] - ch[i + W - 1];
        const gy =
          ch[i + W - 1] + 2 * ch[i + W] + ch[i + W + 1] - ch[i - W - 1] - 2 * ch[i - W] - ch[i - W + 1];
        const m = Math.abs(gx) + Math.abs(gy);
        if (m > best) best = m;
      }
      mag[i] = best;
    }
  }

  // Soglia: il tavolo di solito è la parte più uniforme. Prendiamo il
  // gradiente tipico lungo i bordi della foto (quasi sempre tavolo) e stiamo
  // ben sopra.
  const border: number[] = [];
  for (let x = 1; x < W - 1; x += 2) {
    border.push(mag[W + x], mag[(H - 2) * W + x]);
  }
  for (let y = 1; y < H - 1; y += 2) {
    border.push(mag[y * W + 1], mag[y * W + W - 2]);
  }
  border.sort((a, z) => a - z);
  const p90 = border[Math.floor(border.length * 0.9)] ?? 0;
  const thr = Math.max(60, p90 * 1.5);

  let edge: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) edge[i] = mag[i] > thr ? 1 : 0;
  // Bordi appena ingrossati: per seguire il contorno delle carte e per
  // cercare le linee di separazione tra le tasche di un raccoglitore.
  const edge1 = dilate(edge, W, H, 1);
  edge = dilate(edge, W, H, 2);

  // Sfondo = zona senza bordi collegata ai lati dell'immagine.
  const bg = new Uint8Array(N);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && !edge[i]) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    push(y * W);
    push(y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < N - W) push(i + W);
  }

  // Togliamo la "pelle" aggiunta dalla dilatazione, così le carte vicine si separano.
  let fg: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 1;
  fg = erode(fg, W, H, 2);

  // Macchie (componenti connesse).
  const label = new Int32Array(N);
  const blobs: (Blob & { pts: number[] })[] = [];
  let next = 1;
  for (let s = 0; s < N; s++) {
    if (!fg[s] || label[s]) continue;
    const pts: number[] = [];
    label[s] = next;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      pts.push(i);
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for (const j of nb) {
        if (j >= 0 && j < N && fg[j] && !label[j]) {
          label[j] = next;
          stack.push(j);
        }
      }
    }
    next++;
    if (pts.length > N * 0.003) blobs.push({ ...fitBox(pts, W), pts });
  }

  const ratioOk = (bx: Box) => {
    const ar = bx.w / bx.h;
    return ar > CARD_RATIO * 0.8 && ar < CARD_RATIO * 1.2;
  };
  const cardLike = (bx: Box & { fill: number }) => bx.fill > FILL_OK && ratioOk(bx);
  const singles = blobs.filter(cardLike);
  const areas = singles.map((bx) => bx.w * bx.h).sort((a, z) => a - z);
  const median = areas.length ? areas[Math.floor(areas.length / 2)] : 0;

  const out: Box[] = [];
  for (const bx of blobs) {
    if (median && bx.w * bx.h < median * 0.35) continue;
    // Pagina di raccoglitore (o carte in fila che si toccano): si cerca la
    // griglia le cui linee di taglio cadono sui bordi tra una carta e l'altra.
    if (bx.fill > FILL_OK) {
      const cells = gridSplit(bx, edge1, W, H, ratioOk);
      if (cells) {
        out.push(...cells);
        continue;
      }
    }
    if (cardLike(bx) && (!median || bx.w * bx.h < median * 1.6)) {
      out.push(bx);
      continue;
    }
    // Carte allineate che si toccano: rettangolo pieno grande n volte una carta.
    const n = median ? Math.round((bx.w * bx.h) / median) : 0;
    if (bx.fill > FILL_OK && n >= 2 && n <= 4) {
      const parts = splitBox(bx, n);
      if (parts.every(ratioOk)) {
        out.push(...parts);
        continue;
      }
    }
    // Carte che si toccano per un angolo o un pezzo di lato: si "consuma" la
    // macchia dai bordi finché non si stacca in pezzi con forma di carta.
    if ("pts" in bx) {
      const pts = (bx as { pts: number[] }).pts;
      out.push(...splitByErosion(pts, W, (b) => cardLike(b) && (!median || b.w * b.h > median * 0.5)));
    }
  }

  // Si tolgono i riquadri doppi o interni a un'altra carta e quelli che
  // contengono più carte (una pagina intera che non si è riusciti a dividere).
  const final = dedupe(out);

  // La dilatazione/erosione lascia ~1px in più: restringiamo un filo.
  return final
    .map((bx) => ({
      cx: bx.cx / k,
      cy: bx.cy / k,
      w: Math.max(4, bx.w - 2) / k,
      h: Math.max(4, bx.h - 2) / k,
      // Lato lungo verso il basso (0..π): una carta dritta viene a π/2.
      angle: ((bx.angle % Math.PI) + Math.PI) % Math.PI,
    }))
    .sort((a, z) => (Math.abs(a.cy - z.cy) < a.h * 0.5 ? a.cx - z.cx : a.cy - z.cy));
}

interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

interface Blob extends Box {
  fill: number;
}

function inside(bx: Box, x: number, y: number): boolean {
  const ux = Math.cos(bx.angle);
  const uy = Math.sin(bx.angle);
  const dx = x - bx.cx;
  const dy = y - bx.cy;
  return Math.abs(dx * ux + dy * uy) <= bx.h / 2 && Math.abs(-dx * uy + dy * ux) <= bx.w / 2;
}

function dedupe(boxes: Box[]): Box[] {
  const area = (b: Box) => b.w * b.h;
  // Riquadri che contengono il centro di due o più riquadri più piccoli = gruppi.
  const groups = new Set<Box>();
  for (const a of boxes) {
    let n = 0;
    for (const b of boxes) {
      if (b !== a && area(b) < area(a) * 0.6 && inside(a, b.cx, b.cy)) n++;
    }
    if (n >= 2) groups.add(a);
  }
  const rest = boxes.filter((b) => !groups.has(b)).sort((a, b) => area(b) - area(a));
  const kept: Box[] = [];
  for (const b of rest) {
    if (kept.some((k) => inside(k, b.cx, b.cy))) continue;
    kept.push(b);
  }
  // Scarta i riquadri molto più piccoli delle altre carte.
  const areas = kept.map(area).sort((a, z) => a - z);
  const med = areas[Math.floor(areas.length / 2)] ?? 0;
  return kept.filter((b) => area(b) > med * 0.4);
}

/**
 * Divide un rettangolo in una griglia di carte, se esiste una griglia le cui
 * linee di taglio cadono (quasi) tutte su dei bordi. null se non c'è.
 */
function gridSplit(
  bx: Box,
  edge: Uint8Array,
  W: number,
  H: number,
  ratioOk: (b: Box) => boolean,
): Box[] | null {
  const ux = Math.cos(bx.angle);
  const uy = Math.sin(bx.angle);
  const vx = -uy;
  const vy = ux;
  const at = (u: number, v: number) => {
    const x = Math.round(bx.cx + u * ux + v * vx);
    const y = Math.round(bx.cy + u * uy + v * vy);
    return x >= 0 && y >= 0 && x < W && y < H && edge[y * W + x] === 1;
  };
  // Quota della linea a u fissato (o v fissato) coperta da bordi, con ±2px di tolleranza.
  const lineScore = (alongU: boolean, pos: number, len: number) => {
    let hit = 0;
    let n = 0;
    for (let t = -len / 2 + 2; t < len / 2 - 2; t += 1.5) {
      n++;
      for (let d = -2; d <= 2; d++) {
        if (alongU ? at(t, pos + d) : at(pos + d, t)) {
          hit++;
          break;
        }
      }
    }
    return n ? hit / n : 0;
  };

  let best: { score: number; nu: number; nv: number } | null = null;
  for (let nu = 1; nu <= 8; nu++) {
    for (let nv = 1; nv <= 8; nv++) {
      if (nu * nv < 2 || nu * nv > 36) continue;
      const cl = bx.h / nu;
      const cs = bx.w / nv;
      if (Math.min(cl, cs) < 14) continue;
      const cell = { cx: 0, cy: 0, angle: 0, w: Math.min(cl, cs), h: Math.max(cl, cs) };
      if (!ratioOk(cell) || Math.abs(cell.w / cell.h - CARD_RATIO) > 0.06) continue;
      let sum = 0;
      let cnt = 0;
      let worst = 1;
      for (let i = 1; i < nu; i++) {
        const sc = lineScore(false, -bx.h / 2 + i * cl, bx.w);
        sum += sc;
        cnt++;
        worst = Math.min(worst, sc);
      }
      for (let j = 1; j < nv; j++) {
        const sc = lineScore(true, -bx.w / 2 + j * cs, bx.h);
        sum += sc;
        cnt++;
        worst = Math.min(worst, sc);
      }
      const score = Math.min(sum / cnt, worst + 0.15);
      // A parità, meno caselle (le linee interne di una carta non contano).
      if (score >= 0.6 && (!best || score > best.score + 0.08 || (score > best.score - 0.08 && nu * nv < best.nu * best.nv))) {
        best = { score, nu, nv };
      }
    }
  }
  if (!best) return null;
  const cells: Box[] = [];
  const cl = bx.h / best.nu;
  const cs = bx.w / best.nv;
  for (let i = 0; i < best.nu; i++) {
    for (let j = 0; j < best.nv; j++) {
      const u = -bx.h / 2 + (i + 0.5) * cl;
      const v = -bx.w / 2 + (j + 0.5) * cs;
      const c = { cx: bx.cx + u * ux + v * vx, cy: bx.cy + u * uy + v * vy, w: cs, h: cl, angle: bx.angle };
      cells.push(normalize(c));
    }
  }
  return cells;
}

const FILL_OK = 0.72;

function splitByErosion(
  pts: number[],
  W: number,
  ok: (b: Blob) => boolean,
): Box[] {
  // Maschera locale della macchia.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of pts) {
    const x = i % W;
    const y = (i / W) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  for (const i of pts) mask[(((i / W) | 0) - y0) * w + (i % W) - x0] = 1;

  let best: Box[] = [];
  for (const r of [3, 6, 10, 15, 21]) {
    const er = erode(mask, w, h, r);
    const lab = new Int32Array(w * h);
    const found: Box[] = [];
    let id = 1;
    const stack: number[] = [];
    for (let s = 0; s < er.length; s++) {
      if (!er[s] || lab[s]) continue;
      const comp: number[] = [];
      lab[s] = id;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop()!;
        comp.push(i);
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j >= 0 && j < er.length && er[j] && !lab[j]) {
            lab[j] = id;
            stack.push(j);
          }
        }
      }
      id++;
      if (comp.length < 50) continue;
      const b = fitBox(comp, w);
      // Rimettiamo quello che l'erosione ha tolto (r per lato).
      const grown: Blob = { ...b, w: b.w + 2 * r, h: b.h + 2 * r, cx: b.cx + x0, cy: b.cy + y0 };
      if (ok(grown)) found.push(grown);
    }
    if (found.length > best.length) best = found;
  }
  return best;
}

/** Rettangolo orientato di una macchia con gli assi principali (PCA). */
function fitBox(pts: number[], W: number): Blob {
  let sx = 0;
  let sy = 0;
  for (const i of pts) {
    sx += i % W;
    sy += (i / W) | 0;
  }
  const n = pts.length;
  const mx = sx / n;
  const my = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const i of pts) {
    const dx = (i % W) - mx;
    const dy = ((i / W) | 0) - my;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const i of pts) {
    const dx = (i % W) - mx;
    const dy = ((i / W) | 0) - my;
    const u = dx * ux + dy * uy;
    const v = -dx * uy + dy * ux;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const lu = maxU - minU + 1;
  const lv = maxV - minV + 1;
  // Centro del rettangolo (non il baricentro).
  const cu = (maxU + minU) / 2;
  const cv = (maxV + minV) / 2;
  const cx = mx + cu * ux - cv * uy;
  const cy = my + cu * uy + cv * ux;
  const long = Math.max(lu, lv);
  const short = Math.min(lu, lv);
  return {
    cx,
    cy,
    w: short,
    h: long,
    angle: lu >= lv ? angle : angle + Math.PI / 2,
    fill: n / (lu * lv),
  };
}

/** Divide un rettangolo in n parti lungo il lato più lungo. */
function splitBox(bx: Box, n: number): Box[] {
  // Carte affiancate per il lato lungo → il rettangolo è largo n×w e alto h:
  // si divide lungo l'asse dove la parte risulta con forma di carta.
  const ux = Math.cos(bx.angle);
  const uy = Math.sin(bx.angle);
  const tries: Box[][] = [];
  // a) divido lungo il lato lungo (asse u)
  const a: Box[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    a.push({ cx: bx.cx + ux * t * bx.h, cy: bx.cy + uy * t * bx.h, w: bx.w, h: bx.h / n, angle: bx.angle });
  }
  tries.push(a.map(normalize));
  // b) divido lungo il lato corto (asse v)
  const vx = -uy;
  const vy = ux;
  const b2: Box[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    b2.push({ cx: bx.cx + vx * t * bx.w, cy: bx.cy + vy * t * bx.w, w: bx.w / n, h: bx.h, angle: bx.angle });
  }
  tries.push(b2.map(normalize));
  const score = (bs: Box[]) => Math.abs(bs[0].w / bs[0].h - CARD_RATIO);
  return tries.sort((p, q) => score(p) - score(q))[0];
}

function normalize(bx: Box): Box {
  return bx.w <= bx.h ? bx : { ...bx, w: bx.h, h: bx.w, angle: bx.angle + Math.PI / 2 };
}

function dilate(m: Uint8Array, W: number, H: number, rad: number): Uint8Array {
  return morph(m, W, H, rad, 1);
}
function erode(m: Uint8Array, W: number, H: number, rad: number): Uint8Array {
  return morph(m, W, H, rad, 0);
}

/** Dilatazione (target 1) o erosione (target 0) con un quadrato, separabile. */
function morph(m: Uint8Array, W: number, H: number, rad: number, target: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 1 - target;
      for (let d = -rad; d <= rad && v !== target; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= W) {
          if (target === 0) v = 0;
          continue;
        }
        if (m[y * W + xx] === target) v = target;
      }
      tmp[y * W + x] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 1 - target;
      for (let d = -rad; d <= rad && v !== target; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= H) {
          if (target === 0) v = 0;
          continue;
        }
        if (tmp[yy * W + x] === target) v = target;
      }
      out[y * W + x] = v;
    }
  }
  return out;
}

/** I quattro angoli del rettangolo (per disegnarlo sulla foto). */
export function boxCorners(bx: CardBox): [number, number][] {
  const ux = Math.cos(bx.angle);
  const uy = Math.sin(bx.angle);
  const vx = -uy;
  const vy = ux;
  const hh = bx.h / 2;
  const hw = bx.w / 2;
  return [
    [bx.cx - ux * hh - vx * hw, bx.cy - uy * hh - vy * hw],
    [bx.cx - ux * hh + vx * hw, bx.cy - uy * hh + vy * hw],
    [bx.cx + ux * hh + vx * hw, bx.cy + uy * hh + vy * hw],
    [bx.cx + ux * hh - vx * hw, bx.cy + uy * hh - vy * hw],
  ];
}

/**
 * Ritaglia la carta e la raddrizza (lato lungo in verticale). `flip` la gira
 * di 180°, per le carte capovolte.
 */
export function uprightCard(frame: HTMLCanvasElement, bx: CardBox, flip = false): HTMLCanvasElement {
  const scale = Math.max(1, 700 / bx.w);
  const c = document.createElement("canvas");
  c.width = Math.round(bx.w * scale);
  c.height = Math.round(bx.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(scale, scale);
  ctx.rotate(Math.PI / 2 - bx.angle + (flip ? Math.PI : 0));
  ctx.drawImage(frame, -bx.cx, -bx.cy);
  return c;
}
