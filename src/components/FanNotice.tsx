// Avviso richiesto dalla Fan Content Policy di Wizards of the Coast, con i
// link a privacy e termini. Compare in fondo a Cerca e ad Account.

export default function FanNotice() {
  const base = import.meta.env.BASE_URL;
  return (
    <footer className="fan-notice muted small">
      <p>
        Menga Deck è un contenuto non ufficiale consentito dalla Fan Content Policy di Wizards of
        the Coast. Non è approvato né sponsorizzato da Wizards. Alcuni materiali usati sono
        proprietà di Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
      <p>
        Dati e immagini delle carte da Scryfall ·{" "}
        <a href={`${base}privacy.html`}>Privacy</a> · <a href={`${base}termini.html`}>Termini</a>
      </p>
    </footer>
  );
}
