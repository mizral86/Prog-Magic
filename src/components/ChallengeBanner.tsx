// Avviso in alto quando un amico ti sfida al Tavolo (ovunque tu sia nell'app).

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { shownName } from "../friends";
import { useFriends } from "../friendsContext";
import { parseInvite } from "../onlineGame";

export function ChallengeBanner() {
  const fr = useFriends();
  const navigate = useNavigate();
  const loc = useLocation();
  const [inv, setInv] = useState<{ gameId: string; from: string } | null>(null);

  useEffect(() => {
    if (fr.status !== "ready") return;
    return fr.onMessage((m, kind) => {
      if (kind !== "new" || m.receiver !== fr.uid) return;
      const p = parseInvite(m.body);
      if (p) setInv({ gameId: p.gameId, from: m.sender });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fr.status, fr.uid]);

  // Già nella chat con chi sfida: lì c'è il pulsante.
  if (!inv || loc.pathname === `/amici/${inv.from}`) return null;
  const name = shownName(fr.friends.find((f) => f.id === inv.from)?.profile);
  return (
    <div className="challenge-banner" role="alert">
      <span>
        ⚔ <b>{name}</b> ti sfida al Tavolo!
      </span>
      <button
        className="primary small-btn"
        onClick={() => {
          setInv(null);
          navigate(`/gioca?partita=${inv.gameId}&contro=${inv.from}`);
        }}
      >
        Gioca
      </button>
      <button className="ghost small-btn" onClick={() => setInv(null)}>
        Dopo
      </button>
    </div>
  );
}
