import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  is_internal: boolean;
};

export function TasksPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [internal, setInternal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('tasks')
      .select('id, title, status, priority, due_at, is_internal')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows((data as Task[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { data: user } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('tasks').insert({
      title: title.trim(),
      is_internal: internal,
      status: 'backlog',
      priority: 'normal',
      created_by: user.user?.id,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setTitle('');
    await load();
  }

  return (
    <section>
      <header className="page-head">
        <h1>Tasks</h1>
        <p>Work allocation. Client CMS instance links deferred (P2).</p>
      </header>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="check">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal
        </label>
        <button type="submit">Add task</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.priority}</td>
              <td>{r.status}</td>
              <td>{r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
