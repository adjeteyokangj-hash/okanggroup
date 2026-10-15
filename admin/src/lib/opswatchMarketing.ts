/** OpsWatch marketing CMS helpers — mirrors OpsWatch content/marketing types (no billing fields). */

import seedFile from './opswatchMarketingSeed.json' with { type: 'json' };
import { asVisualStyle, type MarketingVisualStyle } from './marketingVisualStyle';

export type { MarketingVisualStyle };

export const HOME_REQUIRED_SECTION_IDS = [
  'capabilities',
  'monitoring',
  'intelligence',
  'recovery',
  'integrations',
  'pricing',
  'cta',
] as const;

export type MarketingCta = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'light';
  style?: MarketingVisualStyle;
};

export type MarketingImage = {
  url: string;
  alt: string;
  storagePath?: string;
  style?: MarketingVisualStyle;
};

export type MarketingCard = {
  id: string;
  title: string;
  body: string;
  state?: string;
  href?: string;
  icon?: string;
  style?: MarketingVisualStyle;
};

export type MarketingSection = {
  id: string;
  cmsKey: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  tone?: 'default' | 'band' | 'soft';
  columns?: 2 | 3;
  cards?: MarketingCard[];
  ctas?: MarketingCta[];
  note?: string;
  image?: MarketingImage;
  style?: MarketingVisualStyle;
};

export type MarketingPageContent = {
  slug: string;
  cmsKey: string;
  metaTitle: string;
  metaDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta?: MarketingCta;
    secondaryCta?: MarketingCta;
    showCommandCenterPreview?: boolean;
    pills?: string[];
    image?: MarketingImage;
    style?: MarketingVisualStyle;
  };
  sections: MarketingSection[];
};

function asCta(raw: unknown): MarketingCta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  return {
    label: String(c.label ?? ''),
    href: String(c.href ?? '/'),
    variant: c.variant as MarketingCta['variant'],
    style: asVisualStyle(c.style),
  };
}

function asImage(raw: unknown): MarketingImage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const img = raw as Record<string, unknown>;
  return {
    url: String(img.url ?? ''),
    alt: String(img.alt ?? ''),
    storagePath: typeof img.storagePath === 'string' ? img.storagePath : undefined,
    style: asVisualStyle(img.style),
  };
}

function asCard(raw: unknown): MarketingCard {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(c.id ?? `card-${Date.now()}`),
    title: String(c.title ?? ''),
    body: String(c.body ?? ''),
    state: typeof c.state === 'string' ? c.state : undefined,
    href: typeof c.href === 'string' ? c.href : undefined,
    icon: typeof c.icon === 'string' ? c.icon : undefined,
    style: asVisualStyle(c.style),
  };
}

function asSection(raw: unknown): MarketingSection {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(s.id ?? `section-${Date.now()}`),
    cmsKey: String(s.cmsKey ?? ''),
    eyebrow: typeof s.eyebrow === 'string' ? s.eyebrow : undefined,
    title: typeof s.title === 'string' ? s.title : undefined,
    body: typeof s.body === 'string' ? s.body : undefined,
    tone: s.tone === 'band' || s.tone === 'soft' || s.tone === 'default' ? s.tone : 'default',
    columns: s.columns === 2 || s.columns === 3 ? s.columns : 3,
    cards: Array.isArray(s.cards) ? s.cards.map(asCard) : [],
    ctas: Array.isArray(s.ctas) ? s.ctas.map((c) => asCta(c)!).filter(Boolean) : [],
    note: typeof s.note === 'string' ? s.note : undefined,
    image: asImage(s.image),
    style: asVisualStyle(s.style),
  };
}

export type MarketingSiteChrome = {
  cmsKey: string;
  productBlurb: string;
  footerNote: string;
  nav: Array<{ href: string; label: string }>;
  footerCompany: Array<{ href: string; label: string }>;
  footerGetStarted: Array<{ href: string; label: string }>;
};

export const CHROME_MODULE = 'opswatch.site.chrome';

export function isChromeModule(code: string) {
  return code === CHROME_MODULE;
}

export function isHomeModule(code: string) {
  return code === 'opswatch.page.home';
}

export function blankCta(): MarketingCta {
  return { label: 'Learn more', href: '/', variant: 'primary' };
}

export function blankCard(_moduleCode: string, index: number): MarketingCard {
  return {
    id: `card-${Date.now()}-${index}`,
    title: 'New card',
    body: 'Describe this capability.',
  };
}

export function blankSection(moduleCode: string, index: number): MarketingSection {
  const id = `section-${Date.now()}-${index}`;
  return {
    id,
    cmsKey: `${moduleCode}.${id}`,
    title: 'New section',
    body: 'Add supporting copy for this section.',
    tone: 'default',
    columns: 3,
    cards: [],
    ctas: [],
  };
}

