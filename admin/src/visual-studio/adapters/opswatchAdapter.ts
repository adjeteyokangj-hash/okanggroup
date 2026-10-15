import type { MarketingPageContent, MarketingSiteChrome } from '../../lib/opswatchMarketing';
import type { CmsSelection } from '../../lib/opswatchCmsSelection';
import type { StudioLayerNode, StudioSelection, StudioTargetType } from '../types';
import { capsFromFlags, type StudioAdapterBridge } from './types';

export function cmsSelectionToStudio(
  adapterId: string,
  documentKey: string,
  sel: CmsSelection,
): StudioSelection {
  switch (sel.kind) {
    case 'pageSettings':
      return { adapterId, documentKey, targetType: 'seo', targetId: 'page', label: 'Page settings' };
    case 'hero':
      return { adapterId, documentKey, targetType: 'hero', targetId: 'hero', label: 'Hero' };
    case 'heroImage':
      return { adapterId, documentKey, targetType: 'image', targetId: 'hero-image', label: 'Hero image' };
    case 'heroCta':
      return {
        adapterId,
        documentKey,
        targetType: 'cta',
        targetId: `hero-cta-${sel.which}`,
        label: sel.which === 'primary' ? 'Primary button' : 'Secondary button',
      };
    case 'section':
      return {
        adapterId,
        documentKey,
        targetType: 'section',
        targetId: sel.sectionId,
        label: 'Section',
      };
    case 'sectionImage':
      return {
        adapterId,
        documentKey,
        targetType: 'image',
        targetId: `section-image-${sel.sectionId}`,
        path: [sel.sectionId],
        label: 'Section image',
      };
    case 'sectionCta':
      return {
        adapterId,
        documentKey,
        targetType: 'cta',
        targetId: `section-cta-${sel.sectionId}-${sel.ctaIndex}`,
        path: [sel.sectionId],
        label: `Button ${sel.ctaIndex + 1}`,
      };
    case 'card':
      return {
        adapterId,
        documentKey,
        targetType: 'card',
        targetId: sel.cardId,
        path: [sel.sectionId, sel.cardId],
        label: 'Feature card',
      };
    case 'chromeBlurb':
    case 'chromeNav':
    case 'chromeFooter':
      return {
        adapterId,
        documentKey,
        targetType: 'chrome',
        targetId: sel.kind,
        label: 'Site chrome',
      };
  }
}

export function createOpsWatchAdapter(opts: {
  page: MarketingPageContent | null;
  chrome: MarketingSiteChrome | null;
  chromeMode: boolean;
}): StudioAdapterBridge {
  const supported: StudioTargetType[] = [
    'seo',
    'hero',
    'section',
    'card',
    'cta',
    'image',
    'text',
    'chrome',
    'page',
  ];

  return {
    info: capsFromFlags('opswatch_marketing', 'OpsWatch marketing', {
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
      animation: false,
      seo: true,
      history: true,
      layers: true,
    }),
    supportsTarget: (type) => supported.includes(type),
    toolsForSelection: (selection) => {
      switch (selection.targetType) {
        case 'seo':
          return ['seo', 'properties'];
        case 'image':
          return ['image', 'properties'];
        case 'card':
        case 'hero':
        case 'section':
        case 'text':
          return ['text', 'properties'];
        case 'cta':
          return ['text', 'components', 'properties'];
        default:
          return ['properties', 'layers'];
      }
    },
    getLayers: () => {
      if (opts.chromeMode && opts.chrome) {
        return [
          { id: 'chromeBlurb', label: 'Product blurb', targetType: 'chrome' },
          { id: 'chromeNav', label: 'Navigation', targetType: 'chrome' },
          { id: 'chromeFooter-company', label: 'Footer — company', targetType: 'chrome' },
          { id: 'chromeFooter-getStarted', label: 'Footer — get started', targetType: 'chrome' },
          { id: 'chromeFooter-note', label: 'Footer note', targetType: 'chrome' },
        ] satisfies StudioLayerNode[];
      }
      if (!opts.page) return [];
      const layers: StudioLayerNode[] = [
        { id: 'pageSettings', label: 'Page settings (SEO)', targetType: 'seo' },
        {
          id: 'hero',
          label: 'Hero',
          targetType: 'hero',
          children: [
            { id: 'heroImage', label: 'Hero image', targetType: 'image' },
            { id: 'heroCta-primary', label: 'Primary button', targetType: 'cta' },
            { id: 'heroCta-secondary', label: 'Secondary button', targetType: 'cta' },
          ],
        },
      ];
      for (const section of opts.page.sections) {
        layers.push({
          id: section.id,
          label: section.title || section.id,
          targetType: 'section',
          children: [
            ...(section.cards ?? []).map((card) => ({
              id: card.id,
              label: card.title || 'Untitled card',
              targetType: 'card' as const,
            })),
            ...(section.ctas ?? []).map((cta, i) => ({
              id: `${section.id}-cta-${i}`,
              label: cta.label || `Button ${i + 1}`,
              targetType: 'cta' as const,
            })),
            { id: `${section.id}-image`, label: 'Section image', targetType: 'image' as const },
          ],
        });
      }
      return layers;
    },
  };
}
