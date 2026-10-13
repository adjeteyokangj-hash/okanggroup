import {
  CmsPageBody,
  CmsSection,
  CmsSectionStyle,
  defaultBrand,
  normalizePageBody,
  parseFaqPairs,
  parseNamedItems,
  splitBodyLines,
} from '../cmsPage';
import {
  BuilderNode,
  BuilderNodeStyle,
  CmsBuilderDoc,
  defaultBreakpoints,
  defaultNavigation,
  defaultTokens,
  newNodeId,
} from './types';
import { normalizeNavigation, responsiveNavCss } from './responsiveNav';

function padFromSection(s?: CmsSectionStyle): string {
  switch (s?.padding) {
    case 'none':
      return '0';
    case 'sm':
      return '1rem 1.25rem';
    case 'md':
      return '1.5rem';
    case 'xl':
      return '3.25rem 2rem';
    case 'lg':
    default:
      return '2.1rem 1.75rem';
  }
}

function radiusFromSection(s?: CmsSectionStyle): string | undefined {
  switch (s?.borderRadius) {
    case 'sm':
      return '8px';
    case 'md':
      return '14px';
    case 'lg':
      return '22px';
    case 'pill':
      return '999px';
    default:
      return undefined;
  }
}

function shadowFromSection(s?: CmsSectionStyle): string | undefined {
  switch (s?.shadow) {
    case 'soft':
      return '0 8px 24px rgba(0,0,0,0.08)';
    case 'medium':
      return '0 14px 36px rgba(0,0,0,0.12)';
    case 'strong':
      return '0 22px 50px rgba(0,0,0,0.18)';
    default:
      return undefined;
  }
}

function sectionBaseStyle(section: CmsSection): BuilderNodeStyle {
  const s = section.style;
  return {
    display: 'flex',
    direction: 'column',
    gap: '0.85rem',
    align:
      s?.align === 'center' ? 'center' : s?.align === 'right' ? 'end' : 'stretch',
    justify: 'start',
    padding: padFromSection(s),
    backgroundColor: s?.backgroundColor || undefined,
    color: s?.textColor || undefined,
    borderRadius: radiusFromSection(s),
    boxShadow: shadowFromSection(s),
    textAlign: s?.align,
    maxWidth:
      s?.maxWidth === 'wide'
        ? '1100px'
        : s?.maxWidth === 'readable'
          ? '720px'
          : s?.maxWidth === 'narrow'
            ? '480px'
            : undefined,
    width: '100%',
  };
}

function textNode(text: string, role: 'title' | 'body', name: string, style?: BuilderNodeStyle): BuilderNode {
  return {
    id: newNodeId(),
    type: role === 'title' ? 'heading' : 'text',
    name,
    props: { text, role },
    style: {
      fontSize: role === 'title' ? '1.85rem' : '1rem',
      fontWeight: role === 'title' ? '700' : '400',
      ...style,
    },
  };
}

function buttonNode(label: string, href?: string): BuilderNode {
  return {
    id: newNodeId(),
    type: 'button',
    name: 'Button',
    props: { text: label, href: href || '#' },
    style: {
      backgroundColor: 'var(--cms-primary)',
      color: '#fff',
      padding: '0.7rem 1.2rem',
      borderRadius: '10px',
      fontWeight: '600',
      textAlign: 'center',
    },
  };
}

function cardFromItem(title: string, detail: string, cardColor?: string): BuilderNode {
  return {
    id: newNodeId(),
    type: 'card',
    name: title || 'Card',
    style: {
      display: 'flex',
      direction: 'column',
      gap: '0.45rem',
      padding: '1.1rem',
      borderRadius: '14px',
      cardColor: cardColor || undefined,
      backgroundColor: cardColor || undefined,
      boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
    },
    children: [
      textNode(title, 'title', 'Card title', { fontSize: '1.1rem' }),
      ...(detail ? [textNode(detail, 'body', 'Card body', { fontSize: '0.92rem', opacity: 0.85 })] : []),
    ],
  };
}

