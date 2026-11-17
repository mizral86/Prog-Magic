// SOLO SVILUPPO: finto canale della partita in due tra schede dello stesso
// browser (BroadcastChannel), da usare insieme a ?finto=nome.

import type { GameLink, NetHandlers, NetMsg } from "../onlineGame";

export function fakeLink(gameId: string, uid: string, h: NetHandlers): GameLink {
  const bc = new BroadcastChannel(`pmdev.tavolo.${gameId}`);
  const seen = new Map<string, number>();
  const peers = () => {
    const on = new Set([uid]);
    for (const [id, at] of seen) if (Date.now() - at < 3500) on.add(id);
    return on;
  };
  let last = "";
  const report = () => {
    const p = peers();
    const k = [...p].sort().join(",");
    if (k !== last) {
      last = k;
      h.onPeers(p);
    }
  };
  bc.onmessage = (e) => {
    const { from, m } = e.data as { from: string; m: NetMsg };
    if (from === uid) return;
    seen.set(from, Date.now());
    report();
    if (m.t !== "ping") h.onMsg(m, from);
  };
  const ping = () => bc.postMessage({ from: uid, m: { t: "ping" } });
  ping();
  report();
  h.onStatus?.(true);
  const t = window.setInterval(() => {
    ping();
    report();
  }, 1000);
  return {
    send(m) {
      bc.postMessage({ from: uid, m });
    },
    close() {
      window.clearInterval(t);
      bc.close();
    },
  };
}
