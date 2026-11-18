// Crea i simboli a tre colori (frammenti di Alara e clan di Tarkir) e quello
// incolore in public/mana/, nello stesso stile dei simboli di mana pastello:
// disco diviso in tre spicchi, ognuno con il simbolo del suo colore.
// Uso: node scripts/gen-trio-symbols.mjs

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mana");
const S = 256;
const C = S / 2;

// Colore di fondo di ogni simbolo, letto dal bordo del disco.
async function bg(sym) {
  const data = await sharp(join(dir, `${sym}.webp`))
    .extract({ left: C, top: 10, width: 1, height: 1 })
    .raw()
    .toBuffer();
  return `rgb(${data[0]},${data[1]},${data[2]})`;
}

function sector(a0, a1, fill) {
  const p = (a) => [C + C * Math.cos(a), C + C * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `<path d="M${C},${C} L${x0},${y0} A${C},${C} 0 0 1 ${x1},${y1} Z" fill="${fill}"/>`;
}

async function trio(code) {
  const syms = code.split("");
  const deg = Math.PI / 180;
  // Primo colore in alto, poi in senso orario: basso a destra, basso a sinistra.
  const starts = [-150, -30, 90];
  const fills = await Promise.all(syms.map(bg));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <clipPath id="c"><circle cx="${C}" cy="${C}" r="${C}"/></clipPath>
    <g clip-path="url(#c)">${starts.map((s, i) => sector(s * deg, (s + 120) * deg, fills[i])).join("")}</g>
  </svg>`;
  const size = 100;
  const r = 66; // distanza dal centro dei simboli piccoli
  const glyphs = await Promise.all(
    syms.map(async (sym, i) => {
      const mid = (starts[i] + 60) * deg;
      const input = await sharp(join(dir, `${sym}.webp`)).resize(size, size).png().toBuffer();
      return {
        input,
        left: Math.round(C + r * Math.cos(mid) - size / 2),
        top: Math.round(C + r * Math.sin(mid) - size / 2),
      };
    }),
  );
  await sharp(Buffer.from(svg)).composite(glyphs).webp({ quality: 90 }).toFile(join(dir, `${code}.webp`));
}

async function colorless() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="20" fill="#cbc5c0"/>
    <path d="M20 7 L31 20 L20 33 L9 20 Z M20 13 L26 20 L20 27 L14 20 Z" fill="#0d0f0f" fill-rule="evenodd"/>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(join(dir, "C.webp"));
}

const TRIOS = ["WUB", "UBR", "BRG", "RGW", "GWU", "WBG", "URW", "BGU", "RWB", "GUR"];
for (const t of TRIOS) await trio(t);
await colorless();
console.log("Creati", TRIOS.length + 1, "simboli in", dir);
