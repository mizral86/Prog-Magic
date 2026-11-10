// Scanner: inquadra una carta con la fotocamera e aggiungila alla collezione.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../collection";
import { cardRectIn, recognize, warmUpScanner } from "../scanner";
import { CardInfo } from "../types";
import { formatMoney, formatPrice } from "../prices";
import { CardDetail } from "../components/CardDetail";
import { MultiScan } from "../components/MultiScan";

type Mode = "single" | "multi";

function loadMode(): Mode {
  try {
    return localStorage.getItem("pm.scanMode") === "multi" ? "multi" : "single";
  } catch {
    return "single";
  }
}

interface Scanned {
  key: number;
  card: CardInfo;
  foil: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "reading" }
  | { kind: "notfound"; read: string }
  | { kind: "error"; message: string };

const AUTO_INTERVAL = 1400;

export default function ScanPage() {
  const collection = useCollection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastIdRef = useRef<string | null>(null);

  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied">("off");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [auto, setAuto] = useState(true);
  const [foil, setFoil] = useState(false);
  const [scanned, setScanned] = useState<Scanned[]>([]);
  const [detail, setDetail] = useState<CardInfo | null>(null);
  const [mode, setModeState] = useState<Mode>(loadMode);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setCamera("starting");
    setStatus({ kind: "loading" });
    warmUpScanner();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCamera("on");
      setStatus({ kind: "idle" });
    } catch (err) {
      setCamera("denied");
      setStatus({
        kind: "error",
        message:
          "Non riesco ad aprire la fotocamera. Consenti l'accesso alla fotocamera per questo sito nelle impostazioni del browser, oppure usa \"Scatta o scegli una foto\".",
      });
    }
  }

  const addCard = useCallback(
    (card: CardInfo, isFoil: boolean) => {
      collection.add(card, { foil: isFoil });
      setScanned((s) => [{ key: Date.now() + Math.random(), card, foil: isFoil }, ...s]);
    },
    [collection],
  );

  /** Legge la carta dal canvas e la aggiunge se riconosciuta. */
  const handleFrame = useCallback(
    async (frame: HTMLCanvasElement, rect: DOMRect, fromAuto: boolean) => {
      busyRef.current = true;
      if (!fromAuto) setStatus({ kind: "reading" });
      try {
        const r = await recognize(frame, rect);
        if (r.card) {
          // In automatico la stessa carta ferma davanti alla fotocamera conta una volta sola.
          if (fromAuto && r.card.scryfallId === lastIdRef.current) return;
          lastIdRef.current = r.card.scryfallId ?? r.card.name;
          addCard(r.card, foil);
          navigator.vibrate?.(60);
          setStatus({ kind: "idle" });
        } else {
          if (fromAuto && r.readName.length < 3) lastIdRef.current = null;
          if (!fromAuto || r.readName.length >= 3)
            setStatus({ kind: "notfound", read: r.readName || r.readInfo });
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Lettura non riuscita. Controlla la connessione e riprova.",
        });
      } finally {
        busyRef.current = false;
      }
    },
    [addCard, foil],
  );

  /** Cattura il fotogramma visibile e calcola dove sta la cornice della carta. */
  const captureVideo = useCallback((): { frame: HTMLCanvasElement; rect: DOMRect } | null => {
    const v = videoRef.current;
    const box = boxRef.current;
    if (!v || !box || !v.videoWidth) return null;
    const frame = document.createElement("canvas");
    frame.width = v.videoWidth;
    frame.height = v.videoHeight;
    frame.getContext("2d")!.drawImage(v, 0, 0);
    // Il video è mostrato con object-fit: cover: riportiamo la cornice visibile
    // nelle coordinate del fotogramma.
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const scale = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const offX = (v.videoWidth * scale - cw) / 2;
    const offY = (v.videoHeight * scale - ch) / 2;
    const r = cardRectIn(cw, ch);
    const rect = new DOMRect(
      (r.x + offX) / scale,
      (r.y + offY) / scale,
      r.width / scale,
      r.height / scale,
    );
    return { frame, rect };
  }, []);

  const scanNow = useCallback(
    (fromAuto: boolean) => {
      if (busyRef.current) return;
      const c = captureVideo();
      if (c) void handleFrame(c.frame, c.rect, fromAuto);
    },
    [captureVideo, handleFrame],
  );

  useEffect(() => {
    if (camera !== "on" || !auto) return;
    const t = setInterval(() => scanNow(true), AUTO_INTERVAL);
    return () => clearInterval(t);
  }, [camera, auto, scanNow]);

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    const bmp = await createImageBitmap(file);
    const frame = document.createElement("canvas");
    frame.width = bmp.width;
    frame.height = bmp.height;
    frame.getContext("2d")!.drawImage(bmp, 0, 0);
    // In una foto la carta di solito riempie quasi tutta l'immagine.
    await handleFrame(frame, cardRectIn(bmp.width, bmp.height, 0.96), false);
  }

  function undo(item: Scanned) {
    const id = item.card.scryfallId;
    const e = id ? collection.get(id) : undefined;
    if (e) {
      if (item.foil) collection.setFoilQty(e.id, e.foilQty - 1);
      else collection.setQty(e.id, e.qty - 1);
    }
    setScanned((s) => s.filter((x) => x.key !== item.key));
    if (lastIdRef.current === id) lastIdRef.current = null;
  }

  const sessionValue = scanned.reduce(
    (a, s) => a + ((s.foil ? s.card.prices?.eurFoil : undefined) ?? s.card.prices?.eur ?? 0),
    0,
  );
  const last = scanned[0];

  function setMode(m: Mode) {
    if (m === "multi") stop();
    setModeState(m);
    try {
      localStorage.setItem("pm.scanMode", m);
    } catch {
      /* ignora */
    }
  }

  const head = (
    <>
      <div className="scan-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Scansiona
        </h1>
        <Link to="/collezione" className="small">
          Vai alla collezione →
        </Link>
      </div>
      <div className="scan-mode">
        <div className="segmented" role="tablist">
          <button
            type="button"
            className={mode === "single" ? "on" : ""}
            aria-pressed={mode === "single"}
            onClick={() => setMode("single")}
          >
            Una carta alla volta
          </button>
          <button
            type="button"
            className={mode === "multi" ? "on" : ""}
            aria-pressed={mode === "multi"}
            onClick={() => setMode("multi")}
          >
            Più carte da una foto
          </button>
        </div>
      </div>
    </>
  );

  if (mode === "multi") {
    return (
      <div className="page scan-page">
        {head}
        <MultiScan />
      </div>
    );
  }

  return (
    <div className="page scan-page">
      {head}

      <div className="scan-view" ref={boxRef}>
        <video ref={videoRef} playsInline muted className={camera === "on" ? "" : "hidden-video"} />
        {camera === "on" && (
          <div className="scan-frame" aria-hidden>
            <div className="scan-band title" />
            <div className="scan-band info" />
          </div>
        )}
        {camera !== "on" && (
          <div className="scan-placeholder">
            <p>
              Inquadra una carta alla volta, dritta e ben illuminata, con il{" "}
              <strong>nome</strong> nella fascia in alto della cornice. Le carte
              riconosciute finiscono subito nella collezione.
            </p>
            <button
              type="button"
              className="primary"
              onClick={start}
              disabled={camera === "starting"}
            >
              {camera === "starting" ? "Avvio…" : "📷 Avvia fotocamera"}
            </button>
          </div>
        )}
        {status.kind === "reading" && <div className="scan-toast">Leggo la carta…</div>}
        {status.kind === "loading" && camera === "on" && (
          <div className="scan-toast">Preparo il riconoscimento…</div>
        )}
      </div>

      <div className="scan-controls">
        <label className="scan-toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Automatico
        </label>
        <label className="scan-toggle">
          <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
          Foil
        </label>
        {camera === "on" ? (
          <>
            <button type="button" className="primary" onClick={() => scanNow(false)}>
              Scansiona ora
            </button>
            <button type="button" className="ghost" onClick={stop}>
              Spegni
            </button>
          </>
        ) : (
          <label className="ghost-file">
            Scatta o scegli una foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => fromPhoto(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {status.kind === "notfound" && (
        <div className="status-line">
          Non ho riconosciuto la carta{status.read ? ` (ho letto "${status.read}")` : ""}.
          Avvicinati, evita i riflessi e tieni il nome dentro la fascia in alto.
        </div>
      )}
      {status.kind === "error" && <div className="status-line error">{status.message}</div>}

      {last && (
        <div className="scan-last">
          {last.card.imageSmallUrl && <img src={last.card.imageSmallUrl} alt="" />}
          <div style={{ minWidth: 0 }}>
            <div className="muted small">Aggiunta alla collezione</div>
            <strong>{last.card.name}</strong>
            <div className="muted small">
              {(last.card.setCode ?? "").toUpperCase()} #{last.card.collectorNumber}
              {last.foil ? " · foil" : ""} · {formatPrice(last.card)}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" className="ghost" onClick={() => setDetail(last.card)}>
                Cambia stampa
              </button>
              <button type="button" className="ghost" onClick={() => undo(last)}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {scanned.length > 0 && (
        <>
          <div className="scan-summary">
            <span>
              <strong>{scanned.length}</strong> carte in questa sessione
            </span>
            <strong>{formatMoney(sessionValue, "EUR")}</strong>
          </div>
          <div className="collection-list">
            {scanned.slice(1).map((s) => (
              <div className="collection-row" key={s.key}>
                {s.card.imageSmallUrl ? (
                  <img src={s.card.imageSmallUrl} alt="" loading="lazy" />
                ) : (
                  <div className="no-img small" style={{ width: 46 }} />
                )}
                <div className="cr-main">
                  <div className="cr-name">{s.card.name}</div>
                  <div className="muted small">
                    {(s.card.setCode ?? "").toUpperCase()} #{s.card.collectorNumber}
                    {s.foil ? " · foil" : ""}
                  </div>
                </div>
                <div className="cr-right">
                  <div className="cr-value">{formatPrice(s.card)}</div>
                  <button
                    type="button"
                    className="ghost cr-remove"
                    onClick={() => undo(s)}
                    aria-label="Annulla"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
