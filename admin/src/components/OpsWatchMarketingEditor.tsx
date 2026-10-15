import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { OpsWatchDraftCanvas } from './OpsWatchDraftCanvas';
import { signedCmsMediaUrl, uploadClientCmsImage } from '../lib/files';
import {
  CmsEditMode,
  CmsSelection,
  defaultChromeSelection,
  defaultPageSelection,
  modulePublicPath,
  selectionLabel,
  sectionIdFromSelection,
} from '../lib/opswatchCmsSelection';
import {
  MarketingCta,
  MarketingPageContent,
  MarketingSection,
  MarketingSiteChrome,
  blankCard,
  blankCta,
  blankSection,
  canRemoveSection,
  isChromeModule,
  mergeCmsChrome,
  mergeCmsPage,
  moveItem,
  seedChrome,
} from '../lib/opswatchMarketing';
import { useAuth } from '../lib/auth';
import { explainCmsConnectionError } from '../lib/cmsConnectionStatus';
import { supabase } from '../lib/supabase';

type ModuleInfo = { code: string; label: string; kind: string };

type ModuleState = {
  code: string;
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  draft_revision: number;
  published_revision: number;
};

type Viewport = 'desktop' | 'tablet' | 'mobile';

export type OpsWatchEditorBridge = {
  page: MarketingPageContent | null;
  chrome: MarketingSiteChrome | null;
  chromeMode: boolean;
  moduleCode: string;
  selection: CmsSelection;
  setSelection: (sel: CmsSelection) => void;
  applyPage: (updater: (prev: MarketingPageContent) => MarketingPageContent) => void;
  dirty: boolean;
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  canEdit: boolean;
  canPublish: boolean;
  canUploadMedia: boolean;
  uploading: boolean;
  attachImage: (target: 'hero' | 'section', file: File, sectionId?: string) => void | Promise<void>;
  previewUrl: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onRollback: () => void;
  healthLabel: string | null;
  connectionTone: 'ok' | 'warn' | 'danger' | 'muted';
  error: string | null;
  message: string | null;
  contentUnavailable: boolean;
  reconnecting: boolean;
  onReconnect: () => void;
};

type Props = {
  instanceId: string;
  clientId?: string | null;
  canEdit: boolean;
  canPublish: boolean;
  canUploadMedia?: boolean;
  publicSiteUrl?: string | null;
  /** When true, outer Visual Studio shell owns floating tools; editor stays the canvas + rails. */
  studioEmbed?: boolean;
  /** Edit = draft canvas only; Preview = site iframe only (no stacked dual view). */
  studioSurface?: 'edit' | 'preview';
  onBridgeChange?: (bridge: OpsWatchEditorBridge) => void;
};

const VIEWPORT_WIDTH: Record<Viewport, number | string> = {
  desktop: '100%',
  tablet: 768,
  mobile: 390,
};

async function gateway(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('cms-integration-gateway', {
    body: {
      ...body,
      idempotency_key: `${String(body.action)}-${String(body.instance_id)}-${Date.now()}`,
    },
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const bodyJson = (await ctx.json()) as { error?: string; message?: string };
        detail = bodyJson.error || bodyJson.message || detail;
      }
    } catch {
      /* keep detail */
    }
    if (data && typeof data === 'object' && 'error' in data) {
      const fromData = (data as { error?: string }).error;
      if (fromData) detail = fromData;
    }
    throw new Error(detail);
  }
  const payload = data as {
    ok?: boolean;
    error?: string;
    upstream?: Record<string, unknown>;
    upstream_status?: number;
  };
  if (!payload?.ok) {
    throw new Error(payload?.error ?? `Gateway failed (${payload?.upstream_status ?? 'unknown'})`);
  }
  return payload.upstream ?? payload;
}

/**
 * Visual marketing editor for OpsWatch Managed Website modules.
 * Three panels share one CmsSelection; draft canvas is the primary preview.
 */
