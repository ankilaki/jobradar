import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-ink">
        <h1 className="font-brand text-2xl font-bold">Firebase not configured</h1>
        <p className="mt-3 text-ink-muted">
          Copy <span className="font-mono text-sm">.env.example</span> to{' '}
          <span className="font-mono text-sm">apps/web/.env</span> and add your
          Firebase web config, then restart the dev server.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-6 py-16 font-mono text-sm text-ink-muted">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
