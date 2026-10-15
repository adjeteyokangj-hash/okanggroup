import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyPreset,
  defaultWorkspaceLayout,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  setPanelOpen,
  workspaceStorageKey,
} from './panelManager';
import { FloatingToolbar, type StudioViewMode } from './FloatingToolbar';
import { toolIsAvailable } from './capabilityRegistry';
import type { StudioAdapterBridge } from './adapters/types';
import type {
  StudioCapability,
  StudioLayerNode,
  StudioPreset,
  StudioSelection,
  StudioToolId,
  StudioWorkspaceLayout,
} from './types';
import { WORKSPACE_MODE_PRESET } from './types';
import {
  AnimationTool,
  ColourTool,
  ComponentsTool,
  EffectsTool,
  HistoryTool,
  ImageTool,
  LayersTool,
  LayoutTool,
  PublishingTool,
  ResponsiveTool,
  SeoTool,
  TextTool,
  TOOL_TITLES,
} from './tools/StudioTools';

type Props = {
  userId?: string;
  instanceId: string;
  adapter: StudioAdapterBridge;
  selection: StudioSelection;
  onSelectionChange: (node: StudioLayerNode) => void;
  capabilities: Partial<Record<StudioCapability, boolean>>;
  canvas: ReactNode;
  properties?: ReactNode;
  textTool?: ReactNode;
  imageTool?: ReactNode;
  layoutTool?: ReactNode;
  colourTool?: ReactNode;
  effectsTool?: ReactNode;
  animationTool?: ReactNode;
  viewport: 'desktop' | 'tablet' | 'mobile';
  onViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;
  canEdit: boolean;
  canPublish: boolean;
  dirty?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onEnterPreview?: () => void | Promise<void>;
  onViewModeChange?: (mode: StudioViewMode) => void;
  onPublish?: () => void;
  onRollback?: () => void;
  onClearSelection?: () => void;
  connectionLabel?: string | null;
  connectionTone?: 'ok' | 'warn' | 'danger' | 'muted';
  notice?: string | null;
  alert?: string | null;
  onReconnect?: () => void;
  reconnectBusy?: boolean;
};