export function OpsWatchMarketingEditor({
  instanceId,
  clientId,
  canEdit,
  canPublish,
  canUploadMedia = false,
  publicSiteUrl,
  studioEmbed = false,
  studioSurface = 'edit',
  onBridgeChange,
}: Props) {
  const { user } = useAuth();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [moduleCode, setModuleCode] = useState('opswatch.page.home');
  const [state, setState] = useState<ModuleState | null>(null);
  const [page, setPage] = useState<MarketingPageContent | null>(null);
  const [chrome, setChrome] = useState<MarketingSiteChrome | null>(null);
  const [selection, setSelection] = useState<CmsSelection>(defaultPageSelection());
  const [editMode, setEditMode] = useState<CmsEditMode>('visual');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [connectionTone, setConnectionTone] = useState<'ok' | 'warn' | 'danger' | 'muted'>('muted');
  const [contentUnavailable, setContentUnavailable] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(280);
  const [rightRailWidth, setRightRailWidth] = useState(340);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [propertiesPortal, setPropertiesPortal] = useState<HTMLElement | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const pagePast = useRef<MarketingPageContent[]>([]);
  const pageFuture = useRef<MarketingPageContent[]>([]);
  const chromePast = useRef<MarketingSiteChrome[]>([]);
  const chromeFuture = useRef<MarketingSiteChrome[]>([]);

  const siteBase = useMemo(
    () => publicSiteUrl?.replace(/\/$/, '') || 'http://localhost:3000',
    [publicSiteUrl],
  );

  const chromeMode = isChromeModule(moduleCode);
  const canUndo = chromeMode ? chromePast.current.length > 0 : pagePast.current.length > 0;
  const canRedo = chromeMode ? chromeFuture.current.length > 0 : pageFuture.current.length > 0;
  void historyTick;
  const frameWidth = VIEWPORT_WIDTH[viewport];
  const modulePath = modulePublicPath(moduleCode);
  const livePreviewSrc = previewUrl ?? `${siteBase}${modulePath}`;

  const selectedSection = useMemo(() => {
    const sid = sectionIdFromSelection(selection);
    if (!sid || !page) return null;
    return page.sections.find((s) => s.id === sid) ?? null;
  }, [page, selection]);

  const selectedCard = useMemo(() => {
    if (selection.kind !== 'card' || !selectedSection) return null;
    return (selectedSection.cards ?? []).find((c) => c.id === selection.cardId) ?? null;
  }, [selection, selectedSection]);

  const loadCapabilities = useCallback(async () => {
    const upstream = (await gateway({
      action: 'capabilities',
      instance_id: instanceId,
    })) as { modules?: ModuleInfo[] };
    const list = upstream.modules ?? [];
    setModules(list);
    if (list.length && !list.some((m) => m.code === moduleCode)) {
      const home = list.find((m) => m.code === 'opswatch.page.home');
      setModuleCode(home?.code ?? list[0]?.code ?? 'opswatch.page.home');
    }
  }, [instanceId, moduleCode]);

  const clearEditHistory = useCallback(() => {
    pagePast.current = [];
    pageFuture.current = [];
    chromePast.current = [];
    chromeFuture.current = [];
    setHistoryTick((n) => n + 1);
  }, []);

  const applyModuleState = useCallback((code: string, upstream: ModuleState) => {
    setState(upstream);
    setPreviewUrl(null);
    setShowLivePreview(false);
    clearEditHistory();
    const source =
      (upstream.draft as Record<string, unknown> | null) ??
      (upstream.published as Record<string, unknown> | null);
    if (isChromeModule(code)) {
      setChrome(mergeCmsChrome(source));
      setPage(null);
      setSelection(defaultChromeSelection());
    } else {
      const nextPage = mergeCmsPage(code, source);
      setPage(nextPage);
      setChrome(seedChrome());
      setSelection(defaultPageSelection());
    }
    setDirty(false);
  }, [clearEditHistory]);

  const loadModule = useCallback(
    async (code: string) => {
      setModuleLoading(true);
      try {
        const upstream = (await gateway({
          action: 'get_content',
          instance_id: instanceId,
          module_code: code,
        })) as ModuleState;
        applyModuleState(code, upstream);
      } finally {
        setModuleLoading(false);
      }
    },
    [instanceId, applyModuleState],
  );

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const healthUp = (await gateway({ action: 'health', instance_id: instanceId })) as {
          adapter?: string;
          ok?: boolean;
        };
        const label = healthUp.adapter
          ? `Connected · ${healthUp.adapter}`
          : healthUp.ok
            ? 'Connected'
            : 'Health unknown';
        setHealth(label);
        setConnectionTone(healthUp.ok || healthUp.adapter ? 'ok' : 'warn');
        await loadCapabilities();
      } catch (e) {
        const detail = explainCmsConnectionError(
          e instanceof Error ? e.message : 'Failed to connect OpsWatch CMS',
        );
        setHealth('Connection failed');
        setConnectionTone('danger');
        setError(detail);
      }
    })();
  }, [instanceId, loadCapabilities]);

  useEffect(() => {
    if (!moduleCode) return;
    void (async () => {
      setError(null);
      setPreviewUrl(null);
      setShowLivePreview(false);
      try {
        await loadModule(moduleCode);
        setContentUnavailable(false);
      } catch (e) {
        setContentUnavailable(true);
        setState(null);
        setPage(null);
        setChrome(null);
        setError(
          explainCmsConnectionError(e instanceof Error ? e.message : 'Failed to load module'),
        );
      }
    })();
  }, [moduleCode, loadModule]);

  function patchPage(updater: (prev: MarketingPageContent) => MarketingPageContent) {
    setPage((prev) => {
      if (!prev) return prev;
      pagePast.current = [...pagePast.current.slice(-49), structuredClone(prev)];
      pageFuture.current = [];
      setHistoryTick((n) => n + 1);
      return updater(prev);
    });
    setDirty(true);
  }

  function patchChrome(updater: (prev: MarketingSiteChrome) => MarketingSiteChrome) {
    setChrome((prev) => {
      if (!prev) return prev;
      chromePast.current = [...chromePast.current.slice(-49), structuredClone(prev)];
      chromeFuture.current = [];
      setHistoryTick((n) => n + 1);
      return updater(prev);
    });
    setDirty(true);
  }

  function patchSection(sectionId: string, updater: (s: MarketingSection) => MarketingSection) {
    patchPage((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
    }));
  }

  function onUndo() {
    if (chromeMode) {
      setChrome((prev) => {
        if (!prev || !chromePast.current.length) return prev;
        const previous = chromePast.current[chromePast.current.length - 1];
        chromePast.current = chromePast.current.slice(0, -1);
        chromeFuture.current = [structuredClone(prev), ...chromeFuture.current];
        setHistoryTick((n) => n + 1);
        setDirty(true);
        return previous;
      });
      return;
    }
    setPage((prev) => {
      if (!prev || !pagePast.current.length) return prev;
      const previous = pagePast.current[pagePast.current.length - 1];
      pagePast.current = pagePast.current.slice(0, -1);
      pageFuture.current = [structuredClone(prev), ...pageFuture.current];
      setHistoryTick((n) => n + 1);
      setDirty(true);
      return previous;
    });
  }

  function onRedo() {
    if (chromeMode) {
      setChrome((prev) => {
        if (!prev || !chromeFuture.current.length) return prev;
        const [next, ...rest] = chromeFuture.current;
        chromeFuture.current = rest;
        chromePast.current = [...chromePast.current, structuredClone(prev)];
        setHistoryTick((n) => n + 1);
        setDirty(true);
        return next;
      });
      return;
    }
    setPage((prev) => {
      if (!prev || !pageFuture.current.length) return prev;
      const [next, ...rest] = pageFuture.current;
      pageFuture.current = rest;
      pagePast.current = [...pagePast.current, structuredClone(prev)];
      setHistoryTick((n) => n + 1);
      setDirty(true);
      return next;
    });
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!canEdit || !state) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const content = chromeMode
        ? (chrome as unknown as Record<string, unknown>)
        : (page as unknown as Record<string, unknown>);
      if (!content) throw new Error('Nothing to save');
      await gateway({
        action: 'put_content',
        instance_id: instanceId,
        module_code: moduleCode,
        content,
      });
      setMessage('Draft saved to OpsWatch. Not public until published.');
      setDirty(false);
      await loadModule(moduleCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    if (!canEdit) return;
    if (dirty) await onSave();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const upstream = (await gateway({
        action: 'preview_token',
        instance_id: instanceId,
      })) as { token?: string; ok?: boolean };
      const token = upstream.token;
      if (!token) throw new Error('Preview token missing from OpsWatch');
      const url = `${siteBase}${modulePath}?cmsPreview=${encodeURIComponent(token)}`;
      setPreviewUrl(url);
      setShowLivePreview(true);
      setMessage('Saved-draft site preview ready. Public site unchanged until publish.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!canPublish) {
      setError('You do not have publish permission for this Managed Website.');
      return;
    }
    if (dirty) await onSave();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await gateway({
        action: 'publish',
        instance_id: instanceId,
        module_code: moduleCode,
      });
      setMessage('Published to OpsWatch public site.');
      await loadModule(moduleCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRollback() {
    if (!canPublish) {
      setError('You do not have publish permission to roll back.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await gateway({
        action: 'rollback',
        instance_id: instanceId,
        module_code: moduleCode,
      });
      setMessage('Rollback restored the previous published revision.');
      await loadModule(moduleCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setBusy(false);
    }
  }

  async function attachImage(target: 'hero' | 'section', file: File, sectionId?: string) {
    if (!canEdit || !canUploadMedia || !clientId || !user) {
      setError('Media upload requires edit permission and an instance client.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadClientCmsImage({
        clientId,
        instanceId,
        file,
        userId: user.id,
        altText: file.name,
      });
      const url = await signedCmsMediaUrl(uploaded.storage_path, 60 * 60 * 24 * 365 * 5);
      const image = { url, alt: file.name.replace(/\.[^.]+$/, ''), storagePath: uploaded.storage_path };
      if (target === 'hero') {
        patchPage((prev) => ({ ...prev, hero: { ...prev.hero, image } }));
      } else if (sectionId) {
        patchSection(sectionId, (s) => ({ ...s, image }));
      }
      setMessage('Image attached to draft. Save and publish to show on the public site.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onResizeStart(side: 'left' | 'right', e: ReactMouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftRailWidth : rightRailWidth;
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      if (side === 'left') {
        setLeftRailWidth(Math.min(420, Math.max(220, startW + delta)));
      } else {
        setRightRailWidth(Math.min(480, Math.max(260, startW - delta)));
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const treeActive = (sel: CmsSelection) =>
    selection.kind === sel.kind &&
    JSON.stringify(selection) === JSON.stringify(sel);

  useEffect(() => {
    if (!studioEmbed) {
      setPropertiesPortal(null);
      return;
    }
    const sync = () => {
      const el = document.getElementById('vs-properties-root');
      setPropertiesPortal((prev) => (prev === el ? prev : el));
    };
    sync();
    const timer = window.setInterval(sync, 300);
    return () => window.clearInterval(timer);
  }, [studioEmbed]);

  const reconnect = useCallback(async () => {
    setReconnecting(true);
    setError(null);
    setMessage(null);
    try {
      const healthUp = (await gateway({ action: 'health', instance_id: instanceId })) as {
        adapter?: string;
        ok?: boolean;
      };
      setHealth(healthUp.adapter ? `Connected · ${healthUp.adapter}` : 'Connected');
      setConnectionTone('ok');
      setMessage('Authenticated health check succeeded.');
      await loadCapabilities();
      await loadModule(moduleCode);
      setContentUnavailable(false);
    } catch (e) {
      setHealth('Connection failed');
      setConnectionTone('danger');
      setContentUnavailable(true);
      setPage(null);
      setChrome(null);
      setState(null);
      setError(explainCmsConnectionError(e instanceof Error ? e.message : 'Reconnect failed'));
    } finally {
      setReconnecting(false);
    }
  }, [instanceId, loadCapabilities, loadModule, moduleCode]);

  useEffect(() => {
    if (!onBridgeChange) return;
    onBridgeChange({
      page,
      chrome,
      chromeMode,
      moduleCode,
      selection,
      setSelection,
      applyPage: patchPage,
      dirty,
      viewport,
      setViewport,
      canEdit,
      canPublish,
      canUploadMedia: Boolean(canUploadMedia && clientId),
      uploading,
      attachImage,
      previewUrl,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
      onSave: () => void onSave(),
      onPreview: () => void onPreview(),
      onPublish: () => void onPublish(),
      onRollback: () => void onRollback(),
      healthLabel: health,
      connectionTone,
      error,
      message,
      contentUnavailable,
      reconnecting,
      onReconnect: () => void reconnect(),
    });
  }, [
    onBridgeChange,
    page,
    chrome,
    chromeMode,
    moduleCode,
    selection,
    dirty,
    viewport,
    canEdit,
    canPublish,
    canUploadMedia,
    clientId,
    uploading,
    previewUrl,
    canUndo,
    canRedo,
    historyTick,
    health,
    connectionTone,
    error,
    message,
    contentUnavailable,
    reconnecting,
    reconnect,
  ]);

  return (
    <div
      className={`panel opswatch-marketing-editor ow-cms-visual${studioEmbed ? ' is-studio-embed' : ''}`}
    >
      {!studioEmbed ? (
        <header className="page-head ow-cms-head">
          <div>
            <h2>OpsWatch website</h2>
            <p className="ow-cms-status-line">
              Visual marketing editor. Billing and monitoring stay out of this workspace.
              {health ? ` · ${health}` : ''}
              {dirty ? ' · Unsaved draft changes' : ''}
            </p>
          </div>
          <div className="ow-cms-head-controls">
            <div className="ow-cms-mode-toggle" role="group" aria-label="Edit mode">
              <button
                type="button"
                className={editMode === 'visual' ? 'is-active' : 'secondary'}
                onClick={() => setEditMode('visual')}
              >
                Visual Edit
              </button>
              <button
                type="button"
                className={editMode === 'structure' ? 'is-active' : 'secondary'}
                onClick={() => setEditMode('structure')}
              >
                Structure Edit
              </button>
            </div>
            <div className="ow-cms-viewport-toggle" role="group" aria-label="Preview viewport">
              {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={viewport === v ? 'is-active' : 'secondary'}
                  onClick={() => setViewport(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={canvasExpanded ? 'is-active' : 'secondary'}
              onClick={() => setCanvasExpanded((v) => !v)}
              aria-pressed={canvasExpanded}
            >
              {canvasExpanded ? 'Show panels' : 'Expand canvas'}
            </button>
          </div>
        </header>
      ) : null}

      {studioEmbed ? null : error ? <div className="error">{error}</div> : null}
      {studioEmbed ? null : message ? <div className="ok">{message}</div> : null}

      <div className="toolbar ow-cms-toolbar">
        <label>
          Page / module
          <select
            value={moduleCode}
            onChange={(e) => setModuleCode(e.target.value)}
            aria-label="OpsWatch CMS module"
          >
            {(modules.length
              ? modules
              : [{ code: 'opswatch.page.home', label: 'Homepage', kind: 'page' }]
            ).map((m) => (
              <option key={m.code} value={m.code}>
                {m.label || m.code}
              </option>
            ))}
          </select>
        </label>
        <span className="muted-sm">
          {modulePath}
          {contentUnavailable
            ? ' · Revisions unavailable until the CMS is connected'
            : ` · Draft r${state?.draft_revision ?? '—'} · Published r${state?.published_revision ?? '—'}`}
          {health ? ` · ${health}` : ''}
        </span>
        {!studioEmbed || studioSurface === 'edit' ? (
          <span className="ow-cms-selection-chip">{selectionLabel(selection)}</span>
        ) : null}
        {!studioEmbed ? (
          <div className="actions">
            <button type="button" className="secondary" disabled={reconnecting} onClick={() => void reconnect()}>
              {reconnecting ? 'Checking…' : 'Reconnect'}
            </button>
            {canEdit ? (
              <button type="button" disabled={busy} onClick={() => void onSave()}>
                Save draft
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => void onPreview()}>
                Preview
              </button>
            ) : null}
            {canPublish ? (
              <button type="button" disabled={busy} onClick={() => void onPublish()}>
                Publish
              </button>
            ) : (
              <span className="muted-sm">Publish permission required to go live.</span>
            )}
            {canPublish ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => void onRollback()}>
                Rollback
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`ow-cms-layout${editMode === 'structure' ? ' is-structure' : ' is-visual'}${canvasExpanded || studioEmbed ? ' is-canvas-expanded' : ''}`}
        style={
          {
            '--ow-left-rail': `${leftRailWidth}px`,
            '--ow-right-rail': `${rightRailWidth}px`,
          } as CSSProperties
        }
      >
        {!studioEmbed ? (
        <aside className="ow-cms-rail ow-cms-rail-left">
          {moduleLoading ? (
            <p className="muted-sm">Loading module…</p>
          ) : chromeMode && chrome ? (
            <ul className="ow-cms-tree">
              <li>
                <button
                  type="button"
                  className={treeActive({ kind: 'chromeBlurb' }) ? 'is-active' : ''}
                  onClick={() => setSelection({ kind: 'chromeBlurb' })}
                >
                  Product blurb
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={treeActive({ kind: 'chromeNav' }) ? 'is-active' : ''}
                  onClick={() => setSelection({ kind: 'chromeNav' })}
                >
                  Navigation
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={
                    treeActive({ kind: 'chromeFooter', which: 'company' }) ? 'is-active' : ''
                  }
                  onClick={() => setSelection({ kind: 'chromeFooter', which: 'company' })}
                >
                  Footer — company
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={
                    treeActive({ kind: 'chromeFooter', which: 'getStarted' }) ? 'is-active' : ''
                  }
                  onClick={() => setSelection({ kind: 'chromeFooter', which: 'getStarted' })}
                >
                  Footer — get started
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={treeActive({ kind: 'chromeFooter', which: 'note' }) ? 'is-active' : ''}
                  onClick={() => setSelection({ kind: 'chromeFooter', which: 'note' })}
                >
                  Footer note
                </button>
              </li>
            </ul>
          ) : page ? (
            <>
              <ul className="ow-cms-tree">
                <li>
                  <button
                    type="button"
                    className={treeActive({ kind: 'pageSettings' }) ? 'is-active' : ''}
                    onClick={() => setSelection({ kind: 'pageSettings' })}
                  >
                    Page settings (SEO)
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className={
                      selection.kind === 'hero' ||
                      selection.kind === 'heroImage' ||
                      selection.kind === 'heroCta'
                        ? 'is-active'
                        : ''
                    }
                    onClick={() => setSelection({ kind: 'hero' })}
                  >
                    Hero
                  </button>
                  <ul>
                    <li>
                      <button
                        type="button"
                        className={treeActive({ kind: 'heroImage' }) ? 'is-active' : ''}
                        onClick={() => setSelection({ kind: 'heroImage' })}
                      >
                        Hero image
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        className={
                          treeActive({ kind: 'heroCta', which: 'primary' }) ? 'is-active' : ''
                        }
                        onClick={() => setSelection({ kind: 'heroCta', which: 'primary' })}
                      >
                        Primary button
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        className={
                          treeActive({ kind: 'heroCta', which: 'secondary' }) ? 'is-active' : ''
                        }
                        onClick={() => setSelection({ kind: 'heroCta', which: 'secondary' })}
                      >
                        Secondary button
                      </button>
                    </li>
                  </ul>
                </li>
              </ul>

              <h3>Sections ({page.sections.length})</h3>
              <ul className="ow-cms-tree ow-cms-section-list">
                {page.sections.map((section, index) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={
                        selection.kind === 'section' && selection.sectionId === section.id
                          ? 'is-active'
                          : sectionIdFromSelection(selection) === section.id
                            ? 'is-section-open'
                            : ''
                      }
                      onClick={() => setSelection({ kind: 'section', sectionId: section.id })}
                    >
                      <span>{section.title || section.id}</span>
                      <span className="muted-sm">{section.id}</span>
                    </button>
                    <ul>
                      {(section.cards ?? []).map((card) => (
                        <li key={card.id}>
                          <button
                            type="button"
                            className={
                              selection.kind === 'card' && selection.cardId === card.id
                                ? 'is-active'
                                : ''
                            }
                            onClick={() =>
                              setSelection({
                                kind: 'card',
                                sectionId: section.id,
                                cardId: card.id,
                              })
                            }
                          >
                            <span>{card.title || 'Untitled card'}</span>
                            {card.state ? <span className="muted-sm">{card.state}</span> : null}
                          </button>
                        </li>
                      ))}
                      {(section.ctas ?? []).map((cta, ctaIndex) => (
                        <li key={`${section.id}-cta-${ctaIndex}`}>
                          <button
                            type="button"
                            className={
                              selection.kind === 'sectionCta' &&
                              selection.sectionId === section.id &&
                              selection.ctaIndex === ctaIndex
                                ? 'is-active'
                                : ''
                            }
                            onClick={() =>
                              setSelection({
                                kind: 'sectionCta',
                                sectionId: section.id,
                                ctaIndex,
                              })
                            }
                          >
                            Button: {cta.label || ctaIndex + 1}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          className={
                            selection.kind === 'sectionImage' &&
                            selection.sectionId === section.id
                              ? 'is-active'
                              : ''
                          }
                          onClick={() =>
                            setSelection({ kind: 'sectionImage', sectionId: section.id })
                          }
                        >
                          Section image
                        </button>
                      </li>
                    </ul>
                    {editMode === 'structure' ? (
                      <div className="ow-cms-section-move">
                        <button
                          type="button"
                          className="secondary"
                          disabled={!canEdit || index === 0}
                          onClick={() =>
                            patchPage((prev) => ({
                              ...prev,
                              sections: moveItem(prev.sections, index, index - 1),
                            }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!canEdit || index >= page.sections.length - 1}
                          onClick={() =>
                            patchPage((prev) => ({
                              ...prev,
                              sections: moveItem(prev.sections, index, index + 1),
                            }))
                          }
                        >
                          ↓
                        </button>
                        {canRemoveSection(moduleCode, section.id) ? (
                          <button
                            type="button"
                            className="secondary"
                            disabled={!canEdit}
                            onClick={() => {
                              patchPage((prev) => ({
                                ...prev,
                                sections: prev.sections.filter((s) => s.id !== section.id),
                              }));
                              if (sectionIdFromSelection(selection) === section.id) {
                                setSelection(defaultPageSelection());
                              }
                            }}
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="muted-sm">Required</span>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canEdit && editMode === 'structure' ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const section = blankSection(moduleCode, page.sections.length);
                    patchPage((prev) => ({ ...prev, sections: [...prev.sections, section] }));
                    setSelection({ kind: 'section', sectionId: section.id });
                  }}
                >
                  Add section
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted-sm">Loading module…</p>
          )}
        </aside>
        ) : null}

        {!studioEmbed ? (
          <div
            className="ow-cms-rail-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => onResizeStart('left', e)}
          />
        ) : null}

        <div className="ow-cms-canvas">
          {studioEmbed && studioSurface === 'preview' ? (
            <div
              className={`ow-cms-frame ow-cms-live-frame viewport-${viewport}`}
              style={{ width: frameWidth, maxWidth: '100%' }}
            >
              <iframe
                title="OpsWatch site preview"
                src={livePreviewSrc}
                className="ow-cms-iframe ow-cms-iframe-tall"
              />
            </div>
          ) : (
            <div
              className={`ow-cms-frame viewport-${viewport}`}
              style={{ width: frameWidth, maxWidth: '100%' }}
            >
              {contentUnavailable ? (
                <div className="ow-cms-unavailable" role="status">
                  <strong>Draft content is not loaded.</strong>
                  <p>
                    The canvas is empty because OpsWatch did not return a draft. Placeholder hero
                    copy is hidden until a real module load succeeds.
                  </p>
                </div>
              ) : (
              <OpsWatchDraftCanvas
                page={page}
                chrome={chrome}
                chromeMode={chromeMode}
                selection={selection}
                onSelect={setSelection}
                visualMode={editMode === 'visual'}
                siteBase={siteBase}
              />
              )}
            </div>
          )}

          {!studioEmbed ? (
            <>
              <div className="ow-cms-live-preview-bar">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowLivePreview((v) => !v)}
                >
                  {showLivePreview ? 'Hide site preview' : 'Show site preview'}
                </button>
                <span className="muted-sm">
                  Draft canvas updates instantly. Site preview loads saved draft via Preview token (
                  {modulePath}).
                </span>
              </div>
              {showLivePreview ? (
                <div
                  className={`ow-cms-frame ow-cms-live-frame viewport-${viewport}`}
                  style={{ width: frameWidth, maxWidth: '100%' }}
                >
                  <iframe
                    title="OpsWatch site preview"
                    src={livePreviewSrc}
                    className="ow-cms-iframe"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {!studioEmbed ? (
          <div
            className="ow-cms-rail-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => onResizeStart('right', e)}
          />
        ) : null}

        {(() => {
          const propertiesBody = (
            <>
              <h3>{selectionLabel(selection)}</h3>
              {!canEdit ? <p className="muted-sm">View only — edit permission required.</p> : null}
              {chromeMode && chrome ? (
                <ChromeContextual
                  chrome={chrome}
                  selection={selection}
                  canEdit={canEdit && !busy}
                  onChange={patchChrome}
                />
              ) : page ? (
                <PageContextual
                  page={page}
                  selection={selection}
                  selectedSection={selectedSection}
                  selectedCard={selectedCard}
                  canEdit={canEdit && !busy}
                  canUpload={Boolean(canUploadMedia && clientId)}
                  uploading={uploading}
                  moduleCode={moduleCode}
                  onPatchPage={patchPage}
                  onPatchSection={patchSection}
                  onSelect={setSelection}
                  onAttachImage={attachImage}
                />
              ) : (
                <p className="muted-sm">Nothing selected.</p>
              )}
            </>
          );
          if (studioEmbed && propertiesPortal) {
            return createPortal(propertiesBody, propertiesPortal);
          }
          if (studioEmbed) return null;
          return <aside className="ow-cms-rail ow-cms-rail-right">{propertiesBody}</aside>;
        })()}
      </div>
    </div>
  );
}

function PageContextual({
  page,
  selection,
  selectedSection,
  selectedCard,
  canEdit,
  canUpload,
  uploading,
  moduleCode,
  onPatchPage,
  onPatchSection,
  onSelect,
  onAttachImage,
}: {
  page: MarketingPageContent;
  selection: CmsSelection;
  selectedSection: MarketingSection | null;
  selectedCard: { id: string; title: string; body: string; state?: string; href?: string; icon?: string } | null;
  canEdit: boolean;
  canUpload: boolean;
  uploading: boolean;
  moduleCode: string;
  onPatchPage: (updater: (prev: MarketingPageContent) => MarketingPageContent) => void;
  onPatchSection: (sectionId: string, updater: (s: MarketingSection) => MarketingSection) => void;
  onSelect: (sel: CmsSelection) => void;
  onAttachImage: (target: 'hero' | 'section', file: File, sectionId?: string) => Promise<void>;
}) {
  if (selection.kind === 'pageSettings') {
    return (
      <>
        <label>
          Meta title
          <input
            value={page.metaTitle}
            disabled={!canEdit}
            onChange={(e) => onPatchPage((p) => ({ ...p, metaTitle: e.target.value }))}
          />
        </label>
        <label>
          Meta description
          <textarea
            rows={3}
            value={page.metaDescription}
            disabled={!canEdit}
            onChange={(e) => onPatchPage((p) => ({ ...p, metaDescription: e.target.value }))}
          />
        </label>
      </>
    );
  }

  if (selection.kind === 'hero') {
    return (
      <>
        <label>
          Eyebrow
          <input
            value={page.hero.eyebrow}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchPage((p) => ({ ...p, hero: { ...p.hero, eyebrow: e.target.value } }))
            }
          />
        </label>
        <label>
          Headline
          <input
            value={page.hero.title}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchPage((p) => ({ ...p, hero: { ...p.hero, title: e.target.value } }))
            }
          />
        </label>
        <label>
          Supporting sentence
          <textarea
            rows={3}
            value={page.hero.subtitle}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchPage((p) => ({ ...p, hero: { ...p.hero, subtitle: e.target.value } }))
            }
          />
        </label>
        <label>
          Trust pills (one per line)
          <textarea
            rows={3}
            value={(page.hero.pills ?? []).join('\n')}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchPage((p) => ({
                ...p,
                hero: {
                  ...p.hero,
                  pills: e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              }))
            }
          />
        </label>
      </>
    );
  }

  if (selection.kind === 'heroImage') {
    return (
      <ImageField
        label="Hero image"
        url={page.hero.image?.url ?? ''}
        alt={page.hero.image?.alt ?? ''}
        canEdit={canEdit}
        canUpload={canUpload}
        uploading={uploading}
        onUrlAlt={(url, alt) =>
          onPatchPage((p) => ({
            ...p,
            hero: {
              ...p.hero,
              image: url ? { url, alt, storagePath: p.hero.image?.storagePath } : undefined,
            },
          }))
        }
        onUploadFile={(file) => void onAttachImage('hero', file)}
        onClear={() =>
          onPatchPage((p) => {
            const { image: _removed, ...hero } = p.hero;
            return { ...p, hero };
          })
        }
      />
    );
  }

  if (selection.kind === 'heroCta') {
    const which = selection.which;
    const cta = which === 'primary' ? page.hero.primaryCta : page.hero.secondaryCta;
    return (
      <CtaFields
        label={which === 'primary' ? 'Primary button' : 'Secondary button'}
        cta={cta}
        canEdit={canEdit}
        onChange={(next) =>
          onPatchPage((p) => ({
            ...p,
            hero: {
              ...p.hero,
              ...(which === 'primary' ? { primaryCta: next } : { secondaryCta: next }),
            },
          }))
        }
      />
    );
  }

  if (selection.kind === 'card' && selectedSection && selectedCard) {
    const cardIndex = (selectedSection.cards ?? []).findIndex((c) => c.id === selectedCard.id);
    return (
      <>
        <p className="muted-sm">
          Section: {selectedSection.title || selectedSection.id}
        </p>
        <label>
          Card title
          <input
            value={selectedCard.title}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).map((c, i) =>
                  i === cardIndex ? { ...c, title: e.target.value } : c,
                ),
              }))
            }
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={selectedCard.body}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).map((c, i) =>
                  i === cardIndex ? { ...c, body: e.target.value } : c,
                ),
              }))
            }
          />
        </label>
        <label>
          Icon
          <input
            value={selectedCard.icon ?? ''}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).map((c, i) =>
                  i === cardIndex ? { ...c, icon: e.target.value || undefined } : c,
                ),
              }))
            }
          />
        </label>
        <label>
          Status
          <select
            value={selectedCard.state ?? ''}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).map((c, i) =>
                  i === cardIndex ? { ...c, state: e.target.value || undefined } : c,
                ),
              }))
            }
          >
            <option value="">None</option>
            <option value="Live">Live</option>
            <option value="Available">Available</option>
            <option value="Preview">Preview</option>
            <option value="Foundation">Foundation</option>
            <option value="Coming soon">Coming soon</option>
          </select>
        </label>
        <label>
          Link href
          <input
            value={selectedCard.href ?? ''}
            disabled={!canEdit}
            onChange={(e) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).map((c, i) =>
                  i === cardIndex ? { ...c, href: e.target.value || undefined } : c,
                ),
              }))
            }
          />
        </label>
        {canEdit ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                cards: (s.cards ?? []).filter((_, i) => i !== cardIndex),
              }));
              onSelect({ kind: 'section', sectionId: selectedSection.id });
            }}
          >
            Remove card
          </button>
        ) : null}
      </>
    );
  }

  if (
    (selection.kind === 'section' ||
      selection.kind === 'sectionImage' ||
      selection.kind === 'sectionCta' ||
      selection.kind === 'card') &&
    selectedSection
  ) {
    if (selection.kind === 'sectionImage') {
      return (
        <>
          <ImageField
            label="Section image"
            url={selectedSection.image?.url ?? ''}
            alt={selectedSection.image?.alt ?? ''}
            canEdit={canEdit}
            canUpload={canUpload}
            uploading={uploading}
            onUrlAlt={(url, alt) =>
              onPatchSection(selectedSection.id, (s) => ({
                ...s,
                image: url ? { url, alt, storagePath: s.image?.storagePath } : undefined,
              }))
            }
            onUploadFile={(file) => void onAttachImage('section', file, selectedSection.id)}
            onClear={() =>
              onPatchSection(selectedSection.id, (s) => {
                const { image: _removed, ...rest } = s;
                return rest;
              })
            }
          />
          {canEdit ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const next = blankCard(moduleCode, (selectedSection.cards ?? []).length);
                onPatchSection(selectedSection.id, (s) => ({
                  ...s,
                  cards: [...(s.cards ?? []), next],
                }));
                onSelect({ kind: 'card', sectionId: selectedSection.id, cardId: next.id });
              }}
            >
              Add feature card
            </button>
          ) : null}
        </>
      );
    }

    if (selection.kind === 'sectionCta') {
      const cta = (selectedSection.ctas ?? [])[selection.ctaIndex];
      return (
        <CtaFields
          label={`Button ${selection.ctaIndex + 1}`}
          cta={cta}
          canEdit={canEdit}
          onChange={(next) =>
            onPatchSection(selectedSection.id, (s) => ({
              ...s,
              ctas: (s.ctas ?? []).map((c, i) => (i === selection.ctaIndex ? next! : c)),
            }))
          }
          onRemove={() => {
            onPatchSection(selectedSection.id, (s) => ({
              ...s,
              ctas: (s.ctas ?? []).filter((_, i) => i !== selection.ctaIndex),
            }));
            onSelect({ kind: 'section', sectionId: selectedSection.id });
          }}
        />
      );
    }

    if (selection.kind === 'section') {
      return (
        <>
          <label>
            Title
            <input
              value={selectedSection.title ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                onPatchSection(selectedSection.id, (s) => ({ ...s, title: e.target.value }))
              }
            />
          </label>
          <label>
            Eyebrow
            <input
              value={selectedSection.eyebrow ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                onPatchSection(selectedSection.id, (s) => ({ ...s, eyebrow: e.target.value }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={selectedSection.body ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                onPatchSection(selectedSection.id, (s) => ({ ...s, body: e.target.value }))
              }
            />
          </label>
          <label>
            Tone / background
            <select
              value={selectedSection.tone ?? 'default'}
              disabled={!canEdit}
              onChange={(e) =>
                onPatchSection(selectedSection.id, (s) => ({
                  ...s,
                  tone: e.target.value as MarketingSection['tone'],
                }))
              }
            >
              <option value="default">Default</option>
              <option value="band">Band</option>
              <option value="soft">Soft</option>
            </select>
          </label>
          <label>
            Columns
            <select
              value={selectedSection.columns ?? 3}
              disabled={!canEdit}
              onChange={(e) =>
                onPatchSection(selectedSection.id, (s) => ({
                  ...s,
                  columns: Number(e.target.value) as 2 | 3,
                }))
              }
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          {canEdit ? (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const next = blankCard(moduleCode, (selectedSection.cards ?? []).length);
                  onPatchSection(selectedSection.id, (s) => ({
                    ...s,
                    cards: [...(s.cards ?? []), next],
                  }));
                  onSelect({ kind: 'card', sectionId: selectedSection.id, cardId: next.id });
                }}
              >
                Add feature card
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const nextIndex = (selectedSection.ctas ?? []).length;
                  onPatchSection(selectedSection.id, (s) => ({
                    ...s,
                    ctas: [...(s.ctas ?? []), blankCta()],
                  }));
                  onSelect({
                    kind: 'sectionCta',
                    sectionId: selectedSection.id,
                    ctaIndex: nextIndex,
                  });
                }}
              >
                Add button
              </button>
            </>
          ) : null}
        </>
      );
    }
  }

  return <p className="muted-sm">Select an element from the left tree or draft canvas.</p>;
}

