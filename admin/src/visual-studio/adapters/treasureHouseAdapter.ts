import type { StudioLayerNode, StudioTargetType } from '../types';
import { capsFromFlags, type StudioAdapterBridge } from './types';

type ThAdapterOptions = {
  media?: boolean;
};

/**
 * Treasure House staging / shadow Visual Studio adapter.
 * Layers are supplied by the host (modules → pages → fields).
 */
export function createTreasureHouseAdapter(
  layersOrLabels: StudioLayerNode[] | Array<{ id: string; label: string }> = [],
  options: ThAdapterOptions = {},
): StudioAdapterBridge {
  const layers: StudioLayerNode[] = layersOrLabels.map((m) =>
    'targetType' in m
      ? (m as StudioLayerNode)
      : { id: m.id, label: m.label, targetType: 'section' as const },
  );
  const supported: StudioTargetType[] = ['section', 'page', 'text', 'image', 'seo'];
  const media = Boolean(options.media);

  return {
    info: capsFromFlags('treasure_house_staging', 'Treasure House (staging/shadow)', {
      edit: true,
      draft: true,
      preview: true,
      publish: true,
      rollback: true,
      media,
      typography: true,
      colour: false,
      layout: false,
      components: false,
      responsive: true,
      effects: false,
      animation: false,
      seo: true,
      history: true,
      layers: true,
    }),
    supportsTarget: (type) => supported.includes(type),
    toolsForSelection: (selection) => {
      if (selection.targetType === 'seo') return ['seo', 'properties'];
      if (selection.targetType === 'image') return ['image', 'properties', 'layers'];
      if (selection.targetType === 'text') return ['text', 'properties', 'layers'];
      if (selection.targetType === 'page') return ['text', 'image', 'properties', 'layers'];
      return media ? ['layers', 'text', 'image', 'properties'] : ['layers', 'text', 'properties'];
    },
    getLayers: () => layers,
  };
}
