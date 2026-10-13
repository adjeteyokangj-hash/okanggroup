import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { MfaPage } from './pages/MfaPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientFormPage } from './pages/ClientFormPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectFormPage } from './pages/ProjectFormPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { CmsPage } from './pages/CmsPage';
import { CmsFormPage } from './pages/CmsFormPage';
import { CmsDetailPage } from './pages/CmsDetailPage';
import { CmsManagementDashboardPage } from './pages/CmsManagementDashboardPage';
import { MyCmsPage } from './pages/MyCmsPage';
import { ClientCmsWorkspacePage } from './pages/ClientCmsWorkspacePage';
import { ClientPortalHomePage } from './pages/ClientPortalHomePage';
import { ClientPortalProjectsPage } from './pages/ClientPortalProjectsPage';
import { ClientPortalDocumentsPage } from './pages/ClientPortalDocumentsPage';
import { ClientPortalInvoicesPage } from './pages/ClientPortalInvoicesPage';
import { EnquiriesPage } from './pages/EnquiriesPage';
import { EnquiryDetailPage } from './pages/EnquiryDetailPage';
import { FinanceQuotesPage } from './pages/FinanceQuotesPage';
import { FinanceContractsPage } from './pages/FinanceContractsPage';
import { FinanceInvoicesPage } from './pages/FinanceInvoicesPage';
import { FinanceExpensesPage } from './pages/FinanceExpensesPage';
import { FinanceReportsPage } from './pages/FinanceReportsPage';
import { StaffPage } from './pages/StaffPage';
import { StaffDetailPage } from './pages/StaffDetailPage';
import { StaffOrgSettingsPage } from './pages/StaffOrgSettingsPage';
import { ActivatePage } from './pages/ActivatePage';
import { ForceChangePasswordPage } from './pages/ForceChangePasswordPage';
import { AutomationPage } from './pages/AutomationPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AppShell } from './components/AppShell';
import { ClientPortalShell } from './components/ClientPortalShell';
import { RequirePermission } from './components/RequirePermission';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading, mfaRequired, mustChangePassword, profile } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (
    profile &&
    (profile.account_status === 'invited' || profile.account_status === 'pending_setup')
  ) {
    return <Navigate to="/activate" replace />;
  }
  if (profile && profile.account_status !== 'active') {
    return (
      <div className="center">
        Account is {profile.account_status}. Contact an OkangGroup administrator.
      </div>
    );
  }
  if (mustChangePassword) return <Navigate to="/force-change-password" replace />;
  if (mfaRequired) return <Navigate to="/mfa" replace />;
  return <>{children}</>;
}

function StaffApp() {
  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={
            <RequirePermission code="dashboard.read">
              <DashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path="/enquiries"
          element={
            <RequirePermission code={['enquiries.read', 'enquiries.manage']}>
              <EnquiriesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/enquiries/:id"
          element={
            <RequirePermission code={['enquiries.read', 'enquiries.manage']}>
              <EnquiryDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/clients"
          element={
            <RequirePermission code={['clients.read', 'clients.manage']}>
              <ClientsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/clients/new"
          element={
            <RequirePermission code="clients.manage">
              <ClientFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <RequirePermission code={['clients.read', 'clients.manage']}>
              <ClientDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/projects"
          element={
            <RequirePermission code={['projects.read', 'projects.manage']}>
              <ProjectsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/projects/new"
          element={
            <RequirePermission code="projects.manage">
              <ProjectFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <RequirePermission code={['projects.read', 'projects.manage']}>
              <ProjectDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/tasks"
          element={
            <RequirePermission code={['tasks.read', 'tasks.manage', 'tasks.execute']}>
              <TasksPage />
            </RequirePermission>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <RequirePermission code={['tasks.read', 'tasks.manage', 'tasks.execute']}>
              <TaskDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/cms"
          element={
            <RequirePermission code={['company_cms.read', 'company_cms.edit', 'company_cms.publish']}>
              <CmsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/cms/new"
          element={
            <RequirePermission code="company_cms.edit">
              <CmsFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="/cms/:id"
          element={
            <RequirePermission code={['company_cms.read', 'company_cms.edit', 'company_cms.publish']}>
              <CmsDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/cms-systems"
          element={
            <RequirePermission code="clients.manage">
              <CmsManagementDashboardPage />
            </RequirePermission>
          }
        />
        <Route path="/cms/management" element={<Navigate to="/cms-systems" replace />} />
        <Route path="/my-cms" element={<MyCmsPage />} />
        <Route path="/my-cms/:instanceId" element={<ClientCmsWorkspacePage />} />
        <Route
          path="/finance/quotes"
          element={
            <RequirePermission code={['finance.quotes.read', 'finance.quotes.manage']}>
              <FinanceQuotesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/finance/contracts"
          element={
            <RequirePermission code={['finance.contracts.read', 'finance.contracts.manage']}>
              <FinanceContractsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/finance/invoices"
          element={
            <RequirePermission
              code={['finance.invoices.read', 'finance.invoices.manage', 'finance.invoices.issue']}
            >
              <FinanceInvoicesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/finance/expenses"
          element={
            <RequirePermission code={['finance.expenses.read', 'finance.expenses.manage']}>
              <FinanceExpensesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/finance/reports"
          element={
            <RequirePermission
              code={['finance.reports.read', 'finance.invoices.read', 'finance.expenses.read']}
            >
              <FinanceReportsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/staff"
          element={
            <RequirePermission code={['org.staff.read', 'org.staff.manage', 'org.staff.invite']}>
              <StaffPage />
            </RequirePermission>
          }
        />
        <Route
          path="/staff/settings"
          element={
            <RequirePermission code={['org.staff.read', 'org.staff.manage', 'org.departments.manage']}>
              <StaffOrgSettingsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/staff/:id"
          element={
            <RequirePermission code={['org.staff.read', 'org.staff.manage', 'org.staff.invite']}>
              <StaffDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/automation"
          element={
            <RequirePermission code={['automation.read', 'automation.manage', 'automation.run']}>
              <AutomationPage />
            </RequirePermission>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/portal/*" element={<Navigate to="/my-cms" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function ClientApp() {
  return (
    <ClientPortalShell>
      <Routes>
        <Route path="/portal" element={<ClientPortalHomePage />} />
        <Route path="/portal/projects" element={<ClientPortalProjectsPage />} />
        <Route path="/portal/documents" element={<ClientPortalDocumentsPage />} />
        <Route path="/portal/invoices" element={<ClientPortalInvoicesPage />} />
        <Route path="/portal/notifications" element={<NotificationsPage />} />
        <Route path="/portal/cms/:instanceId" element={<ClientCmsWorkspacePage />} />
        <Route path="/my-cms/:instanceId" element={<ClientCmsWorkspacePage />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </ClientPortalShell>
  );
}

function AppRoot() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (profile?.account_kind === 'client_user') return <ClientApp />;
  return <StaffApp />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <AppRoot />
          </Protected>
        }
      />
    </Routes>
  );
}