export function VisualStudioShell({
  userId,
  instanceId,
  adapter,
  selection,
  onSelectionChange,
  capabilities,
  canvas,
  properties,
  textTool,
  imageTool,
  layoutTool,
  colourTool,
  effectsTool,
  animationTool,
  viewport,
  onViewport,
  canEdit,
  canPublish,
  dirty = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSave,
  onEnterPreview,
  onViewModeChange,
  onPublish,
  onRollback,
  onClearSelection,
  connectionLabel,
  connectionTone = 'muted',
  notice,
  alert,
  onReconnect,
  reconnectBusy = false,
}: Props) {
  const storageKey = useMemo(() => workspaceStorageKey(userId, instanceId), [userId, instanceId]);
  const [layout, setLayout] = useState<StudioWorkspaceLayout>(() => loadWorkspaceLayout(storageKey));
  const [canvasFocus, setCanvasFocus] = useState(false);
  const [viewMode, setViewMode] = useState<StudioViewMode>('content');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const changeViewMode = useCallback(
    (mode: StudioViewMode) => {
      setViewMode(mode);
      if (mode === 'content' || mode === 'design') {
        const preset = WORKSPACE_MODE_PRESET[mode];
        setLayout((prev) => applyPreset(prev, preset));
      }
      setAdvancedOpen(mode === 'design');
      onViewModeChange?.(mode);
    },
    [onViewModeChange],
  );

  const enterPreviewMode = useCallback(async () => {
    await onEnterPreview?.();
    changeViewMode('preview');
  }, [changeViewMode, onEnterPreview]);

  useEffect(() => {
    setLayout(loadWorkspaceLayout(storageKey));
  }, [storageKey]);

  useEffect(() => {
    saveWorkspaceLayout(storageKey, layout);
  }, [storageKey, layout]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (viewMode === 'preview') changeViewMode('content');
        else if (canvasFocus) setCanvasFocus(false);
        else onClearSelection?.();
      }
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo?.();
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canEdit) onSave?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, canvasFocus, changeViewMode, onClearSelection, onRedo, onSave, onUndo, viewMode]);

  const toggleTool = useCallback((id: StudioToolId) => {
    setLayout((prev) => {
      const panel = prev.panels.find((p) => p.id === id);
      return setPanelOpen(prev, id, !panel?.open);
    });
  }, []);

  const layers = adapter.getLayers();
  const hideOverlays = canvasFocus || viewMode === 'preview';
  const editing = viewMode !== 'preview';

  function renderToolBody(id: StudioToolId): ReactNode {
    const available = toolIsAvailable(id, capabilities);
    switch (id) {
      case 'layers':
        return (
          <LayersTool layers={layers} selection={selection} onSelect={onSelectionChange} />
        );
      case 'text':
        return textTool ?? (
          <TextTool supported={available && adapter.supportsTarget('text')} selection={selection} />
        );
      case 'image':
        return imageTool ?? <ImageTool supported={available} selection={selection} />;
      case 'seo':
        return <SeoTool supported={available} />;
      case 'layout':
        return layoutTool ?? <LayoutTool supported={available && Boolean(capabilities.layout)} />;
      case 'colour':
        return colourTool ?? <ColourTool supported={available && Boolean(capabilities.colour)} />;
      case 'components':
        return <ComponentsTool supported={available && Boolean(capabilities.components)} />;
      case 'responsive':
        return <ResponsiveTool viewport={viewport} onViewport={onViewport} />;
      case 'effects':
        return effectsTool ?? <EffectsTool supported={available && Boolean(capabilities.effects)} />;
      case 'animation':
        return (
          animationTool ?? (
            <AnimationTool supported={available && Boolean(capabilities.animation)} />
          )
        );
      case 'history':
        return (
          <HistoryTool
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => onUndo?.()}
            onRedo={() => onRedo?.()}
          />
        );
      case 'publishing':
      case 'preview':
        return (
          <PublishingTool
            canEdit={canEdit}
            canPublish={canPublish}
            dirty={dirty}
            onSave={onSave}
            onPreview={() => {
              void enterPreviewMode();
            }}
            onPublish={onPublish}
            onRollback={onRollback}
          />
        );
      case 'properties':
        return (
          <div className="vs-tool vs-properties-host">
            {/* Portal mounts here for OpsWatch; optional properties for other adapters. */}
            <div id="vs-properties-root">
              {properties ?? (
                <p className="vs-tool-hint">
                  Select an element on the canvas or in Layers to inspect its properties.
                </p>
              )}
            </div>
          </div>
        );
      default:
        return <p className="vs-tool-hint">Select a tool</p>;
    }
  }

  const layersOpen =
    !hideOverlays && Boolean(layout.panels.find((p) => p.id === 'layers')?.open);
  const propertiesOpen =
    !hideOverlays && Boolean(layout.panels.find((p) => p.id === 'properties')?.open);
  const drawerPanels = hideOverlays
    ? []
    : layout.panels.filter(
        (p) => p.open && p.id !== 'layers' && p.id !== 'properties' && toolIsAvailable(p.id, capabilities),
      );

  return (
    <div
      className={`vs-workspace${layersOpen ? '' : ' is-layers-closed'}${propertiesOpen ? '' : ' is-properties-closed'}${canvasFocus ? ' is-canvas-focus' : ''}${viewMode === 'preview' ? ' is-preview-mode' : ''}`}
    >
      <header className="vs-command">
        <span className="vs-shell-adapter">{adapter.info.label}</span>
        <span className={`vs-conn-chip is-${connectionTone}`}>
          {connectionLabel || (viewMode === 'preview' ? 'Preview' : 'Connection unknown')}
        </span>
        <span className="vs-shell-selection">
          {selection.label || selection.targetType}
          {dirty ? ' · Unsaved draft' : ''}
        </span>
        <div className="vs-mode-toggle" role="group" aria-label="Workspace mode">
          <button type="button" className={viewMode === 'content' ? 'is-active' : ''} onClick={() => changeViewMode('content')}>
            Content
          </button>
          <button type="button" className={viewMode === 'design' ? 'is-active' : ''} onClick={() => changeViewMode('design')}>
            Design
          </button>
          <button type="button" className={viewMode === 'preview' ? 'is-active' : ''} onClick={() => void enterPreviewMode()}>
            Preview
          </button>
        </div>
        <div className="vs-responsive-row" role="group" aria-label="Canvas viewport">
          {(['desktop', 'tablet', 'mobile'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`vs-tool-action${viewport === v ? ' is-active' : ''}`}
              onClick={() => onViewport(v)}
            >
              {v}
            </button>
          ))}
        </div>
        {canEdit && onSave ? (
          <button type="button" className="vs-tool-action" onClick={onSave} disabled={!editing}>
            Save
          </button>
        ) : null}
        {canPublish && onPublish ? (
          <button type="button" className="vs-tool-action" onClick={onPublish}>
            Publish
          </button>
        ) : null}
        {canPublish && onRollback ? (
          <button type="button" className="vs-tool-action" onClick={onRollback}>
            Rollback
          </button>
        ) : null}
        {onReconnect ? (
          <button type="button" className="vs-tool-action" onClick={onReconnect} disabled={reconnectBusy}>
            {reconnectBusy ? 'Checking…' : 'Reconnect'}
          </button>
        ) : null}
        <button
          type="button"
          className={layersOpen ? 'vs-tool-action is-active' : 'vs-tool-action'}
          onClick={() => toggleTool('layers')}
          disabled={!editing}
          aria-pressed={layersOpen}
        >
          Layers
        </button>
        <button
          type="button"
          className={propertiesOpen ? 'vs-tool-action is-active' : 'vs-tool-action'}
          onClick={() => toggleTool('properties')}
          disabled={!editing}
          aria-pressed={propertiesOpen}
        >
          Properties
        </button>
        <button
          type="button"
          className={advancedOpen ? 'vs-tool-action is-active' : 'vs-tool-action'}
          onClick={() => setAdvancedOpen((v) => !v)}
          disabled={!editing}
          aria-pressed={advancedOpen}
        >
          Tools
        </button>
        <button
          type="button"
          className={canvasFocus ? 'vs-tool-action is-active' : 'vs-tool-action'}
          onClick={() => setCanvasFocus((v) => !v)}
          disabled={!editing}
        >
          {canvasFocus ? 'Show panels' : 'Expand'}
        </button>
      </header>

      {alert ? (
        <div className="vs-notice vs-notice-error" role="alert">
          <span>{alert}</span>
          {onReconnect ? (
            <button type="button" onClick={onReconnect} disabled={reconnectBusy}>
              {reconnectBusy ? 'Checking…' : 'Reconnect'}
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="vs-notice vs-notice-ok" role="status">
          {notice}
        </div>
      ) : null}

      <div className="vs-workspace-body">
        {layersOpen ? (
          <aside className="vs-rail vs-rail-left" aria-label="Layers">
            <div className="vs-rail-head">
              <strong>Layers</strong>
              <button type="button" className="secondary" onClick={() => toggleTool('layers')}>
                Hide
              </button>
            </div>
            {renderToolBody('layers')}
          </aside>
        ) : null}
        <div className="vs-canvas-stage">{canvas}</div>
        {propertiesOpen ? (
          <aside className="vs-rail vs-rail-right" aria-label="Properties">
            <div className="vs-rail-head">
              <strong>Properties</strong>
              <button type="button" className="secondary" onClick={() => toggleTool('properties')}>
                Hide
              </button>
            </div>
            {renderToolBody('properties')}
          </aside>
        ) : null}
      </div>

      {!hideOverlays && advancedOpen ? (
        <footer className="vs-advanced">
          <FloatingToolbar
            embedded
            layout={layout}
            capabilities={capabilities}
            viewMode={viewMode}
            onViewMode={(mode) => {
              if (mode === 'preview') void enterPreviewMode();
              else changeViewMode(mode);
            }}
            onToggleTool={toggleTool}
            onPreset={(preset: StudioPreset) =>
              setLayout((prev) =>
                preset === 'custom' ? { ...prev, preset } : applyPreset(prev, preset),
              )
            }
            onReset={() => {
              setLayout(defaultWorkspaceLayout('content'));
              setAdvancedOpen(false);
            }}
            onToolbarMove={() => undefined}
            canEdit={canEdit}
            canPublish={canPublish}
            onSave={onSave}
            onPublish={onPublish}
            onRollback={onRollback}
          />
          {drawerPanels.length ? (
            <div className="vs-advanced-panels">
              {drawerPanels.map((panel) => (
                <section key={panel.id} className="vs-advanced-card">
                  <header>
                    <strong>{TOOL_TITLES[panel.id]}</strong>
                    <button type="button" className="secondary" onClick={() => toggleTool(panel.id)}>
                      Close
                    </button>
                  </header>
                  {renderToolBody(panel.id)}
                </section>
              ))}
            </div>
          ) : (
            <p className="vs-advanced-hint">Open a tool to edit it here. The canvas stays clear.</p>
          )}
        </footer>
      ) : null}

      {viewMode === 'preview' ? (
        <button type="button" className="vs-preview-return" onClick={() => changeViewMode('content')}>
          Back to editing
        </button>
      ) : null}
    </div>
  );
}
