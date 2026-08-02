// Barra orizzontale riutilizzabile per i mini-grafici.

interface BarProps {
  label: string;
  value: number; // valore da mostrare a destra
  fraction: number; // 0..1 riempimento
  display?: string; // testo alternativo a destra
}

export function Bar({ label, value, fraction, display }: BarProps) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="bar-row">
      <span>{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="bar-label-right">
        {display ?? value.toFixed(1)}
      </span>
    </div>
  );
}
