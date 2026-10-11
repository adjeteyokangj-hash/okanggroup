import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { MfaPage } from './pages/MfaPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { CmsPage } from './pages/CmsPage';
import { StaffPage } from './pages/StaffPage';
import { AppShell } from './components/AppShell';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading, mfaRequired, profile } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && profile.account_status !== 'active') {
    return <div className="center">Account is not active.</div>;
  }
  if (mfaRequired) return <Navigate to="/mfa" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/clients" element={<ClientsPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/cms" element={<CmsPage />} />
                <Route path="/staff" element={<StaffPage />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
    </Routes>
  );
}
