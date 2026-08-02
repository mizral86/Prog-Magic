// Web Worker: esegue le simulazioni pesanti senza bloccare la UI.
// Riceve mazzo espanso + config, rimanda progresso e risultato.

import { CardInfo } from "../types";
import { runSimulation, SimConfig, SimStats } from "./engine";

export interface WorkerRequest {
  id: number;
  deck: CardInfo[];
  config: SimConfig;
}

export type WorkerResponse =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; stats: SimStats }
  | { id: number; type: "error"; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, deck, config } = e.data;
  try {
    const stats = runSimulation(deck, config, (p) => {
      const msg: WorkerResponse = { id, type: "progress", value: p };
      self.postMessage(msg);
    });
    const msg: WorkerResponse = { id, type: "done", stats };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerResponse = {
      id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
