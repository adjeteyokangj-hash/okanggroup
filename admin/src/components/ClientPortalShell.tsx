import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NotificationsMenu } from './NotificationsMenu';

export function ClientPortalShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">OkangGroup</div>
        <p className="brand-sub">Client Portal</p>
        <nav>
          <NavLink to="/portal" end>
            Dashboard
          </NavLink>
          <NavLink to="/portal/projects">Projects</NavLink>
          <NavLink to="/portal/documents">Documents</NavLink>
          <NavLink to="/portal/invoices">Invoices</NavLink>
          <NavLink to="/portal/notifications">Notifications</NavLink>
        </nav>
        <div className="sidebar-foot">
          <NotificationsMenu />
          <div className="user">{profile?.full_name ?? profile?.email}</div>
          <div className="perm-count">Client account</div>
          <button type="button" className="linkish" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
