// Sezione "Collezione" — in arrivo (Fase 2).

export default function CollectionPage() {
  return (
    <div className="page">
      <h1 className="page-title">Collezione</h1>
      <div className="coming-soon">
        <div className="cs-emoji">📚</div>
        <h2>In arrivo</h2>
        <p className="muted">
          Qui potrai gestire la tua collezione: aggiungere carte (quantità,
          foil, edizione), vedere il valore totale e le statistiche. I dati
          resteranno salvati sul dispositivo.
        </p>
      </div>
    </div>
  );
}
