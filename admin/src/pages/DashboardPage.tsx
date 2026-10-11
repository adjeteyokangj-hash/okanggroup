import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function DashboardPage() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState({ clients: 0, projects: 0, tasks: 0, overdue: 0 });

  useEffect(() => {
    void (async () => {
      const [c, p, t, o] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .lt('due_at', new Date().toISOString())
          .not('status', 'in', '("done","cancelled")'),
      ]);
      setCounts({
        clients: c.count ?? 0,
        projects: p.count ?? 0,
        tasks: t.count ?? 0,
        overdue: o.count ?? 0,
      });
    })();
  }, []);

  return (
    <section>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Welcome, {profile?.full_name}. Scoped operational view for Release 1.</p>
      </header>
      <div className="stat-grid">
        <article>
          <h2>{counts.clients}</h2>
          <p>Clients</p>
        </article>
        <article>
          <h2>{counts.projects}</h2>
          <p>Projects</p>
        </article>
        <article>
          <h2>{counts.tasks}</h2>
          <p>Open tasks</p>
        </article>
        <article>
          <h2>{counts.overdue}</h2>
          <p>Overdue</p>
        </article>
      </div>
    </section>
  );
}
