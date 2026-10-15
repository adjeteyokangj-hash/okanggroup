import { useCallback, useEffect, useMemo, useState } from 'react';
import { uploadClientCmsImage } from '../lib/files';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { thVisualNavItems } from '../lib/treasureHouseCmsShadow';
import { mergeCapabilities } from './capabilityRegistry';
import { createTreasureHouseAdapter } from './adapters/treasureHouseAdapter';
import { VisualStudioShell } from './VisualStudioShell';
import { TreasureHousePageCanvas } from './TreasureHousePageCanvas';
import type { StudioLayerNode } from './types';
import {
  TreasureHouseImageTool,
  TreasureHouseTextTool,
  type ThFieldDef,
  type TreasureHouseEditorBridge,
} from './tools/TreasureHouseStudioTools';

type Props = {
  instanceId: string;
  clientId: string;
  canEdit: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  canUploadMedia: boolean;
  /** Return to CMS Management (administration) without leaving the instance. */
  onExitToManagement?: () => void;
};

type ModuleDef = {
  id: string;
  module_code: string;
  module_name: string;
  fields_json: ThFieldDef[];
};

type RecordRow = {
  id: string;
  title: string;
  data_json: Record<string, unknown>;
  status: string;
  module_def_id: string;
};

function fieldsFromJson(raw: unknown): ThFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const row = f as Record<string, unknown>;
      return {
        key: String(row.key ?? ''),
        label: String(row.label ?? row.key ?? ''),
        type: String(row.type ?? 'text'),
        required: Boolean(row.required),
      };
    })
    .filter((f) => f.key);
}

function dataToStrings(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) next[k] = String(v ?? '');
  return next;
}

/**
 * Visual Studio host for Treasure House shadow content only.
 * Administration (dashboard, media, history, settings) stays in CMS Management.
 */
