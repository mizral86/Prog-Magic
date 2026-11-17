// Galleria per scegliere l'immagine profilo tra le illustrazioni dei
// planeswalker (art crop da Scryfall, una per illustrazione, più recenti prima).
// Si può filtrare per colori: un colore, gilde di Ravnica (coppie) e trii
// (frammenti di Alara e clan di Tarkir).

import { FormEvent, useEffect, useRef, useState } from "react";
import { ManaSymbol } from "./ManaSymbol";

export interface ColorFilter {
  id: string;
  label: string;
  /** Colori esatti in sintassi Scryfall (c=…); "C" = incolore, "4+" = quattro o più. */
  colors: string;
}

export const COLOR_GROUPS: { title: string; items: ColorFilter[] }[] = [
  {
    title: "Un colore",
    items: [
      { id: "w", label: "Bianco", colors: "W" },
      { id: "u", label: "Blu", colors: "U" },
      { id: "b", label: "Nero", colors: "B" },
      { id: "r", label: "Rosso", colors: "R" },
      { id: "g", label: "Verde", colors: "G" },
      { id: "c", label: "Incolore", colors: "C" },
    ],
  },
  {
    title: "Gilde di Ravnica",
    items: [
      { id: "azorius", label: "Azorius", colors: "WU" },
      { id: "dimir", label: "Dimir", colors: "UB" },
      { id: "rakdos", label: "Rakdos", colors: "BR" },
      { id: "gruul", label: "Gruul", colors: "RG" },
      { id: "selesnya", label: "Selesnya", colors: "GW" },
      { id: "orzhov", label: "Orzhov", colors: "WB" },
      { id: "izzet", label: "Izzet", colors: "UR" },
      { id: "golgari", label: "Golgari", colors: "BG" },
      { id: "boros", label: "Boros", colors: "RW" },
      { id: "simic", label: "Simic", colors: "GU" },
    ],
  },
  {
    title: "Tre colori",
    items: [
      { id: "esper", label: "Esper", colors: "WUB" },
      { id: "grixis", label: "Grixis", colors: "UBR" },
      { id: "jund", label: "Jund", colors: "BRG" },
      { id: "naya", label: "Naya", colors: "RGW" },
      { id: "bant", label: "Bant", colors: "GWU" },
      { id: "abzan", label: "Abzan", colors: "WBG" },
      { id: "jeskai", label: "Jeskai", colors: "URW" },
      { id: "sultai", label: "Sultai", colors: "BGU" },
      { id: "mardu", label: "Mardu", colors: "RWB" },
      { id: "temur", label: "Temur", colors: "GUR" },
      { id: "four", label: "4-5 colori", colors: "4+" },
    ],
  },
];

export interface AvatarOption {
  name: string;
  url: string;
}

interface ScryFace {
  name?: string;
  type_line?: string;
  image_uris?: { art_crop?: string };
}
interface ScryCard extends ScryFace {
  card_faces?: ScryFace[];
}
interface ScryPage {
  data: ScryCard[];
  has_more?: boolean;
  next_page?: string;
}

const SEARCH = "https://api.scryfall.com/cards/search";

function colorQuery(f: ColorFilter | null): string {
  if (!f) return "";
  if (f.colors === "4+") return " c>=4";
  return ` c=${f.colors.toLowerCase()}`;
}

function firstUrl(text: string, f: ColorFilter | null = null): string {
  // Il testo libero cerca nel nome (anche in italiano); il resto filtra i planeswalker.
  const q = `t:planeswalker -is:digital${colorQuery(f)}${text.trim() ? ` ${text.trim()}` : ""}`;
  return `${SEARCH}?q=${encodeURIComponent(q)}&unique=art&order=released&dir=desc&include_multilingual=true`;
}

/** Per le carte bifronte prende la faccia planeswalker (es. i "Origins"). */
function toOption(c: ScryCard): AvatarOption | null {
  const faces = c.card_faces ?? [];
  const pw = faces.find((f) => /planeswalker/i.test(f.type_line ?? "") && f.image_uris?.art_crop);
  if (pw) return { name: pw.name ?? c.name ?? "", url: pw.image_uris!.art_crop! };
  const url = c.image_uris?.art_crop ?? faces[0]?.image_uris?.art_crop;
  return url ? { name: (c.name ?? "").split(" // ")[0], url } : null;
}

// La prima pagina senza filtro resta in memoria: riaprendo la galleria è subito pronta.
let cached: { items: AvatarOption[]; next: string | null } | null = null;

