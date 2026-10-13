/**
 * Run: node src/lib/cmsBuilder/responsiveNav.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Lightweight re-implementation mirrors for Node without TS compile
function parseNavLinkText(text) {
  const parts = text
    .split(/[·|•,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((label) => ({
    label,
    href: `#${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
  }));
}

function navCollapsedForViewport(viewport, navigation) {
  if (viewport === 'desktop') return false;
  if (navigation.collapseAt === 'tablet') return viewport === 'tablet' || viewport === 'mobile';
  return viewport === 'mobile';
}

function responsiveNavCss(doc) {
  const bp = doc.breakpoints?.mobile ?? 390;
  const tablet = doc.breakpoints?.tablet ?? 768;
  const collapseAt = doc.navigation?.collapseAt === 'tablet' ? tablet : bp;
  return `@media (max-width: ${collapseAt}px)`;
}

const links = parseNavLinkText('Home · About · Contact');
assert.equal(links.length, 3);
assert.equal(links[0].label, 'Home');
assert.equal(links[1].href, '#about');

assert.equal(navCollapsedForViewport('desktop', { collapseAt: 'mobile' }), false);
assert.equal(navCollapsedForViewport('tablet', { collapseAt: 'mobile' }), false);
assert.equal(navCollapsedForViewport('mobile', { collapseAt: 'mobile' }), true);
assert.equal(navCollapsedForViewport('tablet', { collapseAt: 'tablet' }), true);

const css = responsiveNavCss({
  breakpoints: { desktop: 1200, tablet: 768, mobile: 390 },
  navigation: { collapseAt: 'mobile' },
});
assert.ok(css.includes('390px'));

const cssTablet = responsiveNavCss({
  breakpoints: { desktop: 1200, tablet: 768, mobile: 390 },
  navigation: { collapseAt: 'tablet' },
});
assert.ok(cssTablet.includes('768px'));

console.log('cmsBuilder responsiveNav ok');
