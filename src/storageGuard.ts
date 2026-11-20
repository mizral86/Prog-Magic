// Se la memoria del browser è piena, un salvataggio di collezione, mazzi o
// wishlist fallisce. Prima di arrendersi prova a liberare spazio togliendo
// le cache che si possono riscaricare; se non basta avvisa l'utente (vedi
// StorageWarning) invece di perdere le modifiche in silenzio.

/** Chiavi che si possono cancellare senza perdere dati: si riscaricano. */
const DISPOSABLE = ["mm.meta.v1", "mm.meta.check"];

export const STORAGE_FULL_EVENT = "mm:storage-full";

function isQuota(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    e.code === 22 ||
    e.code === 1014
  );
}

let installed = false;

export function installStorageGuard() {
  if (installed || typeof Storage === "undefined") return;
  installed = true;
  const proto = Storage.prototype;
  const orig = proto.setItem;
  proto.setItem = function (this: Storage, key: string, value: string) {
    try {
      orig.call(this, key, value);
    } catch (e) {
      if (!isQuota(e)) throw e;
      // Libera le cache e riprova una volta.
      let freed = false;
      for (const k of DISPOSABLE) {
        if (k !== key && this.getItem(k) !== null) {
          this.removeItem(k);
          freed = true;
        }
      }
      if (freed) {
        try {
          orig.call(this, key, value);
          return;
        } catch (e2) {
          if (!isQuota(e2)) throw e2;
        }
      }
      // I dati veri dell'app iniziano con "pm.": avvisa che non sono salvati.
      if (key.startsWith("pm.")) window.dispatchEvent(new CustomEvent(STORAGE_FULL_EVENT, { detail: key }));
      throw e;
    }
  };
}
