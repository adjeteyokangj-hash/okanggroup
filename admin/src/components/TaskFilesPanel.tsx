import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  downloadStorageFile,
  softDeleteTaskAttachment,
  uploadTaskAttachment,
} from '../lib/files';

export type TaskAttachment = {
  id: string;
  role: 'instruction' | 'work_upload';
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};

type Props = {
  taskId: string;
  clientId: string | null;
  canManage: boolean;
  canUploadWork: boolean;
  staffNames: Record<string, string>;
  onNotifyPosted?: () => void;
};

export function TaskFilesPanel({
  taskId,
  clientId,
  canManage,
  canUploadWork,
  staffNames,
  onNotifyPosted,
}: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<TaskAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recentInstructionIds, setRecentInstructionIds] = useState<string[]>([]);
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);

  async function load() {
    const { data, error: err } = await supabase
      .from('task_attachments')
      .select('id, role, file_name, mime_type, byte_size, storage_path, uploaded_by, created_at')
      .eq('task_id', taskId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows((data as TaskAttachment[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [taskId]);

  async function onUpload(role: 'instruction' | 'work_upload', file: File | null) {
    if (!file || !user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const createdId = await uploadTaskAttachment({
        taskId,
        clientId,
        role,
        file,
        userId: user.id,
      });
      await load();
      if (role === 'instruction' && createdId) {
        setRecentInstructionIds((prev) => [...prev, createdId]);
        setNotifyOpen(true);
        setNotifyBody(
          (prev) =>
            prev ||
            'I’ve uploaded instruction files for this task. Please review them and continue when ready.',
        );
        setMessage('File saved. You can notify assigned staff without uploading again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function notifyStaff(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !notifyBody.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const ids =
      recentInstructionIds.length > 0
        ? recentInstructionIds
        : rows.filter((r) => r.role === 'instruction').map((r) => r.id);
    const { error: err } = await supabase.rpc('post_task_message', {
      p_task_id: taskId,
      p_body: notifyBody.trim(),
      p_attachment_ids: ids,
      p_kind: 'task_files',
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotifyBody('');
    setRecentInstructionIds([]);
    setNotifyOpen(false);
    setMessage('Staff notified about the files.');
    onNotifyPosted?.();
  }

  async function onDownload(row: TaskAttachment) {
    setError(null);
    try {
      await downloadStorageFile('task-files', row.storage_path, row.file_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRemove(row: TaskAttachment) {
    if (!canManage && !(row.role === 'work_upload' && row.uploaded_by === user?.id)) return;
    if (row.role === 'instruction' && !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await softDeleteTaskAttachment(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const instructions = rows.filter((r) => r.role === 'instruction');
  const work = rows.filter((r) => r.role === 'work_upload');

  function list(title: string, items: TaskAttachment[], allowRemove: (r: TaskAttachment) => boolean) {
    return (
      <div className="file-block">
        <h3>{title}</h3>
        {items.length === 0 ? <p className="muted-sm">No files yet.</p> : null}
        <ul className="file-list">
          {items.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.file_name}</strong>
                <div className="muted-sm">
                  {(r.byte_size / 1024).toFixed(1)} KB · {staffNames[r.uploaded_by] ?? 'Staff'} ·{' '}
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => void onDownload(r)}>
                  Download
                </button>
                {allowRemove(r) ? (
                  <button type="button" className="secondary" onClick={() => void onRemove(r)} disabled={busy}>
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="form-grid task-files-panel" style={{ marginTop: '1.5rem' }}>
      <h2>Task Files &amp; Attachments</h2>
      <p className="muted-sm">
        Instruction files are supplied by management. Staff upload completed work here. Originals stay
        protected.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {list('Instruction & reference files', instructions, () => canManage)}
      {canManage ? (
        <label className="file-upload">
          Upload instruction file
          <input
            type="file"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              void onUpload('instruction', f);
            }}
          />
        </label>
      ) : null}
      {canManage && instructions.length > 0 ? (
        <div className="notify-files">
          {!notifyOpen ? (
            <button type="button" className="secondary" onClick={() => setNotifyOpen(true)}>
              Notify assigned staff about these files
            </button>
          ) : (
            <form onSubmit={(e) => void notifyStaff(e)}>
              <label>
                Message to assigned staff
                <textarea
                  value={notifyBody}
                  onChange={(e) => setNotifyBody(e.target.value)}
                  rows={3}
                  required
                  placeholder="Explain what you uploaded and what they should do next"
                />
              </label>
              <div className="actions">
                <button type="submit" disabled={busy}>
                  Send message &amp; notify staff
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setNotifyOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {list('Work uploads', work, (row) => canManage || (canUploadWork && row.uploaded_by === user?.id))}
      {canUploadWork || canManage ? (
        <label className="file-upload">
          Upload completed work
          <input
            type="file"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              void onUpload('work_upload', f);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
