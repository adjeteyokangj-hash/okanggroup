import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">OkangGroup</div>
        <p className="brand-sub">Operations</p>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/cms">Company CMS</NavLink>
          <NavLink to="/staff">Staff</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="user">{profile?.full_name ?? profile?.email}</div>
          <button type="button" className="linkish" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
