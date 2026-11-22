// Pannello "Statistiche di utilizzo" in Account, visibile solo ai moderatori.

import { locale } from "../i18n";
import { useEffect, useState } from "react";
import { isAdmin } from "../moderation";
import { loadRegisteredUsers, RegisteredUser, useUsageStats } from "../usage";

const PERIODS = [
  { days: 1, label: "Oggi" },
  { days: 7, label: "7 giorni" },
  { days: 30, label: "30 giorni" },
  { days: 90, label: "90 giorni" },
];

const SECTION_NAMES: Record<string, string> = {
  cerca: "Cerca",
  collezione: "Collezione",
  mazzi: "Mazzi",
  simula: "Simula",
  gioca: "Gioca",
  scansiona: "Scansiona",
  amici: "Amici",
  gruppi: "Gruppi",
  account: "Account",
};

const PLATFORM_NAMES: Record<string, string> = {
  android: "Android",
  ios: "iPhone/iPad",
  computer: "Computer",
  altro: "Altro",
};

/** 3725 → "1 h 2 min", 95 → "2 min", 20 → "20 s". */
export function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return "0 min";
  if (secs < 60) return `${Math.round(secs)} s`;
  const min = Math.round(secs / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function fmtDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60_000;
  if (diff < 3) return "adesso";
  if (diff < 60) return `${Math.round(diff)} min fa`;
  return d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Tutti i giorni del periodo, anche quelli senza uso (ora italiana). */
function allDays(days: number): string[] {
  const out: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });
  for (let i = days - 1; i >= 0; i--) out.push(fmt.format(new Date(Date.now() - i * 86_400_000)));
  return out;
}

