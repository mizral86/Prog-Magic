// Consigli di matchup per un mazzo: sintesi, giocate forti, cosa temere,
// e piano di sideboard.

import { MatchupAdvice } from "../advice";

interface AdviceViewProps {
  advice: MatchupAdvice;
  selfName: string;
  oppName: string;
}

export function AdviceView({ advice, selfName, oppName }: AdviceViewProps) {
  const { sideboard } = advice;
  return (
    <div className="advice panel">
      <h2 style={{ marginTop: 0 }}>
        {selfName} <span style={{ color: "var(--muted)" }}>vs</span> {oppName}
      </h2>
      <div className="summary">{advice.summary}</div>

      <h3>✅ Giocate forti</h3>
      <ul className="tips">
        {advice.strongPlays.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <h3>⚠️ Attenzione a</h3>
      <ul className="tips">
        {advice.watchOut.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <h3>🔁 Piano di sideboard</h3>
      {sideboard.in.length === 0 ? (
        <div className="side-note">{sideboard.note}</div>
      ) : (
        <>
          {sideboard.in.map((m, i) => (
            <div className="side-move in" key={`in-${i}`}>
              <span className="qty">+{m.qty}</span>
              <span>
                <strong>{m.card}</strong>
                <span className="reason"> — {m.reason}</span>
              </span>
            </div>
          ))}
          {sideboard.out.map((m, i) => (
            <div className="side-move out" key={`out-${i}`}>
              <span className="qty">−{m.qty}</span>
              <span>
                <strong>{m.card}</strong>
                <span className="reason"> — {m.reason}</span>
              </span>
            </div>
          ))}
          <div className="side-note">{sideboard.note}</div>
        </>
      )}
    </div>
  );
}
