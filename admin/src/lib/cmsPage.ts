/** Visual page document model for OkangGroup-managed Client CMS. */

export type CmsSectionType =
  | 'hero'
  | 'text'
  | 'image'
  | 'gallery'
  | 'video'
  | 'audio'
  | 'cta'
  | 'banner'
  | 'cards'
  | 'grid'
  | 'columns'
  | 'faq'
  | 'accordion'
  | 'tabs'
  | 'slider'
  | 'testimonials'
  | 'services'
  | 'pricing'
  | 'team'
  | 'form'
  | 'map'
  | 'nav'
  | 'header'
  | 'footer'
  | 'social'
  | 'embed';

export type CmsSectionStyle = {
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  marginY?: 'none' | 'sm' | 'md' | 'lg';
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'pill';
  shadow?: 'none' | 'soft' | 'medium' | 'strong';
  align?: 'left' | 'center' | 'right';
  animation?: 'none' | 'fade' | 'slide' | 'rise';
  hover?: 'none' | 'lift' | 'glow' | 'underline';
  backgroundColor?: string;
  textColor?: string;
  headingSize?: 'sm' | 'md' | 'lg' | 'xl' | 'display';
  bodySize?: 'sm' | 'md' | 'lg';
  fontWeight?: '400' | '500' | '600' | '700';
  lineHeight?: 'tight' | 'normal' | 'relaxed';
  maxWidth?: 'full' | 'wide' | 'readable' | 'narrow';
  columns?: 2 | 3 | 4;
  fullBleed?: boolean;
};

export type CmsSection = {
  id: string;
  type: CmsSectionType;
  heading?: string;
  body?: string;
  buttonLabel?: string;
  buttonHref?: string;
  imagePath?: string | null;
  imageAlt?: string;
  locked?: boolean;
  hidden?: boolean;
  style?: CmsSectionStyle;
};

export type CmsPageBrand = {
  siteName?: string;
  /** Storage path in client-cms-media bucket */
  logoPath?: string | null;
  logoAlt?: string;
  /** App / favicon icon storage path */
  appIconPath?: string | null;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  fontFamily?: string;
  headingFont?: string;
  headingWeight?: string;
  lineHeight?: string;
  buttonRadius?: 'sm' | 'md' | 'lg' | 'pill';
};

export type CmsPageBody = {
  version: 1;
  brand: CmsPageBrand;
  sections: CmsSection[];
};

export function newSectionId() {
  return crypto.randomUUID();
}

/** Site chrome blocks stay fixed — not reordered on the canvas. */
export function isChromeSection(type: CmsSectionType) {
  return type === 'header' || type === 'footer' || type === 'nav';
}

/** Keep headers/nav at the top and footers at the bottom when inserting. */
export function insertSection(sections: CmsSection[], section: CmsSection): CmsSection[] {
  if (section.type === 'header' || section.type === 'nav') {
    const firstBody = sections.findIndex((s) => !isChromeSection(s.type) || s.type === 'footer');
    const at = firstBody < 0 ? sections.length : firstBody;
    const next = [...sections];
    next.splice(at, 0, section);
    return next;
  }
  if (section.type === 'footer') {
    return [...sections, section];
  }
  const footerAt = sections.findIndex((s) => s.type === 'footer');
  if (footerAt >= 0) {
    const next = [...sections];
    next.splice(footerAt, 0, section);
    return next;
  }
  return [...sections, section];
}

