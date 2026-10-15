import type { CmsPageBrand } from '../cmsPage';

export type BuilderNodeType =
  | 'frame'
  | 'stack'
  | 'grid'
  | 'text'
  | 'heading'
  | 'image'
  | 'button'
  | 'card'
  | 'form'
  | 'embed'
  | 'nav'
  | 'header'
  | 'footer'
  | 'spacer';

export type BuilderDisplay = 'block' | 'flex' | 'grid';
export type BuilderDirection = 'row' | 'column';
export type BuilderAlign = 'start' | 'center' | 'end' | 'stretch';
export type BuilderJustify = 'start' | 'center' | 'end' | 'between' | 'around';

export type BuilderNodeStyle = {
  display?: BuilderDisplay;
  direction?: BuilderDirection;
  wrap?: boolean;
  gap?: string;
  align?: BuilderAlign;
  justify?: BuilderJustify;
  gridColumns?: number;
  padding?: string;
  margin?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  backgroundColor?: string;
  /** Card / surface fill (distinct from section/page background) */
  cardColor?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: string;
  borderRadius?: string;
  boxShadow?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  opacity?: number;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  objectPosition?: string;
};

export type BuilderNodeProps = {
  text?: string;
  href?: string;
  imagePath?: string | null;
  imageAlt?: string;
  placeholder?: string;
  role?: 'title' | 'body' | 'caption' | 'label';
};

export type BuilderNode = {
  id: string;
  type: BuilderNodeType;
  name: string;
  props?: BuilderNodeProps;
  style?: BuilderNodeStyle;
  children?: BuilderNode[];
  locked?: boolean;
  hidden?: boolean;
  /** Site chrome — cannot be freely reordered out of zone */
  chrome?: boolean;
};

export type BuilderTokens = {
  pageBackground?: string;
  surface?: string;
  cardSurface?: string;
  text?: string;
  primary?: string;
  accent?: string;
};

export type BuilderClassDef = {
  id: string;
  name: string;
  style: BuilderNodeStyle;
};

export type BuilderInteraction = {
  id: string;
  trigger: 'hover' | 'click' | 'scroll';
  targetId: string;
  action: 'fade' | 'lift' | 'underline';
};

export type BuilderNavLink = {
  label: string;
  href: string;
};

/** Site navigation — hamburger on small screens; stored in body_json for publish. */
export type BuilderNavigation = {
  links: BuilderNavLink[];
  mobileMenu: 'hamburger';
  /** Collapse horizontal links at this breakpoint and below */
  collapseAt: 'mobile' | 'tablet';
};

export type CmsBuilderDoc = {
  version: 2;
  brand: CmsPageBrand;
  tokens: BuilderTokens;
  breakpoints: { desktop: number; tablet: number; mobile: number };
  navigation: BuilderNavigation;
  /** Embedded responsive nav CSS for native publish consumers */
  navigationCss?: string;
  styles: BuilderClassDef[];
  tree: BuilderNode[];
  interactions: BuilderInteraction[];
};

export type CmsDocumentBody = CmsBuilderDoc | import('../cmsPage').CmsPageBody;

export function newNodeId() {
  return crypto.randomUUID();
}

export function isChromeNode(node: BuilderNode) {
  return Boolean(node.chrome) || node.type === 'header' || node.type === 'footer' || node.type === 'nav';
}

export function defaultTokens(brand?: CmsPageBrand): BuilderTokens {
  return {
    pageBackground: brand?.backgroundColor ?? '#f7f4ef',
    surface: brand?.surfaceColor ?? '#ffffff',
    cardSurface: brand?.surfaceColor ?? '#ffffff',
    text: brand?.textColor ?? '#1a1a1a',
    primary: brand?.primaryColor ?? '#0b3d2e',
    accent: brand?.accentColor ?? '#c4a35a',
  };
}

export function defaultBreakpoints() {
  return { desktop: 1200, tablet: 768, mobile: 390 };
}

export function defaultNavigation(): BuilderNavigation {
  return {
    links: [
      { label: 'Home', href: '#home' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' },
    ],
    mobileMenu: 'hamburger',
    collapseAt: 'mobile',
  };
}

/** Parse "Home · About · Contact" (or comma/pipe) into nav links. */
export function parseNavLinkText(text: string): BuilderNavLink[] {
  const parts = text
    .split(/[·|•,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return defaultNavigation().links;
  return parts.map((label) => ({
    label,
    href: `#${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
  }));
}

export function navLinksLabel(links: BuilderNavLink[]): string {
  return links.map((l) => l.label).join(' · ');
}
