// Web Worker per il simulatore interattivo.

import { CardInfo } from "../types";
import { BattleConfig, BattleResult, runBattle } from "./battle";

export interface BattleRequest {
  id: number;
  deckA: CardInfo[];
  deckB: CardInfo[];
  config: BattleConfig;
}

export type BattleResponse =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; result: BattleResult }
  | { id: number; type: "error"; message: string };

self.onmessage = (e: MessageEvent<BattleRequest>) => {
  const { id, deckA, deckB, config } = e.data;
  try {
    const result = runBattle(deckA, deckB, config, (p) => {
      const msg: BattleResponse = { id, type: "progress", value: p };
      self.postMessage(msg);
    });
    const msg: BattleResponse = { id, type: "done", result };
    self.postMessage(msg);
  } catch (err) {
    const msg: BattleResponse = {
      id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