function migrateSection(section: CmsSection, cardSurface?: string): BuilderNode {
  const base: BuilderNode = {
    id: section.id || newNodeId(),
    type: 'frame',
    name: section.heading || section.type,
    style: sectionBaseStyle(section),
    locked: section.locked,
    hidden: section.hidden,
    children: [],
  };

  switch (section.type) {
    case 'header':
    case 'nav': {
      const links = splitBodyLines(section.body).join(' · ');
      return {
        ...base,
        type: section.type === 'header' ? 'header' : 'nav',
        chrome: true,
        style: {
          ...base.style,
          display: 'flex',
          direction: 'row',
          justify: 'between',
          align: 'center',
          backgroundColor: 'var(--cms-primary)',
          color: '#fff',
          padding: '0.95rem 1.35rem',
        },
        children: [
          textNode(section.heading || 'Site', 'title', 'Brand', { fontSize: '1.05rem', color: '#fff' }),
          textNode(links || 'Home · About · Contact', 'body', 'Links', { fontSize: '0.85rem', color: '#fff' }),
        ],
      };
    }
    case 'footer':
      return {
        ...base,
        type: 'footer',
        chrome: true,
        style: {
          ...base.style,
          textAlign: 'center',
          align: 'center',
          backgroundColor: section.style?.backgroundColor || 'rgba(0,0,0,0.04)',
        },
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Footer title', { fontSize: '1rem' })] : []),
          textNode(section.body || '', 'body', 'Footer copy'),
        ],
      };
    case 'hero':
    case 'cta':
    case 'banner':
      return {
        ...base,
        name: section.heading || 'Hero',
        children: [
          ...(section.imagePath
            ? [
                {
                  id: newNodeId(),
                  type: 'image' as const,
                  name: 'Hero image',
                  props: { imagePath: section.imagePath, imageAlt: section.imageAlt || '' },
                  style: { width: '100%', borderRadius: '12px', minHeight: '160px' },
                },
              ]
            : []),
          ...(section.heading ? [textNode(section.heading, 'title', 'Heading', { fontSize: 'clamp(2rem,4vw,3rem)' })] : []),
          ...(section.body ? [textNode(section.body, 'body', 'Body')] : []),
          ...(section.buttonLabel ? [buttonNode(section.buttonLabel, section.buttonHref)] : []),
        ],
      };
    case 'text':
    case 'embed':
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Heading')] : []),
          textNode(section.body || '', 'body', 'Body'),
        ],
      };
    case 'image':
      return {
        ...base,
        children: [
          {
            id: newNodeId(),
            type: 'image',
            name: 'Image',
            props: { imagePath: section.imagePath, imageAlt: section.imageAlt || section.heading || '' },
            style: { width: '100%', borderRadius: '12px', minHeight: '180px' },
          },
          ...(section.heading ? [textNode(section.heading, 'title', 'Caption title', { fontSize: '1.15rem' })] : []),
          ...(section.body ? [textNode(section.body, 'body', 'Caption')] : []),
        ],
      };
    case 'cards':
    case 'services':
    case 'grid':
    case 'columns':
    case 'team':
    case 'pricing': {
      const items = parseNamedItems(section.body);
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Section title')] : []),
          {
            id: newNodeId(),
            type: 'grid',
            name: 'Card grid',
            style: {
              display: 'grid',
              gridColumns: section.style?.columns ?? 3,
              gap: '1rem',
              width: '100%',
            },
            children: items.map((it) => cardFromItem(it.title, it.detail, cardSurface)),
          },
        ],
      };
    }
    case 'testimonials': {
      const items = parseNamedItems(section.body);
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Section title')] : []),
          {
            id: newNodeId(),
            type: 'grid',
            name: 'Quotes',
            style: { display: 'grid', gridColumns: 2, gap: '1rem', width: '100%' },
            children: items.map((it) =>
              cardFromItem(it.title, it.detail ? `“${it.detail}”` : `“${it.title}”`, cardSurface),
            ),
          },
        ],
      };
    }
    case 'faq':
    case 'accordion': {
      const pairs = parseFaqPairs(section.body);
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'FAQ title')] : []),
          {
            id: newNodeId(),
            type: 'stack',
            name: 'FAQ list',
            style: { display: 'flex', direction: 'column', gap: '0.65rem', width: '100%' },
            children: pairs.map((p) =>
              cardFromItem(p.q, p.a, cardSurface),
            ),
          },
        ],
      };
    }
    case 'form':
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Form title')] : []),
          {
            id: newNodeId(),
            type: 'form',
            name: 'Form',
            props: { text: section.body || 'Name\nEmail\nMessage' },
            style: { display: 'flex', direction: 'column', gap: '0.55rem', width: '100%' },
            children: splitBodyLines(section.body).map((field) => ({
              id: newNodeId(),
              type: 'text' as const,
              name: field,
              props: { text: field, role: 'label' as const },
              style: {
                padding: '0.65rem 0.8rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(0,0,0,0.04)',
                borderWidth: '1px',
                borderColor: 'rgba(0,0,0,0.08)',
              },
            })),
          },
          ...(section.buttonLabel ? [buttonNode(section.buttonLabel, section.buttonHref)] : []),
        ],
      };
    case 'map':
    case 'gallery':
    case 'video':
    case 'audio':
    case 'slider':
    case 'tabs':
    case 'social':
    default:
      return {
        ...base,
        children: [
          ...(section.heading ? [textNode(section.heading, 'title', 'Heading')] : []),
          textNode(section.body || section.type, 'body', 'Body'),
        ],
      };
  }
}

