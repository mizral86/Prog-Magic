// Avviso fisso quando il telefono non riesce più a salvare i dati dell'app.

import { useEffect, useState } from "react";
import { downloadText, makeBackup } from "../collectionIO";
import { STORAGE_FULL_EVENT } from "../storageGuard";

export default function StorageWarning() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(true);
    window.addEventListener(STORAGE_FULL_EVENT, on);
    return () => window.removeEventListener(STORAGE_FULL_EVENT, on);
  }, []);
  if (!full) return null;
  return (
    <div className="storage-warning" role="alert">
      <b>Memoria piena: le ultime modifiche non sono state salvate.</b>
      <span>
        Restano solo finché l'app è aperta. Libera spazio sul telefono o nel browser (dati dei
        siti), oppure togli mazzi o carte che non usi, e riprova. Intanto puoi scaricare un backup
        di ciò che è già salvato.
      </span>
      <span className="storage-warning-actions">
        <button
          type="button"
          className="ghost small-btn"
          onClick={() =>
            downloadText(
              `menga-deck-backup-${new Date().toISOString().slice(0, 10)}.json`,
              makeBackup(),
              "application/json",
            )
          }
        >
          💾 Scarica backup
        </button>
        <button type="button" className="link-btn small" onClick={() => setFull(false)}>
          Ho capito
        </button>
      </span>
    </div>
  );
}
