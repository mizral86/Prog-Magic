// Copia dist/index.html in dist/404.html così i deep-link SPA funzionano
// anche su host statici (GitHub Pages serve 404.html per i percorsi ignoti).
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = join(root, "dist", "index.html");
const notFound = join(root, "dist", "404.html");
if (existsSync(index)) {
  copyFileSync(index, notFound);
  console.log("Creato dist/404.html");
}
