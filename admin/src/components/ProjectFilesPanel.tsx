import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  downloadStorageFile,
  softDeleteProjectDocument,
  uploadProjectDocument,
} from '../lib/files';

type Doc = {
  id: string;
  title: string;
  doc_type: string;
  file_name: string;
  byte_size: number;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  visibility: string;
  approval_status: string;
  version_no: number;
  version_of: string | null;
};

type Props = {
  clientId: string;
  projectId: string;
  canManage: boolean;
  staffNames: Record<string, string>;
};

export function ProjectFilesPanel({ clientId, projectId, canManage, staffNames }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Doc[]>([]);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('brief');
  const [visibility, setVisibility] = useState<'internal' | 'client_visible'>('internal');
  const [replaceOf, setReplaceOf] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error: err } = await supabase
      .from('project_documents')
      .select(
        'id, title, doc_type, file_name, byte_size, storage_path, uploaded_by, created_at, visibility, approval_status, version_no, version_of',
      )
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows((data as Doc[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  async function onUpload(file: File | null) {
    if (!file || !user || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const prior = replaceOf ? rows.find((r) => r.id === replaceOf) : null;
      await uploadProjectDocument({
        clientId,
        projectId,
        title: title || file.name,
        docType: prior?.doc_type ?? docType,
        file,
        userId: user.id,
        visibility,
        approvalStatus: visibility === 'client_visible' ? 'pending' : 'none',
        versionOf: prior?.id,
        versionNo: prior ? (prior.version_no || 1) + 1 : 1,
      });
      setTitle('');
      setReplaceOf('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel project-files-panel">
      <h2>Project Files</h2>
      <p className="muted-sm">Briefs, specs, designs and shared documents for this project.</p>
      {error ? <div className="error">{error}</div> : null}

      {canManage ? (
        <div className="row-2" style={{ marginBottom: '0.75rem' }}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
          </label>
          <label>
            Type
            <select value={docType} onChange={(e) => setDocType(e.target.value)} disabled={!!replaceOf}>
              <option value="brief">Brief</option>
              <option value="specification">Specification</option>
              <option value="design">Design</option>
              <option value="contract">Contract</option>
              <option value="deliverable">Deliverable</option>
              <option value="general">General</option>
            </select>
          </label>
          <label>
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'internal' | 'client_visible')}
            >
              <option value="internal">Internal only</option>
              <option value="client_visible">Share with client</option>
            </select>
          </label>
          <label>
            Replace version of
            <select value={replaceOf} onChange={(e) => setReplaceOf(e.target.value)}>
              <option value="">New document (not a replacement)</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} (v{r.version_no})
                </option>
              ))}
            </select>
          </label>
          <label className="file-upload">
            Upload file
            <input
              type="file"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = '';
                void onUpload(f);
              }}
            />
          </label>
        </div>
      ) : null}

      <ul className="file-list">
        {rows.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.title}</strong>
              <div className="muted-sm">
                {r.doc_type} · v{r.version_no}
                {r.version_of ? ' (replacement)' : ''} · {r.visibility} · {r.approval_status} ·{' '}
                {r.file_name} · {(r.byte_size / 1024).toFixed(1)} KB ·{' '}
                {staffNames[r.uploaded_by] ?? 'Staff'} · {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => void downloadStorageFile('project-files', r.storage_path, r.file_name)}
              >
                Download
              </button>
              {canManage ? (
                <>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setReplaceOf(r.id)}
                  >
                    Upload new version
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void softDeleteProjectDocument(r.id).then(load).catch((e) => setError(String(e)))
                    }
                  >
                    Remove
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="muted-sm">No project files yet.</li> : null}
      </ul>
    </div>
  );
}
