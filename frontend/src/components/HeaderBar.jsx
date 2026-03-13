import { BarChart3, LogOut, Shield, UserRoundCheck, Vote } from "lucide-react";
import { NavLink } from "react-router-dom";

function navClass({ isActive }) {
  return `rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
  }`;
}

export default function HeaderBar({ auth, onLogout }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md" data-testid="header-bar">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3" data-testid="header-brand-group">
          <div className="ses-live-pulse rounded-md p-2 text-white" data-testid="header-brand-icon">
            <Vote className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-slate-500" data-testid="header-org-label">
              Sindicato SES
            </p>
            <h1 className="text-base font-black text-slate-900" data-testid="header-title">
              Asamblea • Votación en vivo
            </h1>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2" data-testid="header-nav-links">
          <NavLink data-testid="nav-link-resultados" to="/resultados" className={navClass}>
            <BarChart3 className="mr-1 inline h-4 w-4" /> Resultados
          </NavLink>

          {auth?.role === "delegate" && (
            <NavLink data-testid="nav-link-delegado" to="/delegado" className={navClass}>
              <UserRoundCheck className="mr-1 inline h-4 w-4" /> Mi voto
            </NavLink>
          )}

          {auth?.role === "admin" && (
            <NavLink data-testid="nav-link-admin" to="/admin" className={navClass}>
              <Shield className="mr-1 inline h-4 w-4" /> Mesa directiva
            </NavLink>
          )}

          {auth?.accessToken ? (
            <button
              data-testid="logout-button"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              onClick={onLogout}
              type="button"
            >
              <LogOut className="mr-1 inline h-4 w-4" /> Salir
            </button>
          ) : (
            <NavLink data-testid="nav-link-ingresar" to="/" className={navClass}>
              Ingresar
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
