// Shell dell'app: barra superiore + contenuto + navigazione inferiore a schede.

import { useAuth } from "../auth";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { applyTheme, getTheme, isDark, ThemeChoice } from "../theme";

interface Tab {
  to: string;
  label: string;
  icon: JSX.Element;
  className?: string;
}

const TABS: Tab[] = [
  { to: "/cerca", label: "Cerca", icon: <IconSearch /> },
  { to: "/collezione", label: "Collezione", icon: <IconCollection /> },
  { to: "/scansiona", label: "Scansiona", icon: <IconCamera />, className: "nav-scan" },
  { to: "/mazzi", label: "Mazzi", icon: <IconDecks /> },
  { to: "/simula", label: "Simula", icon: <IconSim /> },
  { to: "/gioca", label: "Gioca", icon: <IconPlay /> },
];

export function Layout() {
  const [theme, setTheme] = useState<ThemeChoice>(getTheme);
  const dark = isDark(theme);
  function toggleTheme() {
    const next: ThemeChoice = dark ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}logo-96.png`} alt="" /> Menga Magic
        </span>
        <div className="topbar-actions">
          <Link to="/scansiona" className="icon-btn" aria-label="Scansiona carte" title="Scansiona carte">
            <IconCamera />
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
            title={dark ? "Tema chiaro" : "Tema scuro"}
          >
            {dark ? "☀" : "☾"}
          </button>
          <AccountButton />
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottomnav">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `navitem ${t.className ?? ""} ${isActive ? "active" : ""}`
            }
            aria-label={t.label}
          >
            {t.icon}
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function IconCollection() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}
function IconDecks() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="4" y="3" width="12" height="16" rx="2" />
      <path d="M8 21h11a1 1 0 0 0 1-1V7" />
    </svg>
  );
}
function IconSim() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3" />
      <path d="M8 3h8" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function AccountButton() {
  const auth = useAuth();
  if (auth.status === "disabled") return null;
  const label =
    auth.status === "in"
      ? `Profilo: ${auth.user?.email ?? ""}${auth.syncError ? " (sincronizzazione non riuscita)" : ""}`
      : "Accedi";
  const initial = (auth.user?.email?.[0] ?? "").toUpperCase();
  return (
    <Link to="/account" className="icon-btn account-btn" aria-label={label} title={label}>
      {auth.status === "in" ? (
        <span className={`account-initial${auth.syncError ? " warn" : ""}`}>{initial || "✓"}</span>
      ) : (
        <IconUser />
      )}
    </Link>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
