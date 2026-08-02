// Glossario: spiega cosa significano le metriche mostrate.

export function MetricsGlossary() {
  return (
    <details className="explain">
      <summary>Cosa significano le metriche e le percentuali?</summary>
      <div className="explain-text">
        <p>
          Le simulazioni sono <strong>goldfish</strong>: ogni mazzo gioca da
          solo, senza avversario. Servono a misurare quanto è regolare e veloce
          il suo motore.
        </p>
        <ul>
          <li>
            <strong>Mani tenute a 7</strong>: quota di partite in cui la mano
            iniziale (2–5 terre) è stata tenuta senza mulligan. Più alta = più
            regolare.
          </li>
          <li>
            <strong>Mulligan medi</strong>: numero medio di mulligan per
            partita.
          </li>
          <li>
            <strong>Turno medio "attivo"</strong>: turno in cui il mazzo lancia
            la sua prima magia importante (CMC ≥ mediana delle magie). È una
            proxy di "quando il piano parte".
          </li>
          <li>
            <strong>Terre in gioco per turno</strong>: media delle terre in
            gioco; mostra flood/screw e la curva di sviluppo del mana.
          </li>
          <li>
            <strong>Deck attivo entro il turno</strong>: probabilità di aver già
            lanciato la magia chiave entro quel turno.
          </li>
          <li>
            <strong>Disponibilità colore</strong>: probabilità di avere una
            fonte di quel colore entro il turno.
          </li>
        </ul>
        <p>
          La <strong>percentuale di confronto</strong> combina quattro fattori
          (velocità, consistenza, risposte alle minacce avversarie, resilienza
          delle proprie minacce), ciascuno pesato; la differenza dei punteggi
          diventa una probabilità. È una <strong>stima</strong> del matchup
          sulla carta, non una win-rate simulata partita per partita.
        </p>
      </div>
    </details>
  );
}
