// "Segnala un problema": schermata, dettagli tecnici e invio a Supabase
// (supabase/feedback.sql). Gli ultimi errori dell'app si tengono in memoria da
// quando parte, così finiscono nella segnalazione anche se sono successi prima.

import { useSyncExternalStore } from "react";
import { supabase } from "./cloud";
import { getLang } from "./i18n";
import { getTheme } from "./theme";
import { deviceId } from "./usage";

// ---------------------------------------------------------------------------
// Ultimi errori

interface LoggedError {
  at: string;
  msg: string;
}

const errors: LoggedError[] = [];
const MAX_ERRORS = 15;

function logError(msg: string) {
  const clean = msg.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!clean) return;
  errors.push({ at: new Date().toISOString().slice(11, 19), msg: clean });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function describe(x: unknown): string {
  if (x instanceof Error) return `${x.name}: ${x.message}${x.stack ? ` @ ${x.stack.split("\n")[1]?.trim() ?? ""}` : ""}`;
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

let installed = false;
/** Da chiamare all'avvio: tiene gli ultimi errori per le segnalazioni. */
export function installErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => logError(`${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => logError(`Promise: ${describe(e.reason)}`));
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    logError(args.map(describe).join(" "));
    orig(...args);
  };
}

// ---------------------------------------------------------------------------
// Dettagli tecnici

export type Diag = Record<string, string | number | boolean | null | string[]>;

function pmSizes(): { total: number; top: string[] } {
  const sizes: [string, number][] = [];
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const n = (localStorage.getItem(k) ?? "").length;
      total += n;
      if (k.startsWith("pm.")) sizes.push([k, n]);
    }
  } catch {
    /* niente */
  }
  sizes.sort((a, b) => b[1] - a[1]);
  return { total, top: sizes.slice(0, 6).map(([k, n]) => `${k} ${Math.round(n / 1024)} KB`) };
}

function countOf(key: string): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
  } catch {
    /* niente */
  }
  return null;
}

/** Cosa serve per capire un problema, senza dati personali (niente email, niente contenuti). */
export function collectDiag(extra?: Diag): Diag {
  const nav = navigator as Navigator & { standalone?: boolean };
  const sizes = pmSizes();
  return {
    versione: typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "dev",
    pagina: location.pathname.replace(import.meta.env.BASE_URL, "/") + location.search,
    lingua: getLang(),
    tema: getTheme(),
    browser: navigator.userAgent,
    schermo: `${screen.width}×${screen.height} @${window.devicePixelRatio}`,
    finestra: `${window.innerWidth}×${window.innerHeight}`,
    installata: window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true,
    online: navigator.onLine,
    accesso: !!supabase() && hasSession(),
    mazzi: countOf("pm.decks.v1"),
    collezione: countOf("pm.collection.v1"),
    memoria_kb: Math.round(sizes.total / 1024),
    memoria_chiavi: sizes.top,
    errori: errors.map((e) => `${e.at} ${e.msg}`),
    ...extra,
  };
}

function hasSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) return true;
    }
  } catch {
    /* niente */
  }
  return false;
}

// ---------------------------------------------------------------------------
// Schermata

const MAX_W = 900;
const MAX_CHARS = 780_000;

/** Elementi da non fotografare (il pulsante 🐞 stesso, i fogli di segnalazione). */
export const NO_SHOT_ATTR = "data-no-shot";

/** Fotografa quello che si vede ora sullo schermo, come JPEG ridotto. */
export async function captureScreen(): Promise<string | null> {
  try {
    const { domToCanvas } = await import("modern-screenshot");
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const scale = Math.min(window.devicePixelRatio || 1, MAX_W / w, 2);
    // Il colore di fondo del tema (le sfumature dello sfondo non vengono copiate).
    const bg =
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() ||
      getComputedStyle(document.body).backgroundColor ||
      "#111";
    const canvas = await domToCanvas(document.body, {
      width: w,
      height: h,
      scale,
      backgroundColor: bg,
      filter: (el) => !(el instanceof Element && el.hasAttribute(NO_SHOT_ATTR)),
      // La pagina è fotografata dall'alto: si sposta il contenuto come lo vede l'utente.
      style: {
        transform: `translate(${-sx}px, ${-sy}px)`,
        transformOrigin: "0 0",
        margin: "0",
        background: bg,
      },
      // Gli elementi fissi (barra in basso, tavolo, fogli) restano dove li vede l'utente.
      onCloneEachNode: (n) => {
        const st = (n as HTMLElement).style;
        if (!st || (st.position !== "fixed" && !(st.position === "sticky" && (n as HTMLElement).classList?.contains("topbar"))))
          return;
        const t = st.transform && st.transform !== "none" ? ` ${st.transform}` : "";
        st.transform = `translate(${sx}px, ${sy}px)${t}`;
      },
      timeout: 8000,
      fetch: { requestInit: { cache: "force-cache" } },
    });
    return toJpeg(canvas);
  } catch (e) {
    console.warn("Schermata non riuscita", e);
    return null;
  }
}

/** Riduce un'immagine scelta dalla galleria (es. una schermata fatta col telefono). */
export function imageFileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_W / img.naturalWidth, 1600 / img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(toJpeg(c));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Immagine non leggibile"));
    };
    img.src = url;
  });
}

function toJpeg(canvas: HTMLCanvasElement): string {
  let c = canvas;
  if (c.width > MAX_W) {
    const k = MAX_W / c.width;
    const small = document.createElement("canvas");
    small.width = MAX_W;
    small.height = Math.round(c.height * k);
    small.getContext("2d")!.drawImage(c, 0, 0, small.width, small.height);
    c = small;
  }
  for (const q of [0.72, 0.55, 0.4, 0.28]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= MAX_CHARS) return url;
  }
  // Ancora troppo grande: dimezza.
  const half = document.createElement("canvas");
  half.width = Math.round(c.width / 2);
  half.height = Math.round(c.height / 2);
  half.getContext("2d")!.drawImage(c, 0, 0, half.width, half.height);
  return half.toDataURL("image/jpeg", 0.5);
}

// ---------------------------------------------------------------------------
// Invio

export type FeedbackKind = "bug" | "idea";

export class FeedbackUnavailable extends Error {}

export async function sendFeedback(o: {
  kind: FeedbackKind;
  message: string;
  diag: Diag | null;
  screenshot: string | null;
}): Promise<void> {
  const sb = supabase();
  if (!sb) throw new FeedbackUnavailable("Invio non disponibile su questa installazione.");
  const { error } = await sb.rpc("send_feedback", {
    fb_kind: o.kind,
    fb_message: o.message,
    fb_page: o.diag?.pagina ?? location.pathname,
    fb_diag: o.diag ?? {},
    fb_screenshot: o.screenshot,
    fb_device: deviceId(),
  });
  if (error) {
    if (/send_feedback|could not find|does not exist|schema cache/i.test(error.message))
      throw new FeedbackUnavailable("La raccolta delle segnalazioni non è ancora attiva (manca feedback.sql).");
    throw new Error(error.message);
  }
}

/** Testo da copiare se l'invio non è possibile. */
export function feedbackAsText(kind: FeedbackKind, message: string, diag: Diag | null): string {
  const lines = [`${kind === "idea" ? "Idea" : "Problema"}: ${message}`];
  if (diag) {
    lines.push("", "Dettagli tecnici:");
    for (const [k, v] of Object.entries(diag)) lines.push(`${k}: ${Array.isArray(v) ? v.join(" | ") : v}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Modalità "segnala": compare il pulsante 🐞 su ogni schermata.

const MODE_KEY = "mm.bugMode";
let mode = readMode();
const modeListeners = new Set<() => void>();

function readMode(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBugMode(on: boolean) {
  mode = on;
  try {
    if (on) sessionStorage.setItem(MODE_KEY, "1");
    else sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* niente */
  }
  modeListeners.forEach((l) => l());
}

export function useBugMode(): boolean {
  return useSyncExternalStore(
    (fn) => {
      modeListeners.add(fn);
      return () => modeListeners.delete(fn);
    },
    () => mode,
  );
}

// ---------------------------------------------------------------------------
// Moderatori

export interface AdminFeedback {
  id: number;
  username: string | null;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  diag: Diag;
  has_screenshot: boolean;
  status: "aperta" | "chiusa";
  created_at: string;
}

export async function loadFeedback(onlyOpen: boolean): Promise<AdminFeedback[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_feedback", { only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminFeedback[];
}

export async function loadFeedbackScreenshot(id: number): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("admin_feedback_screenshot", { fid: id });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function setFeedbackStatus(id: number, status: "aperta" | "chiusa") {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.rpc("admin_set_feedback", { fid: id, new_status: status });
  if (error) throw new Error(error.message);
}
