/** Shared selection model for OpsWatch Visual CMS three-panel sync. */

export type CmsEditMode = 'visual' | 'structure';

export type CmsSelection =
  | { kind: 'pageSettings' }
  | { kind: 'hero' }
  | { kind: 'heroImage' }
  | { kind: 'heroCta'; which: 'primary' | 'secondary' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'sectionImage'; sectionId: string }
  | { kind: 'sectionCta'; sectionId: string; ctaIndex: number }
  | { kind: 'card'; sectionId: string; cardId: string }
  | { kind: 'chromeBlurb' }
  | { kind: 'chromeNav' }
  | { kind: 'chromeFooter'; which: 'company' | 'getStarted' | 'note' };

export function defaultPageSelection(): CmsSelection {
  return { kind: 'pageSettings' };
}

export function defaultChromeSelection(): CmsSelection {
  return { kind: 'chromeBlurb' };
}

/** Stable DOM id for canvas scroll / highlight targets. */
export function cmsDomId(sel: CmsSelection): string {
  switch (sel.kind) {
    case 'pageSettings':
      return 'ow-cms-target-page';
    case 'hero':
      return 'ow-cms-target-hero';
    case 'heroImage':
      return 'ow-cms-target-hero-image';
    case 'heroCta':
      return `ow-cms-target-hero-cta-${sel.which}`;
    case 'section':
      return `ow-cms-target-section-${sel.sectionId}`;
    case 'sectionImage':
      return `ow-cms-target-section-image-${sel.sectionId}`;
    case 'sectionCta':
      return `ow-cms-target-section-cta-${sel.sectionId}-${sel.ctaIndex}`;
    case 'card':
      return `ow-cms-target-card-${sel.sectionId}-${sel.cardId}`;
    case 'chromeBlurb':
      return 'ow-cms-target-chrome-blurb';
    case 'chromeNav':
      return 'ow-cms-target-chrome-nav';
    case 'chromeFooter':
      return `ow-cms-target-chrome-footer-${sel.which}`;
  }
}

export function selectionEquals(a: CmsSelection, b: CmsSelection): boolean {
  return cmsDomId(a) === cmsDomId(b);
}

export function selectionLabel(sel: CmsSelection): string {
  switch (sel.kind) {
    case 'pageSettings':
      return 'Page settings';
    case 'hero':
      return 'Hero';
    case 'heroImage':
      return 'Hero image';
    case 'heroCta':
      return sel.which === 'primary' ? 'Primary button' : 'Secondary button';
    case 'section':
      return 'Section';
    case 'sectionImage':
      return 'Section image';
    case 'sectionCta':
      return `Section button ${sel.ctaIndex + 1}`;
    case 'card':
      return 'Feature card';
    case 'chromeBlurb':
      return 'Product blurb';
    case 'chromeNav':
      return 'Navigation';
    case 'chromeFooter':
      return sel.which === 'note'
        ? 'Footer note'
        : sel.which === 'company'
          ? 'Footer — company'
          : 'Footer — get started';
  }
}

export function sectionIdFromSelection(sel: CmsSelection): string | null {
  if (
    sel.kind === 'section' ||
    sel.kind === 'sectionImage' ||
    sel.kind === 'sectionCta' ||
    sel.kind === 'card'
  ) {
    return sel.sectionId;
  }
  return null;
}

export function modulePublicPath(moduleCode: string): string {
  if (moduleCode === 'opswatch.site.chrome' || moduleCode === 'opswatch.page.home') return '/';
  if (moduleCode.startsWith('opswatch.page.')) {
    return `/${moduleCode.replace('opswatch.page.', '')}`;
  }
  return '/';
}
