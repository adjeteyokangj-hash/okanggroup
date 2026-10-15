import type { StudioCapability, StudioToolId } from './types';

export const TOOL_REQUIREMENTS: Record<StudioToolId, StudioCapability[]> = {
  select: [],
  layers: ['layers', 'edit'],
  text: ['typography', 'edit'],
  image: ['media', 'edit'],
  seo: ['seo', 'edit'],
  layout: ['layout', 'edit'],
  colour: ['colour', 'edit'],
  components: ['components', 'edit'],
  responsive: ['responsive'],
  effects: ['effects', 'edit'],
  animation: ['animation', 'edit'],
  history: ['history'],
  preview: ['preview'],
  publishing: ['draft'],
  properties: ['edit'],
};

export function toolIsAvailable(
  toolId: StudioToolId,
  caps: Partial<Record<StudioCapability, boolean>>,
): boolean {
  const needs = TOOL_REQUIREMENTS[toolId] ?? [];
  if (!needs.length) return true;
  return needs.every((cap) => Boolean(caps[cap]));
}

export function mergeCapabilities(
  connection: Partial<Record<string, boolean>> | null | undefined,
  live: Partial<Record<string, boolean>> | null | undefined,
  grants: { canEdit?: boolean; canPublish?: boolean } = {},
): Partial<Record<StudioCapability, boolean>> {
  const base = { ...(connection ?? {}), ...(live ?? {}) };
  const edit = grants.canEdit !== false && Boolean(base.edit ?? true);
  return {
    edit,
    draft: edit && Boolean(base.draft ?? true),
    preview: Boolean(base.preview ?? true),
    publish: Boolean(grants.canPublish) && Boolean(base.publish ?? false),
    rollback: Boolean(grants.canPublish) && Boolean(base.rollback ?? false),
    media: Boolean(base.media ?? false),
    typography: edit,
    colour: edit && Boolean(base.colour ?? false),
    layout: edit && Boolean(base.layout ?? true),
    components: edit && Boolean(base.components ?? true),
    responsive: true,
    effects: edit && Boolean(base.effects ?? false),
    animation: edit && Boolean(base.animation ?? false),
    seo: edit,
    history: Boolean(base.history ?? true),
    layers: edit,
  };
}
