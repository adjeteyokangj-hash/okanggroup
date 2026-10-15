import { useEffect, useState, type ReactNode } from 'react';
import type { StudioLayerNode, StudioSelection, StudioToolId } from '../types';

export const TOOL_TITLES: Record<StudioToolId, string> = {
  select: 'Select',
  layers: 'Layers',
  text: 'Text Editor',
  image: 'Image Studio',
  seo: 'SEO Studio',
  layout: 'Layout Studio',
  colour: 'Colour Studio',
  components: 'Components',
  responsive: 'Responsive Studio',
  effects: 'Effects Studio',
  animation: 'Animation Studio',
  history: 'History',
  preview: 'Preview',
  publishing: 'Publishing',
  properties: 'Properties',
};

function collectAncestorIds(
  nodes: StudioLayerNode[],
  targetId: string | null | undefined,
  trail: string[] = [],
): string[] | null {
  if (!targetId) return null;
  for (const node of nodes) {
    if (node.id === targetId) return trail;
    if (node.children?.length) {
      const found = collectAncestorIds(node.children, targetId, [...trail, node.id]);
      if (found) return found;
    }
  }
  return null;
}

export function LayersTool({
  layers,
  selection,
  onSelect,
}: {
  layers: StudioLayerNode[];
  selection: StudioSelection;
  onSelect: (node: StudioLayerNode) => void;
}) {
  /** Parent ids that are expanded. Groups start collapsed. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const ancestors = collectAncestorIds(layers, selection.targetId);
    if (!ancestors?.length) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ancestors) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [layers, selection.targetId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function renderNodes(nodes: StudioLayerNode[], depth = 0): ReactNode {
    return (
      <ul className="vs-layers-list" style={{ paddingLeft: depth ? 12 : 0 }}>
        {nodes.map((node) => {
          const hasChildren = Boolean(node.children?.length);
          const isOpen = Boolean(expanded[node.id]);
          return (
            <li key={node.id} className="vs-layer-row">
              <div className="vs-layer-item">
                {hasChildren ? (
                  <button
                    type="button"
                    className="vs-layer-twist"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Collapse ${node.label}` : `Expand ${node.label}`}
                    title={isOpen ? 'Collapse' : 'Expand'}
                    onClick={() => toggleExpand(node.id)}
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="vs-layer-twist is-spacer" aria-hidden />
                )}
                <button
                  type="button"
                  className={`vs-layer-label${selection.targetId === node.id ? ' is-active' : ''}`}
                  onClick={() => onSelect(node)}
                >
                  {node.label}
                  {node.locked ? ' · locked' : ''}
                  {node.hidden ? ' · hidden' : ''}
                </button>
              </div>
              {hasChildren && isOpen ? renderNodes(node.children!, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">Select an element to sync the canvas and properties.</p>
      {layers.length ? renderNodes(layers) : <p className="vs-tool-hint">No layers for this document.</p>}
    </div>
  );
}

export function CapabilityNotice({ supported, children }: { supported: boolean; children: ReactNode }) {
  if (!supported) {
    return (
      <p className="vs-tool-hint">
        This tool is not available for the current website adapter. Supported operations only are shown.
      </p>
    );
  }
  return <>{children}</>;
}

export function TextTool({ supported, selection }: { supported: boolean; selection: StudioSelection }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Typography for <strong>{selection.label || selection.targetType}</strong> is provided by the
          active website adapter. OpsWatch and native hosts inject live editors here.
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function ImageTool({ supported, selection }: { supported: boolean; selection: StudioSelection }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Image Studio for <strong>{selection.label || 'selection'}</strong>. Upload/replace lives in
          Properties when media capability is enabled.
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function SeoTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Choose <strong>Page settings (SEO)</strong> in Layers, then edit meta title and description
          in Properties. Those fields update the draft canvas workflow without publishing.
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function LayoutTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Layout Studio: grid/flex and spacing for native builder nodes. OpsWatch exposes tone and
          columns on section Properties only.
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function ColourTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Colour Studio requires an adapter that can persist fills and text colour (OpsWatch draft
          styles or native builder tokens).
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function ComponentsTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">
          Components: native block library, or OpsWatch Add section / Add feature card from Structure /
          Properties.
        </p>
      </div>
    </CapabilityNotice>
  );
}

export function ResponsiveTool({
  viewport,
  onViewport,
}: {
  viewport: 'desktop' | 'tablet' | 'mobile';
  onViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;
}) {
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">Preview viewport for the central canvas.</p>
      <div className="vs-responsive-row">
        {(['desktop', 'tablet', 'mobile'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={viewport === v ? 'is-active' : 'secondary'}
            onClick={() => onViewport(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EffectsTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">Shadows and hover effects for native builder interactions.</p>
      </div>
    </CapabilityNotice>
  );
}

export function AnimationTool({ supported }: { supported: boolean }) {
  return (
    <CapabilityNotice supported={supported}>
      <div className="vs-tool">
        <p className="vs-tool-hint">Entrance and scroll animations when the adapter exposes interactions.</p>
      </div>
    </CapabilityNotice>
  );
}

export function HistoryTool({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">Local undo/redo for this session. Publishing history stays in the host workflow.</p>
      <div className="vs-responsive-row">
        <button type="button" className="secondary" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="secondary" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
      </div>
    </div>
  );
}

export function PublishingTool({
  canEdit,
  canPublish,
  dirty,
  onSave,
  onPreview,
  onPublish,
  onRollback,
}: {
  canEdit: boolean;
  canPublish: boolean;
  dirty: boolean;
  onSave?: () => void;
  onPreview?: () => void;
  onPublish?: () => void;
  onRollback?: () => void;
}) {
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Draft isolation: Save draft never publishes. Publish and Rollback require permission and hit
        existing backend checks.
      </p>
      {dirty ? <p className="vs-tool-warn">Unsaved draft changes</p> : null}
      <div className="vs-responsive-row">
        {canEdit && onSave ? (
          <button type="button" onClick={onSave}>
            Save draft
          </button>
        ) : null}
        {canEdit && onPreview ? (
          <button type="button" className="secondary" onClick={onPreview}>
            Preview
          </button>
        ) : null}
        {canPublish && onPublish ? (
          <button type="button" onClick={onPublish}>
            Publish
          </button>
        ) : null}
        {canPublish && onRollback ? (
          <button type="button" className="secondary" onClick={onRollback}>
            Rollback
          </button>
        ) : null}
      </div>
    </div>
  );
}
