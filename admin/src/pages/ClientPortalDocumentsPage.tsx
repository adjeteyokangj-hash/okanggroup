import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { downloadStorageFile } from '../lib/files';

type Doc = {
  id: string;
  title: string;
  doc_type: string;
  file_name: string;
  storage_path: string;
  approval_status: string;
  created_at: string;
};

export function ClientPortalDocumentsPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('project_documents')
      .select('id, title, doc_type, file_name, storage_path, approval_status, created_at')
      .eq('visibility', 'client_visible')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows((data as Doc[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.rpc('client_decide_project_document', {
      p_document_id: id,
      p_approve: approve,
      p_note: null,
    });
    setBusyId(null);
    if (err) setError(err.message);
    else {
      setMessage(approve ? 'Document approved.' : 'Document returned for revision.');
      await load();
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Documents</h1>
          <p>Shared proposals, contracts and handover packs for your organisation.</p>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Approval</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.title}</strong>
                <div className="muted-sm">{r.file_name}</div>
              </td>
              <td>{r.doc_type}</td>
              <td>{r.approval_status}</td>
              <td className="actions">
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void downloadStorageFile('project-files', r.storage_path, r.file_name)}
                >
                  Download
                </button>
                {r.approval_status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className="linkish"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="linkish"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, false)}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>No shared documents yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="muted-sm">
        <Link to="/portal">Back to portal home</Link>
      </p>
    </section>
  );
}