/** Reorder a movable section; header / nav / footer stay put. */
export function reorderSection(sections: CmsSection[], id: string, dir: -1 | 1): CmsSection[] | null {
  const from = sections.findIndex((s) => s.id === id);
  if (from < 0) return null;
  const item = sections[from];
  if (isChromeSection(item.type) || item.locked) return null;

  let to = from + dir;
  while (to >= 0 && to < sections.length && isChromeSection(sections[to].type)) {
    to += dir;
  }
  if (to < 0 || to >= sections.length) return null;
  if (isChromeSection(sections[to].type) || sections[to].locked) return null;

  const next = [...sections];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Drop a movable section before another; chrome targets are ignored. */
export function moveSectionBefore(
  sections: CmsSection[],
  dragId: string,
  beforeId: string,
): CmsSection[] | null {
  if (dragId === beforeId) return null;
  const from = sections.findIndex((s) => s.id === dragId);
  const before = sections.findIndex((s) => s.id === beforeId);
  if (from < 0 || before < 0) return null;
  const item = sections[from];
  if (isChromeSection(item.type) || item.locked) return null;
  if (isChromeSection(sections[before].type)) return null;

  const next = sections.filter((s) => s.id !== dragId);
  const insertAt = next.findIndex((s) => s.id === beforeId);
  if (insertAt < 0) return null;
  next.splice(insertAt, 0, item);
  return next;
}

export function defaultBrand(siteName?: string): CmsPageBrand {
  return {
    siteName: siteName ?? 'Website',
    logoPath: null,
    logoAlt: '',
    appIconPath: null,
    primaryColor: '#0b3d2e',
    accentColor: '#c4a35a',
    backgroundColor: '#f7f4ef',
    surfaceColor: '#ffffff',
    textColor: '#1a1a1a',
    fontFamily: '"Manrope", system-ui, sans-serif',
    headingFont: '"Syne", Georgia, serif',
    headingWeight: '700',
    lineHeight: '1.55',
    buttonRadius: 'md',
  };
}

export function emptyPage(siteName?: string): CmsPageBody {
  return {
    version: 1,
    brand: defaultBrand(siteName),
    sections: [
      {
        id: newSectionId(),
        type: 'hero',
        heading: 'Welcome',
        body: 'Introduce your organisation here.',
        buttonLabel: 'Get in touch',
        buttonHref: '#contact',
        style: { align: 'center', padding: 'xl', headingSize: 'display', animation: 'fade' },
      },
      {
        id: newSectionId(),
        type: 'text',
        heading: 'About',
        body: 'Tell visitors who you are and what you offer.',
        style: { padding: 'lg', maxWidth: 'readable', align: 'left' },
      },
    ],
  };
}

/** Accept legacy `{ content }` docs and new visual pages. */
export function normalizePageBody(raw: unknown, siteName?: string): CmsPageBody {
  if (!raw || typeof raw !== 'object') return emptyPage(siteName);
  const obj = raw as Record<string, unknown>;
  if (obj.version === 1 && Array.isArray(obj.sections)) {
    return {
      version: 1,
      brand: { ...defaultBrand(siteName), ...(obj.brand as CmsPageBrand | undefined) },
      sections: (obj.sections as CmsSection[]).map((s) => ({
        ...s,
        id: s.id || newSectionId(),
      })),
    };
  }
  const content = typeof obj.content === 'string' ? obj.content : '';
  const page = emptyPage(siteName);
  if (content.trim()) {
    page.sections = [
      {
        id: newSectionId(),
        type: 'text',
        heading: 'Content',
        body: content,
      },
    ];
  }
  return page;
}

export function createSection(type: CmsSectionType): CmsSection {
  const id = newSectionId();
  const baseStyle: CmsSectionStyle = { padding: 'lg', align: 'left', animation: 'none' };
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        heading: 'New hero',
        body: 'Supporting line that explains your offer.',
        buttonLabel: 'Learn more',
        buttonHref: '#',
        style: { ...baseStyle, align: 'center', padding: 'xl', headingSize: 'display' },
      };
    case 'image':
    case 'gallery':
    case 'video':
    case 'audio':
      return {
        id,
        type,
        heading: type[0].toUpperCase() + type.slice(1),
        imageAlt: '',
        imagePath: null,
        body: type === 'gallery' ? 'Image one\nImage two\nImage three' : '',
        style: baseStyle,
      };
    case 'cta':
      return {
        id,
        type,
        heading: 'Call to action',
        body: 'Invite visitors to take the next step.',
        buttonLabel: 'Contact us',
        buttonHref: '#',
        style: { ...baseStyle, align: 'center', backgroundColor: '' },
      };
    case 'banner':
      return { id, type, heading: 'Announcement', body: 'Short banner message.', style: { ...baseStyle, align: 'center', padding: 'md' } };
    case 'faq':
    case 'accordion':
      return {
        id,
        type,
        heading: type === 'faq' ? 'FAQs' : 'Accordion',
        body: 'Q: Example question?\nA: Example answer.\nQ: Another question?\nA: Another answer.',
        style: baseStyle,
      };
    case 'tabs':
      return {
        id,
        type,
        heading: 'Tabs',
        body: 'Overview: Introduce this topic.\nDetails: Add supporting detail.\nContact: How to reach you.',
        style: baseStyle,
      };
    case 'slider':
      return { id, type, heading: 'Slider', body: 'Slide one highlight\nSlide two highlight\nSlide three highlight', style: baseStyle };
    case 'testimonials':
      return {
        id,
        type,
        heading: 'What clients say',
        body: 'Outstanding service from start to finish. — Client name\nClear, reliable and professional. — Partner name',
        style: { ...baseStyle, columns: 2 },
      };
    case 'services':
    case 'cards':
    case 'grid':
    case 'columns':
      return {
        id,
        type,
        heading: type[0].toUpperCase() + type.slice(1),
        body: 'First item — short description\nSecond item — short description\nThird item — short description',
        style: { ...baseStyle, columns: 3, align: 'center' },
      };
    case 'pricing':
      return {
        id,
        type,
        heading: 'Pricing',
        body: 'Starter · £49/mo · Core features\nGrowth · £99/mo · Advanced tools\nScale · £199/mo · Full platform',
        style: { ...baseStyle, columns: 3, align: 'center' },
      };
    case 'team':
      return {
        id,
        type,
        heading: 'Our team',
        body: 'Alex Morgan — Director\nJordan Lee — Operations\nSam Rivera — Delivery',
        style: { ...baseStyle, columns: 3, align: 'center' },
      };
    case 'form':
      return {
        id,
        type,
        heading: 'Contact form',
        body: 'Name\nEmail\nMessage',
        buttonLabel: 'Send',
        buttonHref: '#',
        style: { ...baseStyle, maxWidth: 'narrow' },
      };
    case 'map':
      return { id, type, heading: 'Find us', body: '123 Example Street · City · Country', style: baseStyle };
    case 'nav':
    case 'header':
      return {
        id,
        type,
        heading: type === 'nav' ? 'Navigation' : 'Header',
        body: 'Home · About · Services · Contact',
        style: { ...baseStyle, padding: 'sm' },
      };
    case 'footer':
      return {
        id,
        type,
        heading: 'Footer',
        body: '© Your organisation · Privacy · Contact',
        style: { ...baseStyle, padding: 'md', align: 'center' },
      };
    case 'social':
      return {
        id,
        type,
        heading: 'Follow us',
        body: 'LinkedIn · X · Facebook · Instagram',
        style: { ...baseStyle, align: 'center' },
      };
    case 'embed':
      return {
        id,
        type,
        heading: 'Embedded content',
        body: 'https://example.com/embed',
        style: baseStyle,
      };
    default:
      return { id, type: 'text', heading: 'Section', body: 'Add your content.', style: baseStyle };
  }
}

