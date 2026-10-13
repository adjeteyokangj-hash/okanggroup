import { DragEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { signedCmsMediaUrl, uploadClientCmsImage } from '../lib/files';
import { supabase } from '../lib/supabase';

type MediaRow = {
  id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  alt_text: string | null;
  created_at: string;
};

type Props = {
  clientId: string;
  instanceId: string;
  canUpload: boolean;
};

type MediaFilter = 'all' | 'image' | 'document' | 'audio' | 'video';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindOf(mime: string): MediaFilter {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

export function CmsMediaLibrary({ clientId, instanceId, canUpload }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('client_cms_media')
      .select('id, file_name, mime_type, byte_size, storage_path, alt_text, created_at')
      .eq('cms_instance_id', instanceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else {
      const list = (data as MediaRow[]) ?? [];
      setRows(list);
      const next: Record<string, string> = {};
      await Promise.all(
        list.slice(0, 60).map(async (r) => {
          try {
            next[r.storage_path] = await signedCmsMediaUrl(r.storage_path);
          } catch {
            /* ignore */
          }
        }),
      );
      setUrls(next);
    }
  }

  useEffect(() => {
    void load();
  }, [instanceId]);

  async function onFiles(files: FileList | File[] | null) {
    if (!files || !user || !canUpload) return;
    const list = Array.from(files as FileList);
    if (!list.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of list) {
        await uploadClientCmsImage({ clientId, instanceId, file, userId: user.id });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt(id: string, alt: string) {
    await supabase.from('client_cms_media').update({ alt_text: alt }).eq('id', id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, alt_text: alt } : r)));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void onFiles(e.dataTransfer.files);
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && kindOf(r.mime_type) !== filter) return false;
      if (!needle) return true;
      return r.file_name.toLowerCase().includes(needle) || (r.alt_text ?? '').toLowerCase().includes(needle);
    });
  }, [rows, q, filter]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const counts = {
    all: rows.length,
    image: rows.filter((r) => kindOf(r.mime_type) === 'image').length,
    document: rows.filter((r) => kindOf(r.mime_type) === 'document').length,
    audio: rows.filter((r) => kindOf(r.mime_type) === 'audio').length,
    video: rows.filter((r) => kindOf(r.mime_type) === 'video').length,
  };

  return (
    <div className="cms-surface cms-media-library">
      <header className="cms-surface-head">
        <div>
          <h2>Media library</h2>
          <p>Isolated to this CMS. Staff cannot see other clients&apos; files.</p>
        </div>
        <div className="cms-surface-stats">
          <span>{rows.length} files</span>
          <span>{formatBytes(rows.reduce((a, r) => a + r.byte_size, 0))}</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {canUpload ? (
        <div
          className={`cms-dropzone ${dragOver ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <strong>{busy ? 'Uploading…' : 'Drop files here'}</strong>
          <span>Images, PDF, Word, audio and supported video · max 25 MB each</span>
          <label className="cms-upload-btn">
            Browse files
            <input
              type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
              multiple
              disabled={busy}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      ) : null}

      <div className="cms-media-toolbar">
        <input
          className="cms-search"
          placeholder="Search by file name or alt text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cms-seg">
          {(['all', 'image', 'document', 'audio', 'video'] as MediaFilter[]).map((f) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
              <em>{counts[f]}</em>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="cms-empty-state">
          <div className="cms-empty-icon">▣</div>
          <h3>{rows.length === 0 ? 'No media yet' : 'No matching files'}</h3>
          <p>
            {rows.length === 0
              ? 'Upload brand images, documents or media assets to use across pages and modules.'
              : 'Try another search or filter.'}
          </p>
        </div>
      ) : (
        <div className="cms-media-layout">
          <div className="cms-media-grid">
            {filtered.map((r) => {
              const kind = kindOf(r.mime_type);
              const preview = kind === 'image' ? urls[r.storage_path] : null;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`cms-media-card ${selectedId === r.id ? 'on' : ''}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className={`cms-media-thumb kind-${kind}`}>
                    {preview ? (
                      <img src={preview} alt={r.alt_text || r.file_name} />
                    ) : (
                      <span>{kind === 'document' ? 'DOC' : kind === 'audio' ? 'AUD' : kind === 'video' ? 'VID' : 'FILE'}</span>
                    )}
                  </div>
                  <div className="cms-media-meta">
                    <strong title={r.file_name}>{r.file_name}</strong>
                    <span>
                      {formatBytes(r.byte_size)} · {kind}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <aside className="cms-media-inspector panel">
            {selected ? (
              <>
                <h3>Details</h3>
                <div className={`cms-media-thumb large kind-${kindOf(selected.mime_type)}`}>
                  {kindOf(selected.mime_type) === 'image' && urls[selected.storage_path] ? (
                    <img src={urls[selected.storage_path]} alt={selected.alt_text || selected.file_name} />
                  ) : (
                    <span>{selected.mime_type || 'file'}</span>
                  )}
                </div>
                <p className="cms-media-name">{selected.file_name}</p>
                <dl className="cms-meta-list">
                  <div>
                    <dt>Type</dt>
                    <dd>{selected.mime_type || '—'}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(selected.byte_size)}</dd>
                  </div>
                  <div>
                    <dt>Added</dt>
                    <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                  </div>
                </dl>
                <label>
                  Alt text
                  <input
                    defaultValue={selected.alt_text ?? ''}
                    key={selected.id}
                    disabled={!canUpload}
                    placeholder="Describe the image for accessibility"
                    onBlur={(e) => void saveAlt(selected.id, e.target.value)}
                  />
                </label>
                {urls[selected.storage_path] ? (
                  <a
                    className="button-link secondary"
                    href={urls[selected.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open signed URL
                  </a>
                ) : null}
              </>
            ) : (
              <p className="muted-sm">Select a file to inspect metadata and alt text.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
