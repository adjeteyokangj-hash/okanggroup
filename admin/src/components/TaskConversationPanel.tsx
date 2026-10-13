import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Message = {
  id: string;
  body: string;
  author_id: string;
  author_display_name: string | null;
  attachment_ids: string[];
  created_at: string;
};

type AttachmentRef = {
  id: string;
  file_name: string;
  role: string;
};

type Props = {
  taskId: string;
  canPost: boolean;
  staffNames: Record<string, string>;
  /** Optional: pre-select instruction attachment ids (e.g. after upload notify) */
  initialAttachmentIds?: string[];
  initialBody?: string;
  initialKind?: 'task_message' | 'task_files';
  onPosted?: () => void;
};

export function TaskConversationPanel({
  taskId,
  canPost,
  staffNames,
  initialAttachmentIds,
  initialBody,
  initialKind,
  onPosted,
}: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [selected, setSelected] = useState<string[]>(initialAttachmentIds ?? []);
  const [body, setBody] = useState(initialBody ?? '');
  const [kind, setKind] = useState<'task_message' | 'task_files'>(initialKind ?? 'task_message');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});

  async function load() {
    const [{ data: msgs, error: mErr }, { data: files }] = await Promise.all([
      supabase
        .from('task_messages')
        .select('id, body, author_id, author_display_name, attachment_ids, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true }),
      supabase
        .from('task_attachments')
        .select('id, file_name, role')
        .eq('task_id', taskId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);
    if (mErr) {
      setError(mErr.message);
      return;
    }
    const list = (msgs as Message[]) ?? [];
    setMessages(list);
    setAttachments((files as AttachmentRef[]) ?? []);

    const missing = [
      ...new Set(
        list
          .map((m) => m.author_id)
          .filter((id) => id && !staffNames[id] && !extraNames[id]),
      ),
    ];
    if (missing.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', missing);
      if (profiles?.length) {
        setExtraNames((prev) => {
          const next = { ...prev };
          for (const p of profiles) {
            next[p.id] = p.full_name || p.email || p.id;
          }
          return next;
        });
      }
    }
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  useEffect(() => {
    if (initialAttachmentIds?.length) {
      setSelected(initialAttachmentIds);
      setKind(initialKind ?? 'task_files');
    }
    if (initialBody) setBody(initialBody);
  }, [initialAttachmentIds, initialBody, initialKind]);

  function nameOf(m: Message) {
    if (m.author_id === user?.id) return 'You';
    return (
      m.author_display_name ||
      staffNames[m.author_id] ||
      extraNames[m.author_id] ||
      'Someone'
    );
  }

  function fileName(id: string) {
    return attachments.find((a) => a.id === id)?.file_name ?? id.slice(0, 8);
  }

  function toggleAttach(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!canPost || !body.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('post_task_message', {
      p_task_id: taskId,
      p_body: body.trim(),
      p_attachment_ids: selected,
      p_kind: selected.length > 0 && kind === 'task_files' ? 'task_files' : 'task_message',
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setBody('');
    setSelected([]);
    setKind('task_message');
    await load();
    onPosted?.();
  }

  return (
    <div className="form-grid task-conversation" style={{ marginTop: '1.5rem' }}>
      <h2>Task Conversation</h2>
      <p className="muted-sm">
        Messages stay on this task. Sending notifies the assigned staff (or the task creator when
        staff reply). Status does not change automatically.
      </p>
      {error ? <div className="error">{error}</div> : null}

      <ul className="conversation-list">
        {messages.length === 0 ? (
          <li className="muted-sm">No messages yet.</li>
        ) : (
          messages.map((m) => (
            <li key={m.id} className={m.author_id === user?.id ? 'mine' : ''}>
              <div className="conversation-meta">
                <strong>{nameOf(m)}</strong>
                <span className="muted-sm"> · {new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div className="conversation-body">{m.body}</div>
              {m.attachment_ids?.length ? (
                <ul className="conversation-attachments">
                  {m.attachment_ids.map((aid) => (
                    <li key={aid}>📎 {fileName(aid)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {canPost ? (
        <form className="conversation-compose" onSubmit={(e) => void send(e)}>
          <label>
            Write a message…
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. I’ve uploaded the documents you requested — please review and continue."
              required
              rows={3}
            />
          </label>
          {attachments.length > 0 ? (
            <fieldset className="attach-picker">
              <legend>Link existing files (optional)</legend>
              {attachments.map((a) => (
                <label key={a.id} className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={() => toggleAttach(a.id)}
                  />
                  {a.file_name}
                  <span className="muted-sm">
                    {' '}
                    ({a.role === 'instruction' ? 'instruction' : 'work'})
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <button type="submit" disabled={busy || !body.trim()}>
            Send Message
          </button>
        </form>
      ) : (
        <p className="muted-sm">You can read this conversation but cannot post.</p>
      )}
    </div>
  );
}