function ChromeContextual({
  chrome,
  selection,
  canEdit,
  onChange,
}: {
  chrome: MarketingSiteChrome;
  selection: CmsSelection;
  canEdit: boolean;
  onChange: (updater: (prev: MarketingSiteChrome) => MarketingSiteChrome) => void;
}) {
  if (selection.kind === 'chromeBlurb') {
    return (
      <label>
        Product blurb
        <textarea
          rows={5}
          value={chrome.productBlurb}
          disabled={!canEdit}
          onChange={(e) => onChange((prev) => ({ ...prev, productBlurb: e.target.value }))}
        />
      </label>
    );
  }

  if (selection.kind === 'chromeNav') {
    return (
      <LinkListEditor
        title="Primary navigation"
        rows={chrome.nav}
        canEdit={canEdit}
        onChange={(nav) => onChange((prev) => ({ ...prev, nav }))}
      />
    );
  }

  if (selection.kind === 'chromeFooter') {
    if (selection.which === 'note') {
      return (
        <label>
          Footer note
          <textarea
            rows={3}
            value={chrome.footerNote}
            disabled={!canEdit}
            onChange={(e) => onChange((prev) => ({ ...prev, footerNote: e.target.value }))}
          />
        </label>
      );
    }
    const key = selection.which === 'company' ? 'footerCompany' : 'footerGetStarted';
    return (
      <LinkListEditor
        title={selection.which === 'company' ? 'Footer — company' : 'Footer — get started'}
        rows={chrome[key]}
        canEdit={canEdit}
        onChange={(rows) => onChange((prev) => ({ ...prev, [key]: rows }))}
      />
    );
  }

  return <p className="muted-sm">Select a chrome element.</p>;
}

