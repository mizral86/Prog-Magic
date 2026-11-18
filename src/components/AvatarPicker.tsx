// Scelta dell'immagine profilo. Scheda "Simboli": per ogni colore, gilda di
// Ravnica e trio (frammenti di Alara e clan di Tarkir) l'illustrazione di una
// carta iconica (art crop da Scryfall), con il simbolo di mana pastello
// dell'app nell'angolo; se Scryfall non risponde resta il solo simbolo. Scheda "Planeswalker": illustrazioni dei
// planeswalker (art crop da Scryfall, una per illustrazione, più recenti prima).

import { FormEvent, useEffect, useRef, useState } from "react";
import { symbolAvatarUrl } from "../friends";

export interface ColorFilter {
  id: string;
  label: string;
  /** Colori del simbolo, es. "W", "WU", "WUB"; "C" = incolore. */
  colors: string;
  /** Carta iconica di cui usare l'illustrazione, e il set dell'illustrazione preferita. */
  card: string;
  set: string;
}

export const COLOR_GROUPS: { title: string; items: ColorFilter[] }[] = [
  {
    title: "Un colore",
    items: [
      { id: "w", label: "Bianco", colors: "W", card: "Serra Angel", set: "dom" },
      { id: "u", label: "Blu", colors: "U", card: "Counterspell", set: "mh2" },
      { id: "b", label: "Nero", colors: "B", card: "Demonic Tutor", set: "uma" },
      { id: "r", label: "Rosso", colors: "R", card: "Lightning Bolt", set: "m10" },
      { id: "g", label: "Verde", colors: "G", card: "Llanowar Elves", set: "dom" },
      { id: "c", label: "Incolore", colors: "C", card: "Emrakul, the Aeons Torn", set: "roe" },
    ],
  },
  {
    title: "Gilde di Ravnica",
    items: [
      { id: "azorius", label: "Azorius", colors: "WU", card: "Isperia, Supreme Judge", set: "rtr" },
      { id: "dimir", label: "Dimir", colors: "UB", card: "Lazav, Dimir Mastermind", set: "rtr" },
      { id: "rakdos", label: "Rakdos", colors: "BR", card: "Rakdos, Lord of Riots", set: "rtr" },
      { id: "gruul", label: "Gruul", colors: "RG", card: "Borborygmos Enraged", set: "gtc" },
      { id: "selesnya", label: "Selesnya", colors: "GW", card: "Trostani, Selesnya's Voice", set: "rtr" },
      { id: "orzhov", label: "Orzhov", colors: "WB", card: "Obzedat, Ghost Council", set: "gtc" },
      { id: "izzet", label: "Izzet", colors: "UR", card: "Niv-Mizzet, Dracogenius", set: "rtr" },
      { id: "golgari", label: "Golgari", colors: "BG", card: "Jarad, Golgari Lich Lord", set: "rtr" },
      { id: "boros", label: "Boros", colors: "RW", card: "Aurelia, the Warleader", set: "gtc" },
      { id: "simic", label: "Simic", colors: "GU", card: "Prime Speaker Zegana", set: "gtc" },
    ],
  },
  {
    title: "Tre colori",
    items: [
      { id: "esper", label: "Esper", colors: "WUB", card: "Esper Panorama", set: "ala" },
      { id: "grixis", label: "Grixis", colors: "UBR", card: "Grixis Panorama", set: "ala" },
      { id: "jund", label: "Jund", colors: "BRG", card: "Jund Panorama", set: "ala" },
      { id: "naya", label: "Naya", colors: "RGW", card: "Naya Panorama", set: "ala" },
      { id: "bant", label: "Bant", colors: "GWU", card: "Bant Panorama", set: "ala" },
      { id: "abzan", label: "Abzan", colors: "WBG", card: "Anafenza, the Foremost", set: "ktk" },
      { id: "jeskai", label: "Jeskai", colors: "URW", card: "Narset, Enlightened Master", set: "ktk" },
      { id: "sultai", label: "Sultai", colors: "BGU", card: "Sidisi, Brood Tyrant", set: "ktk" },
      { id: "mardu", label: "Mardu", colors: "RWB", card: "Zurgo Helmsmasher", set: "ktk" },
      { id: "temur", label: "Temur", colors: "GUR", card: "Surrak Dragonclaw", set: "ktk" },
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
const COLLECTION = "https://api.scryfall.com/cards/collection";

/** Illustrazioni delle carte iconiche: nome carta (minuscolo) → art crop. */
let iconicArt: Map<string, string> | null = null;

function artOf(c: ScryCard): string | undefined {
  return c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop;
}

async function fetchCollection(identifiers: object[]): Promise<{ data: ScryCard[]; not_found?: { name?: string }[] }> {
  const res = await fetch(COLLECTION, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ identifiers }),
  });
  if (!res.ok) throw new Error(`Scryfall ha risposto ${res.status}.`);
  return res.json();
}

/** Carica le illustrazioni iconiche (una richiesta; se un set non va, riprova solo col nome). */
async function loadIconicArt(): Promise<Map<string, string>> {
  if (iconicArt) return iconicArt;
  const all = COLOR_GROUPS.flatMap((g) => g.items);
  const out = new Map<string, string>();
  const first = await fetchCollection(all.map((f) => ({ name: f.card, set: f.set })));
  for (const c of first.data) {
    const art = artOf(c);
    if (c.name && art) out.set(c.name.toLowerCase(), art);
  }
  const missing = all.filter((f) => !out.has(f.card.toLowerCase()));
  if (missing.length) {
    const second = await fetchCollection(missing.map((f) => ({ name: f.card })));
    for (const c of second.data) {
      const art = artOf(c);
      if (c.name && art) out.set(c.name.toLowerCase(), art);
    }
  }
  iconicArt = out;
  return out;
}

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

  const [arts, setArts] = useState<Map<string, string> | null>(iconicArt);
  useEffect(() => {
    if (arts) return;
    let alive = true;
    loadIconicArt()
      .then((m) => alive && setArts(m))
      .catch(() => alive && setArts(new Map()));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {!arts && <p className="muted small">Carico le illustrazioni…</p>}
            {arts && arts.size === 0 && (
              <p className="muted small">Illustrazioni non disponibili adesso: puoi scegliere il simbolo.</p>
            )}
            {COLOR_GROUPS.map((g) => (
              <section key={g.title}>
                <div className="avatar-color-title">{g.title}</div>
                <div className="avatar-grid avatar-grid-sym">
                  {g.items.map((f) => {
                    const sym = `sym:${f.colors}`;
                    const art = arts?.get(f.card.toLowerCase());
                    // Con l'illustrazione si salva quella; senza, il simbolo.
                    const val = art ?? sym;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`avatar-opt${current === val || current === sym ? " on" : ""}`}
                        disabled={!!saving || !arts}
                        onClick={() => void pick(val)}
                        title={art ? `${f.label}: ${f.card}` : f.label}
                      >
                        <span
                          className={`avatar-opt-img${art ? "" : " avatar-opt-sym"}`}
                          style={{ backgroundImage: `url("${art ?? symbolAvatarUrl(sym)}")` }}
                        >
                          {art && (
                            <span className="avatar-opt-badge" style={{ backgroundImage: `url("${symbolAvatarUrl(sym)}")` }} />
                          )}
                        </span>
                        <span className="avatar-opt-name">{saving === val ? "Salvo…" : f.label}</span>
                        {art && <span className="avatar-opt-card">{f.card}</span>}
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
