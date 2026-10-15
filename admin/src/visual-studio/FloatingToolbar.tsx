import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { StudioCapability, StudioPreset, StudioToolId, StudioWorkspaceLayout } from './types';
import { toolIsAvailable } from './capabilityRegistry';

/** Content = quick copy/media; Design = full visual tools; Preview = site without chrome. */
export type StudioViewMode = 'content' | 'design' | 'preview';

type ToolMeta = { id: StudioToolId; label: string; icon: string; tip: string };

const TOOL_GROUPS: Array<{ id: string; label: string; tools: ToolMeta[] }> = [
  {
    id: 'structure',
    label: 'Structure',
    tools: [
      { id: 'layers', label: 'Layers', icon: '⧉', tip: 'Layers — page structure and selection' },
      {
        id: 'properties',
        label: 'Props',
        icon: '▥',
        tip: 'Properties — settings for the selected element',
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    tools: [
      { id: 'text', label: 'Text', icon: 'T', tip: 'Text — edit titles and body copy' },
      { id: 'image', label: 'Image', icon: '▭', tip: 'Image — media for the selected image' },
      { id: 'seo', label: 'SEO', icon: '⌕', tip: 'SEO — page title and meta description' },
    ],
  },
  {
    id: 'design',
    label: 'Design',
    tools: [
      { id: 'layout', label: 'Layout', icon: '▦', tip: 'Layout — section tone and columns' },
      {
        id: 'colour',
        label: 'Colour',
        icon: '◐',
        tip: 'Colour — backgrounds and fills (when supported)',
      },
      {
        id: 'components',
        label: 'Blocks',
        icon: '▣',
        tip: 'Components — add sections, cards and buttons',
      },
      {
        id: 'responsive',
        label: 'View',
        icon: '▢',
        tip: 'Responsive — desktop, tablet and mobile viewport',
      },
      {
        id: 'effects',
        label: 'Effects',
        icon: '✧',
        tip: 'Effects — shadows and hover (when supported)',
      },
      {
        id: 'animation',
        label: 'Motion',
        icon: '▶',
        tip: 'Animation — motion (when supported)',
      },
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    tools: [
      { id: 'history', label: 'History', icon: '↺', tip: 'History — undo and redo' },
      {
        id: 'publishing',
        label: 'Publish',
        icon: '↑',
        tip: 'Publishing — save, preview, publish and rollback',
      },
    ],
  },
];

type Props = {
  layout: StudioWorkspaceLayout;
  capabilities: Partial<Record<StudioCapability, boolean>>;
  viewMode: StudioViewMode;
  onViewMode: (mode: StudioViewMode) => void;
  onToggleTool: (id: StudioToolId) => void;
  onPreset: (preset: StudioPreset) => void;
  onReset: () => void;
  onToolbarMove: (x: number, y: number) => void;
  onSave?: () => void;
  canEdit?: boolean;
  canPublish?: boolean;
  onPublish?: () => void;
  onRollback?: () => void;
  /** In-flow advanced tools. Save and preview stay in the top command bar. */
  embedded?: boolean;
};

export function FloatingToolbar({
  layout,
  capabilities,
  viewMode,
  onViewMode,
  onToggleTool,
  onPreset,
  onReset,
  onToolbarMove,
  onSave,
  canEdit,
  canPublish,
  onPublish,
  onRollback,
  embedded = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  function onDragStart(e: ReactMouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = layout.toolbar.x;
    const originY = layout.toolbar.y;
    function move(ev: MouseEvent) {
      onToolbarMove(originX + (ev.clientX - startX), originY + (ev.clientY - startY));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  const style = embedded ? undefined : { left: layout.toolbar.x, top: layout.toolbar.y };

  if (collapsed && !embedded) {
    return (
      <button
        type="button"
        className="vs-toolbar-fab"
        style={style}
        onMouseDown={onDragStart}
        onClick={() => setCollapsed(false)}
        title="Restore Visual Studio toolbar"
      >
        VS
      </button>
    );
  }

  return (
    <div
      className={embedded ? 'vs-embedded-toolbar' : 'vs-floating-toolbar'}
      style={style}
      role="toolbar"
      aria-label="Visual Studio tools"
    >
      {embedded ? null : (
      <button
        type="button"
        className="vs-toolbar-grip"
        onMouseDown={onDragStart}
        title="Drag toolbar"
        aria-label="Drag toolbar"
      >
        ⋮⋮
      </button>
      )}
      {embedded ? null : (
      <div className="vs-mode-toggle" role="group" aria-label="Workspace mode">
        <button
          type="button"
          className={viewMode === 'content' ? 'is-active' : ''}
          title="Content — quickly edit text, images, buttons and sections"
          onClick={() => onViewMode('content')}
        >
          Content
        </button>
        <button
          type="button"
          className={viewMode === 'design' ? 'is-active' : ''}
          title="Design — typography, colour, layout and effects"
          onClick={() => onViewMode('design')}
        >
          Design
        </button>
        <button
          type="button"
          className={viewMode === 'preview' ? 'is-active' : ''}
          title="Preview — website without editing controls"
          onClick={() => onViewMode('preview')}
        >
          Preview
        </button>
      </div>
      )}
      <select
        className="vs-toolbar-preset"
        aria-label="Workspace preset"
        title="Workspace preset"
        value={layout.preset}
        onChange={(e) => onPreset(e.target.value as StudioPreset)}
      >
        <option value="content">Content</option>
        <option value="design">Design</option>
        <option value="advanced">Advanced</option>
        <option value="custom">Custom</option>
      </select>

      {TOOL_GROUPS.map((group) => (
        <div key={group.id} className="vs-toolbar-group" role="group" aria-label={group.label}>
          <span className="vs-toolbar-group-label">{group.label}</span>
          <span className="vs-toolbar-sep" aria-hidden />
          {group.tools.map((tool) => {
            const available = toolIsAvailable(tool.id, capabilities);
            const panel = layout.panels.find((p) => p.id === tool.id);
            const active = Boolean(panel?.open && !panel.minimized);
            return (
              <button
                key={tool.id}
                type="button"
                className={`vs-tool-icon vs-tool-labeled${active ? ' is-active' : ''}${!available ? ' is-disabled' : ''}`}
                onClick={() => available && onToggleTool(tool.id)}
                title={
                  available
                    ? tool.tip
                    : `${tool.label} — not supported on this website (disabled)`
                }
                aria-label={tool.label}
                aria-pressed={active}
                disabled={!available}
              >
                <span className="vs-tool-glyph" aria-hidden>
                  {tool.icon}
                </span>
                <span className="vs-tool-caption">{tool.label}</span>
              </button>
            );
          })}
        </div>
      ))}

      {embedded ? null : <span className="vs-toolbar-sep" aria-hidden />}
      {!embedded && canEdit && onSave ? (
        <button type="button" className="vs-tool-action" onClick={onSave} title="Save draft (does not publish)">
          Save
        </button>
      ) : null}
      {!embedded && canPublish && onPublish ? (
        <button type="button" className="vs-tool-action" onClick={onPublish} title="Publish to public site">
          Publish
        </button>
      ) : null}
      {!embedded && canPublish && onRollback ? (
        <button type="button" className="vs-tool-action" onClick={onRollback} title="Rollback published revision">
          Rollback
        </button>
      ) : null}
      <button type="button" className="vs-tool-action" onClick={onReset} title="Reset workspace layout">
        Reset
      </button>
      {embedded ? null : (
      <button
        type="button"
        className="vs-tool-action"
        onClick={() => setCollapsed(true)}
        title="Collapse toolbar to a small button"
      >
        –
      </button>
      )}
    </div>
  );
}
