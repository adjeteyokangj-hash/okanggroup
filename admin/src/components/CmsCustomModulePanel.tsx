import { FormEvent, useEffect, useState } from 'react';
import { uploadClientCmsImage } from '../lib/files';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { TreasureHouseEditorBridge } from '../visual-studio/tools/TreasureHouseStudioTools';

type FieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
};

type ModuleDef = {
  id: string;
  module_code: string;
  module_name: string;
  description: string | null;
  fields_json: FieldDef[];
};

type RecordRow = {
  id: string;
  title: string;
  data_json: Record<string, unknown>;
  status: string;
  updated_at: string;
};

type Props = {
  instanceId: string;
  clientId: string;
  canEdit: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  /** When set, only this module_code is shown (Treasure House shadow sections). */
  focusModuleCode?: string | null;
  hideHeader?: boolean;
  /** Visual Studio bridge for floating Text / Image studios. */
  onBridgeChange?: (bridge: TreasureHouseEditorBridge | null) => void;
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'st-draft',
  in_review: 'st-review',
  published: 'st-published',
  rejected: 'st-rejected',
  archived: 'st-archived',
};

export function CmsCustomModulePanel({
  instanceId,
  clientId,
  canEdit,
  canSubmit,
  canPublish,
  focusModuleCode = null,
  hideHeader = false,
  onBridgeChange,
}: Props) {
  const { user } = useAuth();
  const [defs, setDefs] = useState<ModuleDef[]>([]);
  const [selectedDef, setSelectedDef] = useState('');
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [title, setTitle] = useState('');
  const [data, setData] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  async function load() {
    const { data: d } = await supabase
      .from('cms_custom_module_defs')
      .select('id, module_code, module_name, description, fields_json')
      .eq('cms_instance_id', instanceId)
      .eq('status', 'active')
      .order('sort_order');
    const list = ((d as ModuleDef[]) ?? [])
      .map((m) => ({
        ...m,
        fields_json: Array.isArray(m.fields_json) ? m.fields_json : [],
      }))
      .filter((m) => !focusModuleCode || m.module_code === focusModuleCode);
    setDefs(list);
    if (list[0]) setSelectedDef(list[0].id);
    else setSelectedDef('');
  }

  async function loadRecords(defId: string) {
    const { data: rows } = await supabase
      .from('cms_custom_records')
      .select('id, title, data_json, status, updated_at')
      .eq('cms_instance_id', instanceId)
      .eq('module_def_id', defId)
      .order('updated_at', { ascending: false });
    setRecords((rows as RecordRow[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [instanceId, focusModuleCode]);

  useEffect(() => {
    if (selectedDef) {
      void loadRecords(selectedDef);
      setEditId(null);
      setTitle('');
      setData({});
    }
  }, [selectedDef, instanceId]);

  const def = defs.find((d) => d.id === selectedDef);
  const filtered = records.filter((r) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return r.title.toLowerCase().includes(needle) || r.status.includes(needle);
  });

  function resetForm() {
    setEditId(null);
    setTitle('');
    setData({});
    setMessage(null);
  }

  async function saveDraftRecord(opts?: { keepOpen?: boolean }) {
    if (!canEdit || !user || !def || !title.trim()) return;
    setError(null);
    setMessage(null);
    for (const f of def.fields_json) {
      if (f.required && !String(data[f.key] ?? '').trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    if (editId) {
      const { error: err } = await supabase
        .from('cms_custom_records')
        .update({
          title: title.trim(),
          data_json: data,
          status: 'draft',
          updated_by: user.id,
        })
        .eq('id', editId);
      if (err) setError(err.message);
      else {
        setMessage('Record saved as draft.');
        if (!opts?.keepOpen) resetForm();
        await loadRecords(def.id);
      }
    } else {
      const { data: inserted, error: err } = await supabase
        .from('cms_custom_records')
        .insert({
          cms_instance_id: instanceId,
          client_id: clientId,
          module_def_id: def.id,
          title: title.trim(),
          data_json: data,
          status: 'draft',
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id')
        .single();
      if (err) setError(err.message);
      else {
        setMessage('Record created.');
        if (opts?.keepOpen && inserted?.id) setEditId(inserted.id as string);
        else resetForm();
        await loadRecords(def.id);
      }
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await saveDraftRecord();
  }

  async function uploadFieldImage(key: string, file: File) {
    if (!canEdit || !user) return;
    setUploadingKey(key);
    setError(null);
    try {
      const row = await uploadClientCmsImage({
        clientId,
        instanceId,
        file,
        userId: user.id,
        altText: def?.fields_json.find((f) => f.key === key)?.label,
      });
      setData((prev) => ({ ...prev, [key]: row.storage_path }));
      setMessage('Image uploaded to media library.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingKey(null);
    }
  }

  useEffect(() => {
    if (!onBridgeChange) return;
    if (!def) {
      onBridgeChange(null);
      return;
    }
    onBridgeChange({
      moduleCode: def.module_code,
      moduleName: def.module_name,
      recordId: editId,
      recordTitle: title,
      fields: def.fields_json.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
      })),
      data,
      canEdit,
      setTitle,
      setField: (key, value) => setData((prev) => ({ ...prev, [key]: value })),
      saveDraft: () => {
        void saveDraftRecord({ keepOpen: true });
      },
      uploadingKey,
      uploadFieldImage: (key, file) => void uploadFieldImage(key, file),
    });
  }, [onBridgeChange, def, editId, title, data, canEdit, uploadingKey]);

  useEffect(() => {
    return () => {
      onBridgeChange?.(null);
    };
  }, [onBridgeChange]);

  async function setStatus(id: string, status: string) {
    if (status === 'in_review' && !canSubmit) return;
    if (status === 'published' && !canPublish) return;
    const { error: err } = await supabase
      .from('cms_custom_records')
      .update({
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        published_by: status === 'published' ? user?.id : null,
        updated_by: user?.id,
      })
      .eq('id', id);
    if (err) setError(err.message);
    else {
      setMessage(`Record set to ${status}.`);
      if (def) await loadRecords(def.id);
    }
  }

  if (defs.length === 0) {
    return (
      <div className="cms-surface">
        <div className="cms-empty-state">
          <div className="cms-empty-icon">▦</div>
          <h3>No custom modules</h3>
          <p>Custom modules are configured per CMS for application-specific content — not page layout.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cms-surface cms-custom-panel">
      {!hideHeader ? (
        <header className="cms-surface-head">
          <div>
            <h2>Custom modules</h2>
            <p>Business content for this application — separate from the visual page editor.</p>
          </div>
        </header>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className={`cms-custom-layout${focusModuleCode ? ' cms-custom-layout-focus' : ''}`}>
        {!focusModuleCode ? (
          <aside className="cms-module-nav panel">
            <h3>Modules</h3>
            <ul>
              {defs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={d.id === selectedDef ? 'on' : ''}
                    onClick={() => setSelectedDef(d.id)}
                  >
                    <strong>{d.module_name}</strong>
                    <span>{d.module_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <div className="cms-custom-main">
          {def ? (
            <>
              <div className="cms-module-banner">
                <div>
                  <h3>{def.module_name}</h3>
                  {def.description ? <p>{def.description}</p> : null}
                </div>
                <span className="cms-chip">{records.length} records</span>
              </div>

              <div className="cms-custom-split">
                {canEdit ? (
                  <form className="cms-module-form panel" onSubmit={(e) => void save(e)}>
                    <div className="cms-form-head">
                      <h4>{editId ? 'Edit record' : 'New record'}</h4>
                      {editId ? (
                        <button type="button" className="secondary" onClick={resetForm}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <label>
                      Title
                      <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </label>
                    <div className="cms-field-grid">
                      {def.fields_json.map((f) => {
                        const wide = ['richtext', 'textarea', 'media', 'image', 'file', 'markdown'].includes(f.type);
                        const value = data[f.key] ?? '';
                        return (
                          <label key={f.key} className={wide ? 'span-2' : ''}>
                            {f.label}
                            {f.required ? <em> *</em> : null}
                            {f.help ? <span className="muted-sm cms-field-help">{f.help}</span> : null}

                            {f.type === 'richtext' || f.type === 'textarea' || f.type === 'markdown' ? (
                              <textarea
                                rows={f.type === 'richtext' || f.type === 'markdown' ? 7 : 4}
                                value={value}
                                placeholder={f.placeholder}
                                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                                required={f.required}
                              />
                            ) : f.type === 'boolean' || f.type === 'checkbox' ? (
                              <span className="check cms-bool-field">
                                <input
                                  type="checkbox"
                                  checked={value === 'true' || value === '1' || value === 'yes'}
                                  onChange={(e) =>
                                    setData({ ...data, [f.key]: e.target.checked ? 'true' : 'false' })
                                  }
                                />
                                {value === 'true' || value === '1' || value === 'yes' ? 'Yes' : 'No'}
                              </span>
                            ) : f.type === 'select' || f.type === 'enum' ? (
                              <select
                                value={value}
                                required={f.required}
                                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                              >
                                <option value="">Select…</option>
                                {(f.options ?? []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : f.type === 'media' || f.type === 'image' || f.type === 'file' ? (
                              <div className="cms-media-field">
                                {value ? (
                                  <code className="cms-media-path">{value}</code>
                                ) : (
                                  <span className="muted-sm">No file selected</span>
                                )}
                                <div className="actions">
                                  <label className="file-upload">
                                    {uploadingKey === f.key ? 'Uploading…' : 'Upload media'}
                                    <input
                                      type="file"
                                      accept={
                                        f.type === 'file'
                                          ? undefined
                                          : 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif'
                                      }
                                      disabled={uploadingKey === f.key || !user}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        e.target.value = '';
                                        if (!file) return;
                                        void uploadFieldImage(f.key, file);
                                      }}
                                    />
                                  </label>
                                  {value ? (
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => setData({ ...data, [f.key]: '' })}
                                    >
                                      Clear
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <input
                                type={
                                  f.type === 'date'
                                    ? 'date'
                                    : f.type === 'number'
                                      ? 'number'
                                      : f.type === 'email'
                                        ? 'email'
                                        : f.type === 'url' || f.type === 'link'
                                          ? 'url'
                                          : f.type === 'datetime'
                                            ? 'datetime-local'
                                            : 'text'
                                }
                                value={value}
                                placeholder={f.placeholder}
                                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                                required={f.required}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <button type="submit" className="cms-primary-action">
                      Save draft
                    </button>
                  </form>
                ) : (
                  <div className="panel">
                    <p className="muted-sm">You have view access only for this module.</p>
                  </div>
                )}

                <div className="cms-record-list panel">
                  <div className="cms-form-head">
                    <h4>Records</h4>
                    <input
                      className="cms-search compact"
                      placeholder="Filter…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>
                  {filtered.length === 0 ? (
                    <p className="muted-sm">No records in this module yet.</p>
                  ) : (
                    <ul className="cms-record-cards">
                      {filtered.map((r) => (
                        <li key={r.id}>
                          <div>
                            <strong>{r.title}</strong>
                            <div className="muted-sm">{new Date(r.updated_at).toLocaleString()}</div>
                          </div>
                          <span className={`cms-status ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</span>
                          <div className="actions">
                            {canEdit ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setEditId(r.id);
                                  setTitle(r.title);
                                  const next: Record<string, string> = {};
                                  for (const [k, v] of Object.entries(r.data_json ?? {})) {
                                    next[k] = String(v ?? '');
                                  }
                                  setData(next);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canSubmit && r.status === 'draft' ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => void setStatus(r.id, 'in_review')}
                              >
                                Submit
                              </button>
                            ) : null}
                            {canPublish && r.status === 'in_review' ? (
                              <button type="button" onClick={() => void setStatus(r.id, 'published')}>
                                Publish
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
