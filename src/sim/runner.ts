// Avvia il worker e restituisce una Promise con le statistiche, propagando
// il progresso. Crea un worker nuovo per ogni run (semplice e sicuro).

import { CardInfo } from "../types";
import { SimConfig, SimStats } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./worker";
import type { BattleConfig, BattleResult } from "./battle";
import type { BattleRequest, BattleResponse } from "./battleWorker";

let counter = 0;

export function runInWorker(
  deck: CardInfo[],
  config: SimConfig,
  onProgress?: (p: number) => void,
): Promise<SimStats> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const id = ++counter;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") {
        onProgress?.(msg.value);
      } else if (msg.type === "done") {
        resolve(msg.stats);
        worker.terminate();
      } else {
        reject(new Error(msg.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };

    const req: WorkerRequest = { id, deck, config };
    worker.postMessage(req);
  });
}

export function runBattleInWorker(
  deckA: CardInfo[],
  deckB: CardInfo[],
  config: BattleConfig,
  onProgress?: (p: number) => void,
): Promise<BattleResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./battleWorker.ts", import.meta.url), {
      type: "module",
    });
    const id = ++counter;

    worker.onmessage = (e: MessageEvent<BattleResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") {
        onProgress?.(msg.value);
      } else if (msg.type === "done") {
        resolve(msg.result);
        worker.terminate();
      } else {
        reject(new Error(msg.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };

    const req: BattleRequest = { id, deckA, deckB, config };
    worker.postMessage(req);
  });
}
