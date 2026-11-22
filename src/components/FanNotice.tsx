// Avviso richiesto dalla Fan Content Policy di Wizards of the Coast, con i
// link a privacy e termini. Compare in fondo a Cerca e ad Account.

import { legalPage } from "../i18n";

export default function FanNotice() {
  return (
    <footer className="fan-notice muted small">
      <p>
        Menga Deck è un contenuto non ufficiale consentito dalla Fan Content Policy di Wizards of
        the Coast. Non è approvato né sponsorizzato da Wizards. Alcuni materiali usati sono
        proprietà di Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
      <p>
        Dati e immagini delle carte da Scryfall ·{" "}
        <a href={legalPage("privacy")}>Privacy</a> · <a href={legalPage("termini")}>Termini</a>
      </p>
    </footer>
  );
}