export function asPage(content: Record<string, unknown> | null, moduleCode: string): MarketingPageContent {
  const slug = moduleCode.replace(/^opswatch\.page\./, '') || 'page';
  const heroIn = (content?.hero as Record<string, unknown> | undefined) ?? {};
  return {
    slug: String(content?.slug ?? slug),
    cmsKey: String(content?.cmsKey ?? moduleCode),
    metaTitle: String(content?.metaTitle ?? ''),
    metaDescription: String(content?.metaDescription ?? ''),
    hero: {
      eyebrow: String(heroIn.eyebrow ?? ''),
      title: String(heroIn.title ?? ''),
      subtitle: String(heroIn.subtitle ?? ''),
      primaryCta: asCta(heroIn.primaryCta),
      secondaryCta: asCta(heroIn.secondaryCta),
      showCommandCenterPreview: Boolean(heroIn.showCommandCenterPreview),
      pills: Array.isArray(heroIn.pills) ? (heroIn.pills as string[]) : [],
      image: asImage(heroIn.image),
      style: asVisualStyle(heroIn.style),
    },
    sections: Array.isArray(content?.sections) ? content!.sections.map(asSection) : [],
  };
}

export function asChrome(content: Record<string, unknown> | null): MarketingSiteChrome {
  return {
    cmsKey: CHROME_MODULE,
    productBlurb: String(content?.productBlurb ?? ''),
    footerNote: String(content?.footerNote ?? ''),
    nav: Array.isArray(content?.nav) ? (content!.nav as MarketingSiteChrome['nav']) : [],
    footerCompany: Array.isArray(content?.footerCompany)
      ? (content!.footerCompany as MarketingSiteChrome['footerCompany'])
      : [],
    footerGetStarted: Array.isArray(content?.footerGetStarted)
      ? (content!.footerGetStarted as MarketingSiteChrome['footerGetStarted'])
      : [],
  };
}

export function canRemoveSection(moduleCode: string, sectionId: string) {
  if (!isHomeModule(moduleCode)) return true;
  return !(HOME_REQUIRED_SECTION_IDS as readonly string[]).includes(sectionId);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type MarketingSeedFile = {
  chrome: MarketingSiteChrome;
  pages: Record<string, MarketingPageContent>;
};

const marketingSeed = seedFile as MarketingSeedFile;

/** Website seed for a module. The public site uses this when the CMS document is empty. */
export function seedPageForModule(moduleCode: string): MarketingPageContent | null {
  const page = Object.values(marketingSeed.pages).find((entry) => entry.cmsKey === moduleCode);
  return page ? structuredClone(page) : null;
}

export function seedChrome(): MarketingSiteChrome {
  return structuredClone(marketingSeed.chrome);
}

function mergeHero(
  base: MarketingPageContent['hero'],
  cmsHero: Record<string, unknown> | null,
): MarketingPageContent['hero'] {
  if (!cmsHero) return base;
  const next = { ...base };
  if (typeof cmsHero.eyebrow === 'string') next.eyebrow = cmsHero.eyebrow;
  if (typeof cmsHero.title === 'string') next.title = cmsHero.title;
  if (typeof cmsHero.subtitle === 'string') next.subtitle = cmsHero.subtitle;
  if ('primaryCta' in cmsHero) next.primaryCta = asCta(cmsHero.primaryCta) ?? base.primaryCta;
  if ('secondaryCta' in cmsHero) next.secondaryCta = asCta(cmsHero.secondaryCta) ?? base.secondaryCta;
  if ('showCommandCenterPreview' in cmsHero) {
    next.showCommandCenterPreview = Boolean(cmsHero.showCommandCenterPreview);
  }
  if (Array.isArray(cmsHero.pills)) next.pills = cmsHero.pills.map((pill) => String(pill));
  if ('image' in cmsHero) next.image = asImage(cmsHero.image) ?? base.image;
  if ('style' in cmsHero) next.style = asVisualStyle(cmsHero.style) ?? base.style;
  return next;
}

/**
 * Same overlay rules as the OpsWatch site: CMS fields replace seed fields,
 * and omitted fields keep the website copy. An empty module shows the real page.
 */
export function mergeCmsPage(
  moduleCode: string,
  cms: Record<string, unknown> | null,
): MarketingPageContent {
  const base = seedPageForModule(moduleCode) ?? asPage(null, moduleCode);
  if (!cms) return base;
  const cmsHero =
    cms.hero && typeof cms.hero === 'object' ? (cms.hero as Record<string, unknown>) : null;
  const cmsSections = Array.isArray(cms.sections) ? cms.sections.map(asSection) : null;
  let sections = base.sections;
  if (cmsSections) {
    const byId = new Map(base.sections.map((section) => [section.id, section]));
    for (const section of cmsSections) {
      if (section.id) byId.set(section.id, section);
    }
    const extras = cmsSections.filter((section) => !base.sections.some((seed) => seed.id === section.id));
    sections =
      base.sections.length > 0
        ? [...base.sections.map((section) => byId.get(section.id) ?? section), ...extras]
        : cmsSections;
  }
  return {
    ...base,
    slug: typeof cms.slug === 'string' ? cms.slug : base.slug,
    cmsKey: typeof cms.cmsKey === 'string' ? cms.cmsKey : base.cmsKey,
    metaTitle: typeof cms.metaTitle === 'string' ? cms.metaTitle : base.metaTitle,
    metaDescription: typeof cms.metaDescription === 'string' ? cms.metaDescription : base.metaDescription,
    hero: mergeHero(base.hero, cmsHero),
    sections,
  };
}

export function mergeCmsChrome(cms: Record<string, unknown> | null): MarketingSiteChrome {
  const base = seedChrome();
  if (!cms) return base;
  return asChrome({ ...base, ...cms });
}
