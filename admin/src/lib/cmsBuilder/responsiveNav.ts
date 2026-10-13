import type { BuilderNavigation, CmsBuilderDoc } from './types';
import { defaultNavigation } from './types';

export type EditorViewport = 'desktop' | 'tablet' | 'mobile';

export function normalizeNavigation(raw: unknown): BuilderNavigation {
  const base = defaultNavigation();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<BuilderNavigation>;
  const links = Array.isArray(obj.links)
    ? obj.links
        .map((l) => ({
          label: String((l as { label?: string })?.label ?? '').trim(),
          href: String((l as { href?: string })?.href ?? '#').trim() || '#',
        }))
        .filter((l) => l.label)
    : base.links;
  return {
    links: links.length ? links : base.links,
    mobileMenu: 'hamburger',
    collapseAt: obj.collapseAt === 'tablet' ? 'tablet' : 'mobile',
  };
}

export function navCollapsedForViewport(
  viewport: EditorViewport,
  navigation: BuilderNavigation = defaultNavigation(),
): boolean {
  if (viewport === 'desktop') return false;
  if (navigation.collapseAt === 'tablet') return viewport === 'tablet' || viewport === 'mobile';
  return viewport === 'mobile';
}

/** Media-query CSS embedded in saved/published page configs for native consumers. */
export function responsiveNavCss(doc: CmsBuilderDoc): string {
  const bp = doc.breakpoints?.mobile ?? 390;
  const tablet = doc.breakpoints?.tablet ?? 768;
  const collapseAt = doc.navigation?.collapseAt === 'tablet' ? tablet : bp;
  return `
.cms-site-nav { display: flex; flex-direction: column; width: 100%; gap: 0; }
.cms-site-nav-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; width: 100%; min-width: 0; }
.cms-site-nav-links { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
.cms-nav-burger { align-items: center; justify-content: center; width: 2.35rem; height: 2.35rem; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; flex-shrink: 0; padding: 0; }
.cms-nav-burger-lines { display: flex; flex-direction: column; gap: 4px; width: 1rem; }
.cms-nav-burger-lines i { display: block; height: 2px; background: currentColor; border-radius: 1px; }
.cms-nav-drawer { flex-direction: column; gap: 0; width: 100%; padding: 0.35rem 0 0.15rem; }
.cms-nav-drawer a, .cms-nav-drawer span { display: block; padding: 0.65rem 0.15rem; border-top: 1px solid rgba(255,255,255,0.12); text-decoration: none; color: inherit; opacity: 0.95; font-size: 0.92rem; }
@media (min-width: ${collapseAt + 1}px) {
  .cms-nav-burger { display: none !important; }
  .cms-nav-drawer { display: none !important; }
}
@media (max-width: ${collapseAt}px) {
  .cms-site-nav-links { display: none !important; }
  .cms-nav-burger { display: inline-flex !important; }
  .cms-site-nav.is-open .cms-nav-drawer { display: flex !important; }
  .cms-site-nav:not(.is-open) .cms-nav-drawer { display: none !important; }
}
`.trim();
}