export function migrateV1ToV2(page: CmsPageBody): CmsBuilderDoc {
  const brand = { ...defaultBrand(), ...page.brand };
  const tokens = defaultTokens(brand);
  const doc: CmsBuilderDoc = {
    version: 2,
    brand,
    tokens,
    breakpoints: defaultBreakpoints(),
    navigation: defaultNavigation(),
    styles: [],
    tree: (page.sections ?? []).map((s) => migrateSection(s, tokens.cardSurface)),
    interactions: [],
  };
  doc.navigationCss = responsiveNavCss(doc);
  return doc;
}

export function emptyBuilderDoc(siteName?: string): CmsBuilderDoc {
  const brand = defaultBrand(siteName);
  const tokens = defaultTokens(brand);
  const hero: BuilderNode = {
    id: newNodeId(),
    type: 'frame',
    name: 'Welcome',
    style: {
      display: 'flex',
      direction: 'column',
      align: 'center',
      gap: '0.85rem',
      padding: '3.25rem 2rem',
      textAlign: 'center',
      width: '100%',
    },
    children: [
      textNode('Welcome', 'title', 'Heading', { fontSize: 'clamp(2rem,4vw,3rem)' }),
      textNode('Introduce your organisation here.', 'body', 'Body'),
      buttonNode('Get in touch', '#contact'),
    ],
  };
  const about: BuilderNode = {
    id: newNodeId(),
    type: 'frame',
    name: 'About',
    style: {
      display: 'flex',
      direction: 'column',
      gap: '0.75rem',
      padding: '2.1rem 1.75rem',
      maxWidth: '720px',
      width: '100%',
    },
    children: [
      textNode('About', 'title', 'Heading'),
      textNode('Tell visitors who you are and what you offer.', 'body', 'Body'),
    ],
  };
  const doc: CmsBuilderDoc = {
    version: 2,
    brand,
    tokens,
    breakpoints: defaultBreakpoints(),
    navigation: defaultNavigation(),
    styles: [],
    tree: [hero, about],
    interactions: [],
  };
  doc.navigationCss = responsiveNavCss(doc);
  return doc;
}

/** Normalize any stored body_json into a v2 builder document. */
export function normalizeBuilderDoc(raw: unknown, siteName?: string): CmsBuilderDoc {
  if (!raw || typeof raw !== 'object') return emptyBuilderDoc(siteName);
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2 && Array.isArray(obj.tree)) {
    const brand = { ...defaultBrand(siteName), ...(obj.brand as CmsBuilderDoc['brand']) };
    const doc: CmsBuilderDoc = {
      version: 2,
      brand,
      tokens: { ...defaultTokens(brand), ...((obj.tokens as CmsBuilderDoc['tokens']) ?? {}) },
      breakpoints: {
        ...defaultBreakpoints(),
        ...((obj.breakpoints as CmsBuilderDoc['breakpoints']) ?? {}),
      },
      navigation: normalizeNavigation(obj.navigation),
      styles: Array.isArray(obj.styles) ? (obj.styles as CmsBuilderDoc['styles']) : [],
      tree: obj.tree as BuilderNode[],
      interactions: Array.isArray(obj.interactions)
        ? (obj.interactions as CmsBuilderDoc['interactions'])
        : [],
    };
    doc.navigationCss = responsiveNavCss(doc);
    return doc;
  }
  const v1 = normalizePageBody(raw, siteName);
  return migrateV1ToV2(v1);
}

export function isBuilderDoc(raw: unknown): raw is CmsBuilderDoc {
  return Boolean(raw && typeof raw === 'object' && (raw as { version?: number }).version === 2);
}