export type ComponentCategory = 'layout' | 'content' | 'media' | 'convert' | 'structure';

export const COMPONENT_LIBRARY: {
  type: CmsSectionType;
  label: string;
  category: ComponentCategory;
  hint: string;
}[] = [
  { type: 'hero', label: 'Hero', category: 'layout', hint: 'Lead section' },
  { type: 'banner', label: 'Banner', category: 'layout', hint: 'Announcement' },
  { type: 'header', label: 'Header', category: 'structure', hint: 'Page header' },
  { type: 'nav', label: 'Navigation', category: 'structure', hint: 'Menu links' },
  { type: 'footer', label: 'Footer', category: 'structure', hint: 'Site footer' },
  { type: 'columns', label: 'Columns', category: 'layout', hint: 'Multi-column' },
  { type: 'grid', label: 'Grid', category: 'layout', hint: 'Responsive grid' },
  { type: 'cards', label: 'Cards', category: 'content', hint: 'Card group' },
  { type: 'text', label: 'Text', category: 'content', hint: 'Copy block' },
  { type: 'services', label: 'Services', category: 'content', hint: 'Offerings' },
  { type: 'team', label: 'Team', category: 'content', hint: 'People' },
  { type: 'testimonials', label: 'Testimonials', category: 'content', hint: 'Quotes' },
  { type: 'pricing', label: 'Pricing', category: 'convert', hint: 'Plans' },
  { type: 'faq', label: 'FAQ', category: 'content', hint: 'Q & A' },
  { type: 'accordion', label: 'Accordion', category: 'content', hint: 'Expandable' },
  { type: 'tabs', label: 'Tabs', category: 'content', hint: 'Tabbed content' },
  { type: 'slider', label: 'Slider', category: 'media', hint: 'Carousel' },
  { type: 'image', label: 'Image', category: 'media', hint: 'Single image' },
  { type: 'gallery', label: 'Gallery', category: 'media', hint: 'Image set' },
  { type: 'video', label: 'Video', category: 'media', hint: 'Video block' },
  { type: 'audio', label: 'Audio', category: 'media', hint: 'Audio block' },
  { type: 'map', label: 'Map', category: 'media', hint: 'Location' },
  { type: 'embed', label: 'Embed', category: 'media', hint: 'External embed' },
  { type: 'cta', label: 'Button / CTA', category: 'convert', hint: 'Call to action' },
  { type: 'form', label: 'Form', category: 'convert', hint: 'Lead form' },
  { type: 'social', label: 'Social', category: 'structure', hint: 'Social links' },
];

export function splitBodyLines(body?: string): string[] {
  return (body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseFaqPairs(body?: string): { q: string; a: string }[] {
  const lines = splitBodyLines(body);
  const pairs: { q: string; a: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].replace(/^Q:\s*/i, '');
    const aLine = lines[i + 1];
    if (aLine && /^A:/i.test(aLine)) {
      pairs.push({ q, a: aLine.replace(/^A:\s*/i, '') });
      i += 1;
    } else if (lines[i].includes('?')) {
      pairs.push({ q, a: aLine?.replace(/^A:\s*/i, '') ?? '' });
      if (aLine) i += 1;
    }
  }
  return pairs.length ? pairs : lines.map((l) => ({ q: l, a: '' }));
}

export function parseNamedItems(body?: string): { title: string; detail: string }[] {
  return splitBodyLines(body).map((line) => {
    const parts = line.split(/\s+[—–\-·|]\s+/);
    if (parts.length >= 2) return { title: parts[0], detail: parts.slice(1).join(' — ') };
    const spaced = line.split(/\s{2,}/);
    if (spaced.length >= 2) return { title: spaced[0], detail: spaced.slice(1).join(' ') };
    return { title: line, detail: '' };
  });
}
