// Genera i PNG delle icone PWA a partire dagli SVG in scripts/.
// Uso: node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

const icon = readFileSync(join(here, "icon.svg"));
const maskable = readFileSync(join(here, "icon-maskable.svg"));

const jobs = [
  [icon, 192, "pwa-192x192.png"],
  [icon, 512, "pwa-512x512.png"],
  [maskable, 512, "maskable-512x512.png"],
  [icon, 180, "apple-touch-icon.png"],
  [icon, 64, "favicon.png"],
];

for (const [svg, size, name] of jobs) {
  await sharp(svg).resize(size, size).png().toFile(join(pub, name));
  console.log("ok:", name, `${size}x${size}`);
}
console.log("Icone generate in public/");