export default function UsageAdmin({ uid }: { uid: string }) {
  const [admin, setAdmin] = useState(false);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<"iscritti" | "giorni" | "sezioni" | "persone">("iscritti");
  const [picked, setPicked] = useState<string | null>(null);
  // Chiuso finché non si preme il pulsante: niente dati scaricati né mostrati.
  const [open, setOpen] = useState(false);
  const { stats, error, reload } = useUsageStats(days, admin && open);

  useEffect(() => {
    let alive = true;
    void isAdmin(uid).then((ok) => alive && setAdmin(ok));
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!admin) return null;

  const s = stats?.summary;
  const avg = s && s.sessions ? s.seconds / s.sessions : 0;
  const perDevice = s && s.devices ? s.seconds / s.devices : 0;

  if (!open) {
    return (
      <section className="panel account-panel usage-admin">
        <h2>Statistiche di utilizzo</h2>
        <p className="muted small">Le vedi solo tu perché sei moderatore.</p>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          📊 Apri le statistiche
        </button>
      </section>
    );
  }

  return (
    <section className="panel account-panel usage-admin">
      <div className="usage-head">
        <h2>Statistiche di utilizzo</h2>
        <button type="button" className="ghost small" onClick={() => setOpen(false)}>
          Chiudi
        </button>
      </div>
      <p className="muted small">
        Lo vedi solo tu perché sei moderatore. Conta il tempo con l'app aperta in primo piano.
      </p>
      <div className="view-toggle account-tabs" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="account-error">{error}</p>}
      {!stats && !error && <p className="muted small">Caricamento…</p>}
      {stats && s && (
        <>
          <div className="stat-cards usage-cards">
            <Stat value={s.devices} label="Persone (dispositivi)" />
            <Stat value={s.accounts} label="Con account" />
            <Stat value={s.new_devices} label="Nuove" />
            <Stat value={s.active_now} label="Online adesso" />
            <Stat value={s.sessions} label="Aperture dell'app" />
            <Stat value={fmtDuration(s.seconds)} label="Tempo totale" />
            <Stat value={fmtDuration(avg)} label="Durata media apertura" />
            <Stat value={fmtDuration(perDevice)} label="Tempo medio a persona" />
          </div>

          <div className="view-toggle account-tabs" role="tablist">
            <button type="button" aria-pressed={tab === "iscritti"} onClick={() => setTab("iscritti")}>
              Iscritti
            </button>
            <button type="button" aria-pressed={tab === "persone"} onClick={() => setTab("persone")}>
              Chi
            </button>
            <button type="button" aria-pressed={tab === "giorni"} onClick={() => setTab("giorni")}>
              Giorno per giorno
            </button>
            <button type="button" aria-pressed={tab === "sezioni"} onClick={() => setTab("sezioni")}>
              Sezioni più usate
            </button>
          </div>

          {tab === "persone" && (
            <>
              {stats.users.length === 0 && stats.guests.devices === 0 && (
                <p className="muted small">Ancora nessun dato in questo periodo.</p>
              )}
              <ul className="usage-users">
                {stats.users.map((u, i) => (
                  <li key={(u.username ?? "") + i}>
                    <div>
                      <b>{u.display_name || (u.username ? `@${u.username}` : "Account senza profilo")}</b>
                      {u.display_name && u.username && <span className="muted small"> @{u.username}</span>}
                      <div className="muted small">
                        {u.sessions} {u.sessions === 1 ? "apertura" : "aperture"}
                        {u.devices > 1 && ` · ${u.devices} dispositivi`} · ultimo uso {fmtWhen(u.last_seen)}
                        {topText(u.top_sections)}
                      </div>
                    </div>
                    <span className="usage-time">{fmtDuration(u.seconds)}</span>
                  </li>
                ))}
                {stats.guests.devices > 0 && (
                  <li className="usage-guests">
                    <div>
                      <b>Senza account</b>
                      <div className="muted small">
                        {stats.guests.devices} {stats.guests.devices === 1 ? "dispositivo" : "dispositivi"} ·{" "}
                        {stats.guests.sessions} {stats.guests.sessions === 1 ? "apertura" : "aperture"}
                      </div>
                    </div>
                    <span className="usage-time">{fmtDuration(stats.guests.seconds)}</span>
                  </li>
                )}
              </ul>
              {Object.keys(stats.platforms).length > 0 && (
                <p className="muted small">
                  Dispositivi:{" "}
                  {Object.entries(stats.platforms)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => `${PLATFORM_NAMES[k] ?? k} ${n}`)
                    .join(" · ")}
                  {s.installed_devices > 0 && ` · app installata su ${s.installed_devices}`}
                </p>
              )}
            </>
          )}

          {tab === "iscritti" && <RegisteredList />}

          {tab === "giorni" && (
            <DaysChart
              days={days}
              data={stats.days}
              picked={picked}
              onPick={(d) => setPicked(picked === d ? null : d)}
            />
          )}

          {tab === "sezioni" && <SectionBars sections={stats.sections} />}

          <button type="button" className="ghost small" onClick={reload}>
            Aggiorna
          </button>
        </>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat-card">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function DaysChart({
  days,
  data,
  picked,
  onPick,
}: {
  days: number;
  data: { day: string; devices: number; sessions: number; seconds: number }[];
  picked: string | null;
  onPick: (day: string) => void;
}) {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const list = allDays(days).map((day) => byDay.get(day) ?? { day, devices: 0, sessions: 0, seconds: 0 });
  const max = Math.max(1, ...list.map((d) => d.seconds));
  const sel = list.find((d) => d.day === picked) ?? list[list.length - 1];
  const labelEvery = Math.ceil(list.length / 7);
  return (
    <div className="usage-days">
      <h3 className="small">Minuti di uso al giorno</h3>
      <p className="usage-picked">
        <b>{fmtDay(sel.day)}</b>: {sel.devices} {sel.devices === 1 ? "persona" : "persone"} · {sel.sessions}{" "}
        {sel.sessions === 1 ? "apertura" : "aperture"} · {fmtDuration(sel.seconds)}
      </p>
      <div className="usage-bars" role="list">
        {list.map((d, i) => (
          <button
            key={d.day}
            type="button"
            role="listitem"
            className={"usage-bar" + (d.day === sel.day ? " is-picked" : "")}
            title={`${fmtDay(d.day)}: ${d.devices} persone, ${fmtDuration(d.seconds)}`}
            aria-label={`${fmtDay(d.day)}: ${d.devices} persone, ${fmtDuration(d.seconds)}`}
            onClick={() => onPick(d.day)}
          >
            <span className="usage-bar-fill" style={{ height: `${(d.seconds / max) * 100}%` }} />
            <span className="usage-bar-label">
              {i % labelEvery === 0 || i === list.length - 1 ? fmtDay(d.day) : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="muted small">Tocca una colonna per vedere i numeri di quel giorno.</p>
    </div>
  );
}

function SectionBars({ sections }: { sections: Record<string, number> }) {
  const list = Object.entries(sections).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((a, [, v]) => a + v, 0);
  if (!list.length) return <p className="muted small">Ancora nessun dato in questo periodo.</p>;
  const max = list[0][1] || 1;
  return (
    <ul className="usage-sections">
      {list.map(([k, v]) => (
        <li key={k}>
          <span className="usage-sec-name">{SECTION_NAMES[k] ?? k}</span>
          <span className="usage-sec-track">
            <span className="usage-sec-fill" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="usage-sec-val">
            {fmtDuration(v)} <span className="muted">· {Math.round((v / (total || 1)) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function topText(top: string[] | null): string {
  if (!top?.length) return "";
  return ` · usa di più ${top.map((k) => SECTION_NAMES[k] ?? k).join(" e ")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "mai";
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

/** Tutti gli account registrati, anche chi non ha usato l'app dopo lo script delle statistiche. */
function RegisteredList() {
  const [list, setList] = useState<RegisteredUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadRegisteredUsers()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p className="account-error">{error}</p>;
  if (!list) return <p className="muted small">Caricamento…</p>;
  const week = Date.now() - 7 * 86_400_000;
  const activeWeek = list.filter((u) => u.last_active && new Date(u.last_active).getTime() > week).length;
  return (
    <>
      <p className="usage-picked">
        <b>{list.length}</b> {list.length === 1 ? "account registrato" : "account registrati"} · {activeWeek} attivi
        negli ultimi 7 giorni
      </p>
      <ul className="usage-users">
        {list.map((u, i) => (
          <li key={(u.email ?? "") + i}>
            <div>
              <b>{u.display_name || (u.username ? `@${u.username}` : u.email ?? "Account")}</b>
              {(u.display_name || u.username) && (
                <span className="muted small"> {u.display_name && u.username ? `@${u.username} · ` : ""}{u.email}</span>
              )}
              <div className="muted small">
                iscritto il {fmtDate(u.created_at)} · ultima attività{" "}
                {u.last_active ? fmtWhen(u.last_active) : "mai"}
                {!u.confirmed && " · email non confermata"}
                {topText(u.top_sections)}
              </div>
            </div>
            <span className="usage-time">{u.seconds ? fmtDuration(u.seconds) : "–"}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Il tempo a destra conta solo da quando sono attive le statistiche (21 novembre 2026).
      </p>
    </>
  );
}
