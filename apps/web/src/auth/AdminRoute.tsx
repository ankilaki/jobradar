import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminGate>{children}</AdminGate>
    </ProtectedRoute>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="px-6 py-16 font-mono text-sm text-ink-muted">
        Checking admin…
      </div>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
