import { NavLink } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { useAuth } from '../auth/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-mono text-xs uppercase tracking-wide ${
    isActive
      ? 'text-ink border-b border-signal'
      : 'text-ink-muted hover:text-ink'
  }`;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAdmin, signOut, user } = useAuth();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-rule-faint">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark size="nav" />
          <nav className="flex flex-wrap items-center gap-4 sm:gap-5">
            <NavLink to="/" end className={linkClass}>
              Feed
            </NavLink>
            <NavLink to="/applied" className={linkClass}>
              Applied
            </NavLink>
            <NavLink to="/notifications" className={linkClass}>
              Alerts
            </NavLink>
            {isAdmin ? (
              <NavLink to="/admin/companies" className={linkClass}>
                Admin
              </NavLink>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="font-mono text-xs text-ink-muted hover:text-ink"
              title={user?.email ?? undefined}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