function LinkListEditor({
  title,
  rows,
  canEdit,
  onChange,
}: {
  title: string;
  rows: Array<{ href: string; label: string }>;
  canEdit: boolean;
  onChange: (rows: Array<{ href: string; label: string }>) => void;
}) {
  return (
    <>
      <h4>{title}</h4>
      {rows.map((row, index) => (
        <div key={`${title}-${index}`} className="ow-cms-link-row">
          <label>
            Label
            <input
              value={row.label}
              disabled={!canEdit}
              onChange={(e) =>
                onChange(rows.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))
              }
            />
          </label>
          <label>
            Href
            <input
              value={row.href}
              disabled={!canEdit}
              onChange={(e) =>
                onChange(rows.map((r, i) => (i === index ? { ...r, href: e.target.value } : r)))
              }
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              className="secondary"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <button
          type="button"
          className="secondary"
          onClick={() => onChange([...rows, { label: 'New link', href: '/' }])}
        >
          Add link
        </button>
      ) : null}
    </>
  );
}

function CtaFields({
  label,
  cta,
  canEdit,
  onChange,
  onRemove,
}: {
  label: string;
  cta?: MarketingCta;
  canEdit: boolean;
  onChange: (cta: MarketingCta | undefined) => void;
  onRemove?: () => void;
}) {
  const value = cta ?? { label: '', href: '', variant: 'primary' as const };
  return (
    <fieldset className="ow-cms-cta" disabled={!canEdit}>
      <legend>{label}</legend>
      <label>
        Label
        <input
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </label>
      <label>
        Destination
        <input
          value={value.href}
          onChange={(e) => onChange({ ...value, href: e.target.value })}
        />
      </label>
      <label>
        Style
        <select
          value={value.variant ?? 'primary'}
          onChange={(e) =>
            onChange({
              ...value,
              variant: e.target.value as MarketingCta['variant'],
            })
          }
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="outline">Outline</option>
          <option value="ghost">Ghost</option>
          <option value="light">Light</option>
        </select>
      </label>
      {onRemove ? (
        <button type="button" className="secondary" onClick={onRemove}>
          Remove button
        </button>
      ) : null}
    </fieldset>
  );
}

function ImageField({
  label,
  url,
  alt,
  canEdit,
  canUpload,
  uploading,
  onUrlAlt,
  onUploadFile,
  onClear,
}: {
  label: string;
  url: string;
  alt: string;
  canEdit: boolean;
  canUpload: boolean;
  uploading: boolean;
  onUrlAlt: (url: string, alt: string) => void;
  onUploadFile: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <fieldset className="ow-cms-image" disabled={!canEdit}>
      <legend>{label}</legend>
      <label>
        URL
        <input value={url} onChange={(e) => onUrlAlt(e.target.value, alt)} />
      </label>
      <label>
        Alt text
        <input value={alt} onChange={(e) => onUrlAlt(url, e.target.value)} />
      </label>
      {canUpload ? (
        <label className="ow-cms-file">
          Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = '';
            }}
          />
        </label>
      ) : null}
      {url ? (
        <button type="button" className="secondary" onClick={onClear}>
          Remove image
        </button>
      ) : null}
      {url ? <img src={url} alt={alt || ''} className="ow-cms-image-preview" /> : null}
    </fieldset>
  );
}
