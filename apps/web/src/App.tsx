import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AdminRoute } from './auth/AdminRoute';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminCompaniesPage } from './admin/AdminCompaniesPage';
import { AppliedJobsPage } from './appliedPage/AppliedJobsPage';
import { AppShell } from './components/AppShell';
import { JobFeedPage } from './jobs/JobFeedPage';
import { NotificationsPage } from './notifications/NotificationsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <JobFeedPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applied"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AppliedJobsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <AppShell>
                  <NotificationsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/companies"
            element={
              <AdminRoute>
                <AppShell>
                  <AdminCompaniesPage />
                </AppShell>
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
