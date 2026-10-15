import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NotificationsMenu } from './NotificationsMenu';

type NavItem = { to: string; label: string; end?: boolean; anyOf: string[] };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [{ to: '/', label: 'Dashboard', end: true, anyOf: ['dashboard.read'] }],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      { to: '/enquiries', label: 'Enquiries', anyOf: ['enquiries.read', 'enquiries.manage'] },
      { to: '/clients', label: 'Clients', anyOf: ['clients.read', 'clients.manage'] },
      { to: '/projects', label: 'Projects', anyOf: ['projects.read', 'projects.manage'] },
      { to: '/tasks', label: 'Tasks', anyOf: ['tasks.read', 'tasks.manage', 'tasks.execute'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { to: '/finance/quotes', label: 'Quotations', anyOf: ['finance.quotes.read', 'finance.quotes.manage'] },
      {
        to: '/finance/contracts',
        label: 'Contracts',
        anyOf: ['finance.contracts.read', 'finance.contracts.manage'],
      },
      {
        to: '/finance/invoices',
        label: 'Invoices',
        anyOf: ['finance.invoices.read', 'finance.invoices.manage', 'finance.invoices.issue'],
      },
      {
        to: '/finance/expenses',
        label: 'Expenses',
        anyOf: ['finance.expenses.read', 'finance.expenses.manage'],
      },
      {
        to: '/finance/reports',
        label: 'Reports',
        anyOf: [
          'finance.reports.read',
          'finance.invoices.read',
          'finance.expenses.read',
        ],
      },
    ],
  },
  {
    id: 'cms',
    label: 'CMS Management',
    items: [
      {
        to: '/cms',
        label: 'Company CMS',
        anyOf: ['company_cms.read', 'company_cms.edit', 'company_cms.publish'],
      },
      { to: '/my-cms', label: 'My Client CMS', anyOf: ['*'] },
      { to: '/cms-systems', label: 'Managed Websites', anyOf: ['clients.manage'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        to: '/staff',
        label: 'Staff',
        anyOf: ['org.staff.read', 'org.staff.manage', 'org.staff.invite'],
      },
      {
        to: '/staff/settings',
        label: 'Roles & organisation',
        anyOf: ['org.staff.read', 'org.staff.manage', 'org.departments.manage', 'platform.roles.manage'],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        to: '/automation',
        label: 'Automation',
        anyOf: ['automation.read', 'automation.manage', 'automation.run'],
      },
      { to: '/notifications', label: 'Notifications', anyOf: ['*'] },
    ],
  },
];

const SIDEBAR_KEY = 'okang.sidebarOpen';
const GROUPS_KEY = 'okang.navGroups.v2';

const DEFAULT_EXPANDED: Record<string, boolean> = {
  dashboard: true,
  business: true,
  finance: true,
  cms: true,
  people: true,
  operations: true,
};

function loadSidebarOpen() {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

function loadExpandedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return { ...DEFAULT_EXPANDED };
    return { ...DEFAULT_EXPANDED, ...JSON.parse(raw), dashboard: true };
  } catch {
    return { ...DEFAULT_EXPANDED };
  }
}

function itemVisible(item: NavItem, can: (code: string) => boolean) {
  return item.anyOf.includes('*') ? true : item.anyOf.some((c) => can(c));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut, can, permissions, aal, mfaEnrolled } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpandedGroups);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => itemVisible(item, can)),
      })).filter((g) => g.items.length > 0),
    [can, permissions],
  );

  const mfaLabel =
    aal === 'aal2' ? 'MFA verified (AAL2)' : mfaEnrolled ? 'MFA enrolled — verify on next step' : 'MFA not verified';

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  // Auto-expand the group containing the current route.
  useEffect(() => {
    for (const g of groups) {
      if (g.items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))) {
        setExpanded((prev) => (prev[g.id] ? prev : { ...prev, [g.id]: true }));
      }
    }
  }, [location.pathname, groups]);

  function toggleGroup(id: string) {
    if (id === 'dashboard') return;
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className={`shell ${sidebarOpen ? '' : 'is-sidebar-collapsed'}`.trim()}>
      <aside className="sidebar" aria-label="Operations navigation" hidden={!sidebarOpen}>
        <div className="sidebar-top">
          <div className="sidebar-brand-block">
            <div className="brand">OkangGroup</div>
            <p className="brand-sub">Operations</p>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(false)}
            aria-expanded={true}
            title="Close sidebar"
          >
            «
          </button>
        </div>
        <nav id="app-sidebar-nav" className="sidebar-nav-groups">
          {groups.map((group) => {
            const isDash = group.id === 'dashboard';
            const open = isDash || expanded[group.id] !== false;
            if (isDash) {
              const item = group.items[0];
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-top-link">
                  {item.label}
                </NavLink>
              );
            }
            return (
              <div key={group.id} className={`nav-group ${open ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="nav-group-toggle"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.label}</span>
                  <span className="nav-group-chevron" aria-hidden>
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                {open ? (
                  <div className="nav-group-items">
                    {group.items.map((item) => (
                      <NavLink key={item.to} to={item.to} end={item.end}>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <NotificationsMenu />
          <div className="user">{profile?.full_name ?? profile?.email}</div>
          <div className="perm-count">{permissions.length} permissions</div>
          <div className={`mfa-badge ${aal === 'aal2' ? 'ok' : 'warn'}`}>{mfaLabel}</div>
          <button type="button" className="linkish" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      {!sidebarOpen ? (
        <button
          type="button"
          className="sidebar-reopen"
          onClick={() => setSidebarOpen(true)}
          title="Open sidebar"
          aria-label="Open sidebar"
          aria-expanded={false}
        >
          <span className="sidebar-reopen-mark">»</span>
          <span className="sidebar-reopen-label">Menu</span>
        </button>
      ) : null}
      <main className="main">{children}</main>
    </div>
  );
}