export function TreasureHouseVisualStudio({
  instanceId,
  clientId,
  canEdit,
  canSubmit: _canSubmit,
  canPublish,
  canUploadMedia,
  onExitToManagement,
}: Props) {
  const { user } = useAuth();
  const visualNav = useMemo(() => thVisualNavItems(), []);
  const [defs, setDefs] = useState<ModuleDef[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [moduleKey, setModuleKey] = useState(visualNav[0]?.key ?? 'pages');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [data, setData] = useState<Record<string, string>>({});
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<'text' | 'image'>('text');
  const [dirty, setDirty] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSurface, setPreviewSurface] = useState(false);

  const activeNav = visualNav.find((n) => n.key === moduleKey) ?? visualNav[0];
  const def = defs.find((d) => d.module_code === activeNav?.moduleCode);

  useEffect(() => {
    void (async () => {
      const { data: rows, error: err } = await supabase
        .from('cms_custom_module_defs')
        .select('id, module_code, module_name, fields_json')
        .eq('cms_instance_id', instanceId)
        .eq('status', 'active')
        .order('sort_order');
      if (err) {
        setError(err.message);
        return;
      }
      const list = ((rows as ModuleDef[]) ?? []).map((m) => ({
        ...m,
        fields_json: fieldsFromJson(m.fields_json),
      }));
      setDefs(list);
    })();
  }, [instanceId]);

  useEffect(() => {
    if (!defs.length) return;
    const ids = defs
      .filter((d) => visualNav.some((n) => n.moduleCode === d.module_code))
      .map((d) => d.id);
    if (!ids.length) {
      setRecords([]);
      return;
    }
    void (async () => {
      const { data: rows, error: err } = await supabase
        .from('cms_custom_records')
        .select('id, title, data_json, status, module_def_id')
        .eq('cms_instance_id', instanceId)
        .in('module_def_id', ids)
        .order('updated_at', { ascending: false });
      if (err) {
        setError(err.message);
        return;
      }
      setRecords((rows as RecordRow[]) ?? []);
      setError(null);
    })();
  }, [defs, instanceId, visualNav]);

  useEffect(() => {
    if (!def) {
      setRecordId(null);
      setTitle('');
      setData({});
      setDirty(false);
      return;
    }
    const modRecords = records.filter((r) => r.module_def_id === def.id);
    const keep = modRecords.find((r) => r.id === recordId);
    const pick = keep ?? modRecords[0] ?? null;
    if (pick) {
      if (pick.id !== recordId) {
        setRecordId(pick.id);
        setTitle(pick.title);
        setData(dataToStrings(pick.data_json));
        setSelectedFieldKey(null);
        setDirty(false);
      }
    } else {
      setRecordId(null);
      setTitle('');
      setData({});
      setSelectedFieldKey(null);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when module or record list changes
  }, [def?.id, records]);

  const layers: StudioLayerNode[] = useMemo(() => {
    return visualNav.map((nav) => {
      const modDef = defs.find((d) => d.module_code === nav.moduleCode);
      const modRecords = modDef ? records.filter((r) => r.module_def_id === modDef.id) : [];
      const children: StudioLayerNode[] = modRecords.length
        ? modRecords.map((r) => {
            const fieldChildren: StudioLayerNode[] = (modDef?.fields_json ?? []).map((f) => ({
              id: `field:${r.id}:${f.key}`,
              label: f.label,
              targetType:
                ['image', 'image_url', 'media', 'photo', 'file'].includes(f.type.toLowerCase()) ||
                /image|photo|media|asset/i.test(f.key)
                  ? ('image' as const)
                  : ('text' as const),
            }));
            return {
              id: `record:${r.id}`,
              label: `${r.title} (${r.status})`,
              targetType: 'page' as const,
              children: fieldChildren.length
                ? [
                    {
                      id: `field:${r.id}:__title__`,
                      label: 'Page title',
                      targetType: 'text' as const,
                    },
                    ...fieldChildren,
                  ]
                : undefined,
            };
          })
        : [
            {
              id: `module-empty:${nav.key}`,
              label: modDef ? 'No pages yet' : 'Schema missing',
              targetType: 'section' as const,
            },
          ];
      return {
        id: `module:${nav.key}`,
        label: nav.label,
        targetType: 'section' as const,
        children,
      };
    });
  }, [visualNav, defs, records]);

  const adapter = useMemo(
    () => createTreasureHouseAdapter(layers, { media: canUploadMedia || canEdit }),
    [layers, canEdit, canUploadMedia],
  );

  const capabilities = useMemo(
    () =>
      mergeCapabilities(adapter.info.capabilities, null, {
        canEdit,
        canPublish,
      }),
    [adapter.info.capabilities, canEdit, canPublish],
  );

  const selectionTargetId = selectedFieldKey
    ? `field:${recordId}:${selectedFieldKey}`
    : recordId
      ? `record:${recordId}`
      : `module:${moduleKey}`;

  const selection = {
    adapterId: 'treasure_house_staging',
    documentKey: instanceId,
    targetType: selectedFieldKey
      ? selectedKind === 'image'
        ? ('image' as const)
        : ('text' as const)
      : recordId
        ? ('page' as const)
        : ('section' as const),
    targetId: selectionTargetId,
    label: selectedFieldKey
      ? selectedFieldKey === '__title__'
        ? 'Page title'
        : def?.fields_json.find((f) => f.key === selectedFieldKey)?.label ?? selectedFieldKey
      : title || activeNav?.label || moduleKey,
  };

  const setField = useCallback((key: string, value: string) => {
    if (key === '__title__') setTitle(value);
    else setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const saveDraft = useCallback(async () => {
    if (!canEdit || !user || !def || !title.trim()) return;
    setError(null);
    setMessage(null);
    if (recordId) {
      const { error: err } = await supabase
        .from('cms_custom_records')
        .update({
          title: title.trim(),
          data_json: data,
          status: 'draft',
          updated_by: user.id,
        })
        .eq('id', recordId);
      if (err) setError(err.message);
      else {
        setMessage('Draft saved to shadow CMS (not production).');
        setDirty(false);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? { ...r, title: title.trim(), data_json: data, status: 'draft' }
              : r,
          ),
        );
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
        .select('id, title, data_json, status, module_def_id')
        .single();
      if (err) setError(err.message);
      else if (inserted) {
        setRecordId(inserted.id as string);
        setRecords((prev) => [inserted as RecordRow, ...prev]);
        setMessage('Draft page created in shadow CMS.');
        setDirty(false);
      }
    }
  }, [canEdit, user, def, title, recordId, data, instanceId, clientId]);

  const uploadFieldImage = useCallback(
    async (key: string, file: File) => {
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
        setField(key, row.storage_path);
        setMessage('Image uploaded to media library.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploadingKey(null);
      }
    },
    [canEdit, user, clientId, instanceId, def, setField],
  );

  const bridge: TreasureHouseEditorBridge | null = def
    ? {
        moduleCode: def.module_code,
        moduleName: def.module_name,
        recordId,
        recordTitle: title,
        fields: def.fields_json,
        data,
        canEdit,
        setTitle: (t) => {
          setTitle(t);
          setDirty(true);
        },
        setField,
        saveDraft: () => {
          void saveDraft();
        },
        uploadingKey,
        uploadFieldImage: (key, file) => void uploadFieldImage(key, file),
        selectedFieldKey,
      }
    : null;

  function openRecord(row: RecordRow, opts?: { forceReload?: boolean }) {
    const modDef = defs.find((d) => d.id === row.module_def_id);
    const nav = visualNav.find((n) => n.moduleCode === modDef?.module_code);
    if (nav) setModuleKey(nav.key);
    if (row.id === recordId && !opts?.forceReload) return;
    setRecordId(row.id);
    setTitle(row.title);
    setData(dataToStrings(row.data_json));
    setDirty(false);
  }

  function onLayerSelect(node: StudioLayerNode) {
    if (node.id.startsWith('module:') || node.id.startsWith('module-empty:')) {
      const key = node.id.includes('module-empty:')
        ? node.id.slice('module-empty:'.length)
        : node.id.slice('module:'.length);
      setModuleKey(key);
      setSelectedFieldKey(null);
      return;
    }
    if (node.id.startsWith('record:')) {
      const id = node.id.slice('record:'.length);
      const row = records.find((r) => r.id === id);
      if (!row) return;
      openRecord(row);
      setSelectedFieldKey(null);
      return;
    }
    if (node.id.startsWith('field:')) {
      const parts = node.id.split(':');
      const rid = parts[1];
      const fkey = parts.slice(2).join(':');
      const row = records.find((r) => r.id === rid);
      if (row) openRecord(row);
      setSelectedFieldKey(fkey);
      setSelectedKind(node.targetType === 'image' ? 'image' : 'text');
    }
  }

  function onSelectField(key: string, kind: 'text' | 'image') {
    setSelectedFieldKey(key);
    setSelectedKind(kind);
  }

  const properties = (
    <div className="vs-tool">
      {!recordId && !title ? (
        <p className="vs-tool-hint">
          Select a page or content record in <strong>Layers</strong>. Dashboard statistics and
          record administration stay in CMS Management — this studio only edits website content.
        </p>
      ) : (
        <>
          <p className="vs-tool-hint">
            <strong>{def?.module_name ?? activeNav?.label}</strong>
            {recordId ? ` · ${title || 'Untitled'}` : ' · New draft'}
          </p>
          {selectedFieldKey ? (
            <p>
              Selected:{' '}
              <strong>
                {selectedFieldKey === '__title__'
                  ? 'Page title'
                  : def?.fields_json.find((f) => f.key === selectedFieldKey)?.label ??
                    selectedFieldKey}
              </strong>{' '}
              ({selectedKind})
            </p>
          ) : (
            <p className="vs-tool-hint">Click a heading, text or image on the canvas to inspect it.</p>
          )}
          <p className="muted-sm">
            Colour, layout, effects and animation stay unavailable — the shadow schema has no safe
            place to persist them.
          </p>
          {message ? <p className="ok">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </>
      )}
    </div>
  );

  return (
    <div className="vs-th-studio-wrap">
      <div className="vs-th-studio-chrome">
        <div>
          <strong>Visual Studio</strong>
          <span className="muted-sm">
            {' '}
            · Shadow website editing · not production Treasure House
          </span>
        </div>
        {onExitToManagement ? (
          <button type="button" className="secondary" onClick={onExitToManagement}>
            Back to CMS Management
          </button>
        ) : null}
      </div>
      <VisualStudioShell
        userId={user?.id}
        instanceId={`${instanceId}:th-visual`}
        adapter={adapter}
        selection={selection}
        onSelectionChange={onLayerSelect}
        capabilities={capabilities}
        viewport="desktop"
        onViewport={() => undefined}
        canEdit={canEdit}
        canPublish={canPublish}
        dirty={dirty}
        onSave={() => void saveDraft()}
        onViewModeChange={(mode) => setPreviewSurface(mode === 'preview')}
        onClearSelection={() => setSelectedFieldKey(null)}
        textTool={<TreasureHouseTextTool bridge={bridge} focusFieldKey={selectedFieldKey} />}
        imageTool={<TreasureHouseImageTool bridge={bridge} focusFieldKey={selectedFieldKey} />}
        properties={properties}
        canvas={
          <div className="vs-th-host">
            {!def ? (
              <div className="vs-th-empty">
                <h2>No shadow module schema</h2>
                <p>
                  Open CMS Management to confirm this instance has custom module definitions, then
                  return here to edit pages visually.
                </p>
              </div>
            ) : !recordId && !records.length ? (
              <div className="vs-th-empty">
                <h2>{activeNav?.label ?? 'Pages'}</h2>
                <p>
                  No shadow records yet. Create one in CMS Management, or start a draft title here
                  and Save Draft.
                </p>
                {canEdit ? (
                  <label>
                    New page title
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="e.g. About"
                    />
                  </label>
                ) : null}
              </div>
            ) : (
              <TreasureHousePageCanvas
                moduleName={def.module_name}
                moduleCode={def.module_code}
                recordTitle={title}
                fields={def.fields_json}
                data={data}
                selectedFieldKey={selectedFieldKey}
                previewMode={previewSurface}
                canEdit={canEdit}
                onSelectField={onSelectField}
                onChangeField={setField}
              />
            )}
          </div>
        }
      />
    </div>
  );
}