export default function AvatarPicker({
  current,
  onPick,
  onClose,
}: {
  current?: string | null;
  /** null = togli l'immagine (torna l'iniziale). */
  onPick: (url: string | null) => Promise<void> | void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<AvatarOption[]>(cached?.items ?? []);
  const [next, setNext] = useState<string | null>(cached?.next ?? null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const req = useRef(0);
  // Testo della ricerca mostrata adesso ("" = tutti i planeswalker).
  const [shown, setShown] = useState("");
  const [color, setColor] = useState<ColorFilter | null>(null);

  async function load(url: string, append: boolean, cache = false) {
    const id = ++req.current;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (id !== req.current) return;
      if (res.status === 404) {
        if (!append) setItems([]);
        setNext(null);
        setErr("Nessun planeswalker trovato con questi filtri.");
        return;
      }
      if (!res.ok) throw new Error(`Scryfall ha risposto ${res.status}. Riprova tra poco.`);
      const page = (await res.json()) as ScryPage;
      if (id !== req.current) return;
      const got = page.data.map(toOption).filter((o): o is AvatarOption => !!o);
      const nextUrl = page.has_more && page.next_page ? page.next_page : null;
      setItems((old) => {
        const all = append ? [...old, ...got] : got;
        const seen = new Set<string>();
        const out = all.filter((o) => (seen.has(o.url) ? false : (seen.add(o.url), true)));
        if (cache) cached = { items: out, next: nextUrl };
        return out;
      });
      setNext(nextUrl);
    } catch (e) {
      if (id !== req.current) return;
      const m = e instanceof Error ? e.message : String(e);
      setErr(/fetch|network/i.test(m) ? "Connessione assente: riprova." : m);
    } finally {
      if (id === req.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!cached) void load(firstUrl(""), false, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    show(text.trim(), color);
  }

  function show(t: string, f: ColorFilter | null) {
    setShown(t);
    setColor(f);
    if (!t && !f && cached) {
      req.current++;
      setItems(cached.items);
      setNext(cached.next);
      setErr(null);
      setBusy(false);
      return;
    }
    void load(firstUrl(t, f), false, !t && !f);
  }

  async function pick(url: string | null) {
    setSaving(url ?? "none");
    setErr(null);
    try {
      await onPick(url);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="avatar-veil" onClick={onClose}>
      <div className="avatar-sheet" role="dialog" aria-label="Scegli l'immagine profilo" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-sheet-head">
          <strong>Immagine profilo</strong>
          <button type="button" className="ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>
        <p className="muted small" style={{ margin: "0 0 8px" }}>
          Scegli il tuo planeswalker: la sua illustrazione sarà la tua immagine per amici, chat e gruppi.
        </p>
        <form className="avatar-search" onSubmit={search}>
          <input
            type="search"
            value={text}
            placeholder="Cerca un planeswalker (es. Jace, Chandra…)"
            onChange={(e) => setText(e.target.value)}
            aria-label="Cerca un planeswalker"
          />
          <button type="submit" className="primary" disabled={busy}>
            Cerca
          </button>
        </form>
        <div className="avatar-colors">
          <button
            type="button"
            className={`avatar-chip${!color ? " on" : ""}`}
            onClick={() => show(text.trim(), null)}
          >
            Tutti i colori
          </button>
          {COLOR_GROUPS.map((g) => (
            <div key={g.title} className="avatar-color-group">
              <div className="avatar-color-title">{g.title}</div>
              <div className="avatar-chips">
                {g.items.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`avatar-chip${color?.id === f.id ? " on" : ""}`}
                    onClick={() => show(text.trim(), color?.id === f.id ? null : f)}
                    aria-pressed={color?.id === f.id}
                  >
                    {f.colors !== "4+" && (
                      <span className="avatar-chip-mana" aria-hidden>
                        {f.colors.split("").map((c, i) => (
                          <ManaSymbol key={i} sym={c} size={15} />
                        ))}
                      </span>
                    )}
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {current && (
          <button
            type="button"
            className="link-btn avatar-remove"
            disabled={!!saving}
            onClick={() => void pick(null)}
          >
            Togli immagine (usa l'iniziale)
          </button>
        )}
        {err && <p className="account-error">{err}</p>}

        <div className="avatar-grid">
          {items.map((o) => (
            <button
              key={o.url}
              type="button"
              className={`avatar-opt${current === o.url ? " on" : ""}`}
              disabled={!!saving}
              onClick={() => void pick(o.url)}
              title={o.name}
            >
              <span className="avatar-opt-img" style={{ backgroundImage: `url("${o.url}")` }} />
              <span className="avatar-opt-name">{saving === o.url ? "Salvo…" : o.name}</span>
            </button>
          ))}
        </div>
        {busy && <p className="muted small">Carico i planeswalker…</p>}
        {!busy && next && (
          <button type="button" className="ghost avatar-more" onClick={() => void load(next, true, !shown && !color)}>
            Mostra altri
          </button>
        )}
      </div>
    </div>
  );
}
