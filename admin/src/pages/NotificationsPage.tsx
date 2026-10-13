import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  actionLabelForNotification,
  isDiagnosticNotification,
  labelNotificationCategory,
  labelNotificationKind,
  notificationCategory,
  type NotificationCategory,
} from '../lib/notificationsUi';

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  task_id: string | null;
  project_id: string | null;
  invoice_id: string | null;
  cms_instance_id: string | null;
  link_path: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
};

type NotificationStack = { key: string; title: string; items: Notification[] };

const CATEGORY_ORDER: NotificationCategory[] = [
  'tasks',
  'projects',
  'finance',
  'clients',
  'cms',
  'system',
];

export function NotificationsPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<'all' | NotificationCategory>('all');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    if (!user) return;
    let q = supabase
      .from('notifications')
      .select(
        'id, kind, title, body, task_id, project_id, invoice_id, cms_instance_id, link_path, severity, read_at, created_at',
      )
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(150);
    if (filter === 'unread') q = q.is('read_at', null);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setItems((data as Notification[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [user?.id, filter]);

  const operational = useMemo(
    () =>
      items.filter((n) => showDiagnostics || !isDiagnosticNotification(n.kind, n.title)),
    [items, showDiagnostics],
  );

  const filtered = useMemo(
    () =>
      category === 'all'
        ? operational
        : operational.filter((n) => notificationCategory(n.kind) === category),
    [operational, category],
  );

  const grouped = useMemo(() => {
    const map = new Map<NotificationCategory, Map<string, NotificationStack>>();
    for (const cat of CATEGORY_ORDER) map.set(cat, new Map());
    for (const n of filtered) {
      const cat = notificationCategory(n.kind);
      const title = n.title?.trim() || labelNotificationKind(n.kind);
      const key = `${n.kind}::${title.toLowerCase()}`;
      const bucket = map.get(cat)!;
      const stack = bucket.get(key);
      if (stack) stack.items.push(n);
      else bucket.set(key, { key, title, items: [n] });
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, groups: Array.from(map.get(cat)!.values()) })).filter(
      (g) => g.groups.length,
    );
  }, [filtered]);

  const unread = operational.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase.rpc('mark_notification_read', { p_id: id });
    await load();
  }

  async function markAll() {
    await supabase.rpc('mark_all_notifications_read');
    setSelected(new Set());
    await load();
  }

  async function markSelected() {
    for (const id of selected) {
      await supabase.rpc('mark_notification_read', { p_id: id });
    }
    setSelected(new Set());
    await load();
  }

  function hrefFor(n: Notification) {
    if (n.link_path) return n.link_path;
    if (n.task_id) return `/tasks/${n.task_id}`;
    if (n.project_id) return `/projects/${n.project_id}`;
    if (n.invoice_id) {
      return profile?.account_kind === 'client_user' ? '/portal/invoices' : '/finance/invoices';
    }
    if (n.cms_instance_id) {
      return profile?.account_kind === 'client_user'
        ? `/portal/cms/${n.cms_instance_id}`
        : `/my-cms/${n.cms_instance_id}`;
    }
    return null;
  }

  async function markGroupRead(list: Notification[]) {
    for (const n of list) {
      if (!n.read_at) await supabase.rpc('mark_notification_read', { p_id: n.id });
    }
    await load();
  }

  function renderCard(n: Notification, nested = false) {
    const href = hrefFor(n);
    const title = n.title?.trim() || labelNotificationKind(n.kind);
    return (
      <li key={n.id} className={`notif-card notif-compact ${n.read_at ? '' : 'unread'}`}>
        <div className="notif-card-head">
          <div>
            <label className="check-row check-row--inline">
              <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleSelect(n.id)} />
              <span className="notif-card-title">{nested ? new Date(n.created_at).toLocaleString() : title}</span>
            </label>
            {n.body ? <div className="muted-sm notif-body">{n.body}</div> : null}
            {!nested ? <div className="muted-sm">{new Date(n.created_at).toLocaleString()}</div> : null}
          </div>
          <span className="status-chip muted">{labelNotificationKind(n.kind)}</span>
        </div>
        <div className="actions" style={{ marginTop: '0.35rem' }}>
          {href ? (
            <Link
              to={href}
              onClick={() => {
                void markRead(n.id);
              }}
            >
              {actionLabelForNotification(n.kind, href)}
            </Link>
          ) : null}
          {!n.read_at ? (
            <button type="button" className="linkish" onClick={() => void markRead(n.id)}>
              Mark as read
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>
            Business alerts for work, finance and approvals.
            {unread ? ` ${unread} unread.` : ' Inbox is clear.'}
          </p>
        </div>
        <div className="page-head-actions">
          {selected.size > 0 ? (
            <button type="button" className="secondary" onClick={() => void markSelected()}>
              Mark selected read ({selected.size})
            </button>
          ) : null}
          {unread > 0 ? (
            <button type="button" className="secondary" onClick={() => void markAll()}>
              Mark all read
            </button>
          ) : null}
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}>
          <option value="all">All</option>
          <option value="unread">Unread</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as 'all' | NotificationCategory)}
        >
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {labelNotificationCategory(c)}
            </option>
          ))}
        </select>
        <label className="check-row check-row--inline">
          <input
            type="checkbox"
            checked={showDiagnostics}
            onChange={(e) => setShowDiagnostics(e.target.checked)}
          />
          Show system diagnostics
        </label>
      </div>

      {grouped.map((g) => (
        <div key={g.cat} className="notif-group">
          <h2>{labelNotificationCategory(g.cat)}</h2>
          <ul className="notif-card-list notif-compact-list">
            {g.groups.map((grp) => {
              if (grp.items.length === 1) return renderCard(grp.items[0]);
              const unreadCount = grp.items.filter((n) => !n.read_at).length;
              const latest = grp.items[0];
              return (
                <li key={grp.key} className={`notif-card notif-compact notif-stack ${unreadCount ? 'unread' : ''}`}>
                  <details>
                    <summary className="notif-stack-summary">
                      <span className="notif-card-title">{grp.title}</span>
                      <span className="status-chip muted">{grp.items.length}×</span>
                      {unreadCount ? <span className="status-chip ok">{unreadCount} unread</span> : null}
                      <span className="muted-sm notif-stack-date">
                        Latest {new Date(latest.created_at).toLocaleString()}
                      </span>
                    </summary>
                    {unreadCount > 0 ? (
                      <div className="actions" style={{ margin: '0.4rem 0' }}>
                        <button type="button" className="linkish" onClick={() => void markGroupRead(grp.items)}>
                          Mark all {unreadCount} as read
                        </button>
                      </div>
                    ) : null}
                    <ul className="notif-card-list notif-nested">{grp.items.map((n) => renderCard(n, true))}</ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {filtered.length === 0 ? (
        <p className="muted-sm">No notifications match this filter.</p>
      ) : null}
      {!showDiagnostics ? (
        <p className="muted-sm">
          Technical diagnostics are hidden. Open Automation → Advanced, or enable “Show system
          diagnostics”.
        </p>
      ) : null}
    </section>
  );
}
