import type { BuilderNode, CmsBuilderDoc } from '../../lib/cmsBuilder/types';
import type { StudioLayerNode, StudioTargetType } from '../types';
import { capsFromFlags, type StudioAdapterBridge } from './types';

function nodeToLayer(node: BuilderNode): StudioLayerNode {
  return {
    id: node.id,
    label: node.name || node.type,
    targetType: 'node',
    hidden: node.hidden,
    locked: node.locked,
    children: (node.children ?? []).map(nodeToLayer),
  };
}

export function createNativeAdapter(doc: CmsBuilderDoc | null): StudioAdapterBridge {
  const supported: StudioTargetType[] = ['node', 'text', 'image', 'seo', 'page'];
  return {
    info: capsFromFlags('okang_native', 'OkangGroup native CMS', {
      edit: true,
      draft: true,
      preview: true,
      publish: true,
      rollback: true,
      media: true,
      typography: true,
      colour: true,
      layout: true,
      components: true,
      responsive: true,
      effects: true,
      animation: true,
      seo: true,
      history: true,
      layers: true,
    }),
    supportsTarget: (type) => supported.includes(type),
    toolsForSelection: (selection) => {
      switch (selection.targetType) {
        case 'image':
          return ['image', 'layout', 'colour', 'animation', 'properties'];
        case 'text':
          return ['text', 'layout', 'colour', 'effects', 'animation', 'properties'];
        case 'node':
          return ['text', 'layout', 'colour', 'effects', 'animation', 'properties'];
        case 'seo':
          return ['seo', 'properties'];
        default:
          return ['layers', 'properties'];
      }
    },
    getLayers: () => (doc?.tree ?? []).map(nodeToLayer),
  };
}
