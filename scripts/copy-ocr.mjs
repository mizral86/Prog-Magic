// Copia in public/ocr/ i file del riconoscimento del testo (Tesseract):
// script del worker, motore WebAssembly e dati della lingua inglese.
// Così lo scanner li scarica dal sito stesso (niente CDN esterni) e, dopo il
// primo uso, funziona anche senza rete. La cartella non va su git: viene
// ricreata a ogni dev/build dai pacchetti in node_modules.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const out = join(root, "public", "ocr");
mkdirSync(out, { recursive: true });

const files = [
  [join(pkgDir("tesseract.js"), "dist", "worker.min.js"), "worker.min.js"],
  // Solo i motori "LSTM" (quelli usati con OEM.LSTM_ONLY, il predefinito):
  // con SIMD per i dispositivi recenti, senza per gli altri.
  [join(pkgDir("tesseract.js-core"), "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [join(pkgDir("tesseract.js-core"), "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

for (const [from, name] of files) {
  const to = join(out, name);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
}
console.log("File OCR pronti in public/ocr/");
