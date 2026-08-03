// Shell dell'app: barra superiore + contenuto + navigazione inferiore a schede.

import { NavLink, Outlet } from "react-router-dom";

interface Tab {
  to: string;
  label: string;
  icon: JSX.Element;
}

const TABS: Tab[] = [
  { to: "/cerca", label: "Cerca", icon: <IconSearch /> },
  { to: "/collezione", label: "Collezione", icon: <IconCollection /> },
  { to: "/mazzi", label: "Mazzi", icon: <IconDecks /> },
  { to: "/simula", label: "Simula", icon: <IconSim /> },
  { to: "/gioca", label: "Gioca", icon: <IconPlay /> },
];

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">✦</span> Prog Magic
        </span>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottomnav">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `navitem ${isActive ? "active" : ""}`}
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
