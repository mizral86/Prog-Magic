// Tema dell'app: segue il sistema oppure la scelta salvata (chiaro/scuro).

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "pm.theme";

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage non disponibile */
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  current = choice;
  syncMode();
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* ignora */
  }
}

/** Tema effettivo in questo momento (per l'icona del pulsante). */
export function isDark(choice: ThemeChoice): boolean {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

// data-mode = tema effettivo ("light" | "dark"), anche quando si segue il
// sistema: serve al CSS per le decorazioni del tema chiaro "Acquerello".
let current: ThemeChoice = "system";
let listening = false;
function syncMode() {
  document.documentElement.setAttribute("data-mode", isDark(current) ? "dark" : "light");
  if (!listening && window.matchMedia) {
    listening = true;
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => syncMode());
  }
}
