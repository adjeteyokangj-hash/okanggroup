import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  actionLabelForNotification,
  isDiagnosticNotification,
  labelNotificationKind,
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
  read_at: string | null;
  created_at: string;
};

export function NotificationsMenu() {
  const { user, profile } = useAuth();
  const centrePath = profile?.account_kind === 'client_user' ? '/portal/notifications' : '/notifications';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const { data, error: err } = await supabase
      .from('notifications')
      .select(
        'id, kind, title, body, task_id, project_id, invoice_id, cms_instance_id, link_path, read_at, created_at',
      )
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (err) setError(err.message);
    else setItems((data as Notification[]) ?? []);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, [user?.id]);

  const operational = useMemo(
    () => items.filter((n) => !isDiagnosticNotification(n.kind, n.title)),
    [items],
  );
  const unread = operational.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase.rpc('mark_notification_read', { p_id: id });
    await load();
  }

  async function markAll() {
    await supabase.rpc('mark_all_notifications_read');
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

  return (
    <div className="notifications-menu">
      <button
        type="button"
        className="notifications-bell"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        Notifications
        {unread > 0 ? <span className="notif-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="notifications-panel">
          <div className="notifications-head">
            <strong>Notifications</strong>
            {unread > 0 ? (
              <button type="button" className="linkish" onClick={() => void markAll()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {error ? <div className="error">{error}</div> : null}
          {operational.length === 0 ? <p className="muted-sm">No notifications yet.</p> : null}
          <ul className="notifications-list">
            {operational.slice(0, 12).map((n) => {
              const href = hrefFor(n);
              const title = n.title?.trim() || labelNotificationKind(n.kind);
              return (
                <li key={n.id} className={n.read_at ? '' : 'unread'}>
                  <div className="notifications-title">{title}</div>
                  {n.body ? <div className="muted-sm">{n.body}</div> : null}
                  <div className="muted-sm">{new Date(n.created_at).toLocaleString()}</div>
                  <div className="actions">
                    {href ? (
                      <Link
                        to={href}
                        onClick={() => {
                          void markRead(n.id);
                          setOpen(false);
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
            })}
          </ul>
          <div className="notifications-head" style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
            <Link to={centrePath} onClick={() => setOpen(false)}>
              Open notification centre
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
