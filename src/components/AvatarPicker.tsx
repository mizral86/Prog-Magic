// Scelta dell'immagine profilo. Scheda "Simboli": i simboli di mana pastello
// dell'app per un colore, le gilde di Ravnica (due colori) e i trii (frammenti
// di Alara e clan di Tarkir). Scheda "Planeswalker": illustrazioni dei
// planeswalker (art crop da Scryfall, una per illustrazione, più recenti prima).

import { FormEvent, useEffect, useRef, useState } from "react";
import { symbolAvatarUrl } from "../friends";

export interface ColorFilter {
  id: string;
  label: string;
  /** Colori del simbolo, es. "W", "WU", "WUB"; "C" = incolore. */
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

function firstUrl(text: string): string {
  // Il testo libero cerca nel nome (anche in italiano); il resto filtra i planeswalker.
  const q = `t:planeswalker -is:digital${text.trim() ? ` ${text.trim()}` : ""}`;
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
  const [tab, setTab] = useState<"sym" | "pw">(
    current && !current.startsWith("sym:") ? "pw" : "sym",
  );

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
    if (tab === "pw" && !cached && !items.length && !busy) void load(firstUrl(""), false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    setShown(t);
    if (!t && cached) {
      req.current++;
      setItems(cached.items);
      setNext(cached.next);
      setErr(null);
      setBusy(false);
      return;
    }
    void load(firstUrl(t), false, !t);
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
          L'immagine scelta si vede nel tuo profilo, tra gli amici, in chat e nei gruppi.
        </p>
        <div className="avatar-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "sym"} className={tab === "sym" ? "on" : ""} onClick={() => setTab("sym")}>
            Simboli
          </button>
          <button type="button" role="tab" aria-selected={tab === "pw"} className={tab === "pw" ? "on" : ""} onClick={() => setTab("pw")}>
            Planeswalker
          </button>
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
        {tab === "sym" ? (
          <>
            {err && <p className="account-error">{err}</p>}
            {COLOR_GROUPS.map((g) => (
              <section key={g.title}>
                <div className="avatar-color-title">{g.title}</div>
                <div className="avatar-grid avatar-grid-sym">
                  {g.items.map((f) => {
                    const val = `sym:${f.colors}`;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`avatar-opt${current === val ? " on" : ""}`}
                        disabled={!!saving}
                        onClick={() => void pick(val)}
                        title={f.label}
                      >
                        <span className="avatar-opt-img avatar-opt-sym" style={{ backgroundImage: `url("${symbolAvatarUrl(val)}")` }} />
                        <span className="avatar-opt-name">{saving === val ? "Salvo…" : f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        ) : (
        <>
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
          <button type="button" className="ghost avatar-more" onClick={() => void load(next, true, !shown)}>
            Mostra altri
          </button>
        )}
        </>
        )}
      </div>
    </div>
  );
}
