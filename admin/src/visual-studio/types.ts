/** OkangGroup Visual Studio — shared types for shell, selection, tools, adapters. */

export type StudioDock = 'left' | 'right' | 'bottom' | 'float';

export type StudioToolId =
  | 'select'
  | 'layers'
  | 'text'
  | 'image'
  | 'seo'
  | 'layout'
  | 'colour'
  | 'components'
  | 'responsive'
  | 'effects'
  | 'animation'
  | 'history'
  | 'preview'
  | 'publishing'
  | 'properties';

export type StudioPreset = 'content' | 'design' | 'advanced' | 'custom';

/** Owner-facing workspace modes (map onto presets + preview). */
export type StudioWorkspaceMode = 'content' | 'design' | 'preview';

export type StudioCapability =
  | 'edit'
  | 'draft'
  | 'preview'
  | 'publish'
  | 'rollback'
  | 'media'
  | 'typography'
  | 'colour'
  | 'layout'
  | 'components'
  | 'responsive'
  | 'effects'
  | 'animation'
  | 'seo'
  | 'history'
  | 'layers';

export type StudioTargetType =
  | 'page'
  | 'seo'
  | 'hero'
  | 'section'
  | 'card'
  | 'cta'
  | 'image'
  | 'text'
  | 'node'
  | 'chrome'
  | 'none';

export type StudioSelection = {
  adapterId: string;
  documentKey: string;
  targetType: StudioTargetType;
  targetId: string | null;
  path?: string[];
  label?: string;
};

export type StudioPanelState = {
  id: StudioToolId;
  open: boolean;
  dock: StudioDock;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type StudioWorkspaceLayout = {
  preset: StudioPreset;
  panels: StudioPanelState[];
  toolbar: { x: number; y: number; dock: StudioDock };
};

export type StudioLayerNode = {
  id: string;
  label: string;
  targetType: StudioTargetType;
  children?: StudioLayerNode[];
  hidden?: boolean;
  locked?: boolean;
};

export type StudioPatch =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'remove'; path: string[] };

export type StudioAdapterInfo = {
  id: string;
  label: string;
  capabilities: Partial<Record<StudioCapability, boolean>>;
};

export const EMPTY_SELECTION = (adapterId = '', documentKey = ''): StudioSelection => ({
  adapterId,
  documentKey,
  targetType: 'none',
  targetId: null,
});

/** Default open rails only. Extra tools stay in the bottom drawer until the Owner opens them. */
export const PRESET_TOOLS: Record<Exclude<StudioPreset, 'custom'>, StudioToolId[]> = {
  content: ['layers', 'properties'],
  design: ['layers', 'properties'],
  advanced: ['layers', 'properties'],
};

export const WORKSPACE_MODE_PRESET: Record<Exclude<StudioWorkspaceMode, 'preview'>, StudioPreset> = {
  content: 'content',
  design: 'design',
};
