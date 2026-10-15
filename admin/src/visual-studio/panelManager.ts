import type { StudioDock, StudioPanelState, StudioPreset, StudioToolId, StudioWorkspaceLayout } from './types';
import { PRESET_TOOLS } from './types';

const VIEW_W = typeof window !== 'undefined' ? () => window.innerWidth : () => 1280;
const VIEW_H = typeof window !== 'undefined' ? () => window.innerHeight : () => 800;

export function clampPanel(panel: StudioPanelState): StudioPanelState {
  const maxX = Math.max(0, VIEW_W() - 80);
  const maxY = Math.max(0, VIEW_H() - 80);
  return {
    ...panel,
    x: Math.min(maxX, Math.max(0, panel.x)),
    y: Math.min(maxY, Math.max(0, panel.y)),
    width: Math.min(640, Math.max(240, panel.width)),
    height: Math.min(720, Math.max(160, panel.height)),
  };
}

/** Bottom-centre toolbar anchor (x is centre point; CSS translates -50%). */
export function defaultToolbarPosition(): StudioWorkspaceLayout['toolbar'] {
  return {
    x: Math.round(VIEW_W() / 2),
    y: Math.max(96, VIEW_H() - 64),
    dock: 'float',
  };
}

/**
 * Keep the floating toolbar clear of left/right dock panels and near the bottom band.
 * x is the toolbar centre (CSS translateX(-50%)).
 */
export function clampToolbarPosition(
  toolbar: StudioWorkspaceLayout['toolbar'],
): StudioWorkspaceLayout['toolbar'] {
  const w = VIEW_W();
  const h = VIEW_H();
  const sideClearance = Math.min(320, Math.max(160, Math.round(w * 0.18)));
  const minX = sideClearance;
  const maxX = Math.max(minX, w - sideClearance);
  const minY = Math.max(120, Math.round(h * 0.55));
  const maxY = Math.max(minY, h - 48);
  return {
    dock: toolbar.dock ?? 'float',
    x: Math.min(maxX, Math.max(minX, toolbar.x || w / 2)),
    y: Math.min(maxY, Math.max(minY, toolbar.y || h - 64)),
  };
}

const SNAP_EDGE = 28;

/** Snap near screen edges while keeping the panel on-screen. */
export function snapPanelAfterDrag(panel: StudioPanelState): StudioPanelState {
  const w = VIEW_W();
  const h = VIEW_H();
  let { x, y, dock, width } = panel;
  if (x <= SNAP_EDGE) {
    dock = 'left';
    x = 12;
  } else if (x + width >= w - SNAP_EDGE) {
    dock = 'right';
    x = Math.max(12, w - width - 12);
  } else if (dock === 'left' || dock === 'right') {
    dock = 'float';
  }
  if (y <= SNAP_EDGE) y = 12;
  if (y + 40 >= h - SNAP_EDGE) y = Math.max(12, h - 52);
  return clampPanel({ ...panel, x, y, dock });
}

export function defaultPanel(id: StudioToolId, dock: StudioDock = 'right'): StudioPanelState {
  const base: StudioPanelState = {
    id,
    open: false,
    dock,
    minimized: false,
    x: 80,
    y: 120,
    width: 320,
    height: 420,
    zIndex: 10,
  };
  if (dock === 'left') {
    // Keep left docks clear of the canvas centre band.
    return { ...base, x: 12, y: 88, width: 260, height: Math.min(560, VIEW_H() - 160) };
  }
  if (dock === 'bottom') {
    return { ...base, x: 200, y: Math.max(200, VIEW_H() - 280), width: 480, height: 240 };
  }
  // Right docks sit outside the central editing band.
  return {
    ...base,
    x: Math.max(280, VIEW_W() - 332),
    y: 88,
    width: 300,
    height: Math.min(520, VIEW_H() - 160),
  };
}

export function defaultWorkspaceLayout(preset: StudioPreset = 'content'): StudioWorkspaceLayout {
  const openTools = preset === 'custom' ? PRESET_TOOLS.content : PRESET_TOOLS[preset];
  const all: StudioToolId[] = [
    'select',
    'layers',
    'text',
    'image',
    'seo',
    'layout',
    'colour',
    'components',
    'responsive',
    'effects',
    'animation',
    'history',
    'preview',
    'publishing',
    'properties',
  ];
  const panels = all.map((id, index) => {
    const dock: StudioDock =
      id === 'layers' ? 'left' : id === 'responsive' || id === 'history' ? 'bottom' : 'right';
    const panel = defaultPanel(id, dock);
    panel.open = openTools.includes(id);
    panel.zIndex = 10 + index;
    return clampPanel(panel);
  });
  return {
    preset,
    panels,
    toolbar: clampToolbarPosition(defaultToolbarPosition()),
  };
}

export function applyPreset(layout: StudioWorkspaceLayout, preset: StudioPreset): StudioWorkspaceLayout {
  if (preset === 'custom') return { ...layout, preset: 'custom' };
  const openTools = PRESET_TOOLS[preset];
  return {
    ...layout,
    preset,
    panels: layout.panels.map((p) => ({
      ...p,
      open: openTools.includes(p.id),
      minimized: false,
    })),
  };
}

export function setPanelOpen(
  layout: StudioWorkspaceLayout,
  id: StudioToolId,
  open: boolean,
): StudioWorkspaceLayout {
  const maxZ = Math.max(...layout.panels.map((p) => p.zIndex), 10);
  return {
    ...layout,
    preset: 'custom',
    panels: layout.panels.map((p) =>
      p.id === id ? clampPanel({ ...p, open, minimized: open ? false : p.minimized, zIndex: open ? maxZ + 1 : p.zIndex }) : p,
    ),
  };
}

export function updatePanel(
  layout: StudioWorkspaceLayout,
  id: StudioToolId,
  patch: Partial<StudioPanelState>,
): StudioWorkspaceLayout {
  return {
    ...layout,
    preset: 'custom',
    panels: layout.panels.map((p) => (p.id === id ? clampPanel({ ...p, ...patch }) : p)),
  };
}

export function bringToFront(layout: StudioWorkspaceLayout, id: StudioToolId): StudioWorkspaceLayout {
  const maxZ = Math.max(...layout.panels.map((p) => p.zIndex), 10);
  return {
    ...layout,
    panels: layout.panels.map((p) => (p.id === id ? { ...p, zIndex: maxZ + 1 } : p)),
  };
}

export function workspaceStorageKey(userId: string | undefined, instanceId: string) {
  // v7: docked rails. Discards saved floating panel positions that covered the canvas.
  return `okang.visualStudio.layout.v7.${userId ?? 'anon'}.${instanceId}`;
}

export function loadWorkspaceLayout(key: string): StudioWorkspaceLayout {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultWorkspaceLayout('content');
    const parsed = JSON.parse(raw) as StudioWorkspaceLayout;
    if (!parsed?.panels?.length) return defaultWorkspaceLayout('content');
    return {
      ...parsed,
      panels: parsed.panels.map(clampPanel),
      toolbar: clampToolbarPosition(parsed.toolbar ?? defaultToolbarPosition()),
    };
  } catch {
    return defaultWorkspaceLayout('content');
  }
}

export function saveWorkspaceLayout(key: string, layout: StudioWorkspaceLayout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}
