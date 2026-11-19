// Se una pagina va in errore mostra un messaggio con "Riprova" invece di
// lasciare lo schermo bianco. Il resto dell'app (barra in alto e in basso)
// continua a funzionare e cambiando pagina l'errore si azzera.

import { Component, ReactNode } from "react";

interface Props {
  /** Cambia quando cambia pagina: azzera l'errore. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const RELOAD_FLAG = "mm.chunkReload";

/** Dopo un aggiornamento dell'app i vecchi pezzi non esistono più. */
function isStaleChunk(e: Error): boolean {
  return /dynamically imported module|importing a module script failed|failed to fetch.*module|chunkloaderror|loading chunk/i.test(
    `${e.name} ${e.message}`,
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Errore nella pagina:", error);
    // Una nuova versione è stata pubblicata mentre l'app era aperta:
    // ricarica una volta sola per prendere i file nuovi.
    if (isStaleChunk(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
        }
      } catch {
        /* niente */
      }
    }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <div className="page">
        <div className="panel error-panel" role="alert">
          <h1 className="page-title">Qualcosa è andato storto</h1>
          <p>
            {offline
              ? "Sembra che manchi la connessione e questa pagina non è ancora salvata sul dispositivo."
              : "Questa pagina ha avuto un problema. I tuoi dati sono al sicuro."}
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="primary" onClick={() => this.setState({ error: null })}>
              Riprova
            </button>
            <button type="button" className="ghost" onClick={() => window.location.reload()}>
              Ricarica l'app
            </button>
          </div>
          <details className="muted small">
            <summary>Dettagli per chi sviluppa</summary>
            <code className="error-detail">{error.message || String(error)}</code>
          </details>
        </div>
      </div>
    );
  }
}

/** Da chiamare quando l'app è partita bene: permette un'altra ricarica in futuro. */
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* niente */
  }
}
