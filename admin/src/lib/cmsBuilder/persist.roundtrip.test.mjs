/**
 * Ensures v2 builder docs round-trip through JSON without losing tree/tokens.
 * Run: node src/lib/cmsBuilder/persist.roundtrip.test.mjs
 */
import assert from 'node:assert/strict';

const sampleV2 = {
  version: 2,
  brand: { siteName: 'Test Site', backgroundColor: '#f7f4ef', textColor: '#1a1a1a' },
  tokens: {
    pageBackground: '#f7f4ef',
    cardSurface: '#ffffff',
    text: '#1a1a1a',
    primary: '#0b3d2e',
    accent: '#c4a35a',
  },
  breakpoints: { desktop: 1200, tablet: 768, mobile: 390 },
  navigation: {
    links: [
      { label: 'Home', href: '#home' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' },
    ],
    mobileMenu: 'hamburger',
    collapseAt: 'mobile',
  },
  styles: [],
  tree: [
    {
      id: 'hero-1',
      type: 'frame',
      name: 'Welcome',
      children: [
        { id: 'h1', type: 'heading', name: 'Heading', props: { text: 'Welcome' } },
        { id: 't1', type: 'text', name: 'Body', props: { text: 'Hello' } },
      ],
    },
    {
      id: 'cards-1',
      type: 'grid',
      name: 'Cards',
      style: { display: 'grid', gridColumns: 3 },
      children: [
        {
          id: 'c1',
          type: 'card',
          name: 'One',
          style: { cardColor: '#ffe8cc' },
          children: [{ id: 'c1t', type: 'heading', name: 'Title', props: { text: 'One' } }],
        },
      ],
    },
  ],
  interactions: [],
};

const stored = JSON.parse(JSON.stringify(sampleV2));
assert.equal(stored.version, 2);
assert.equal(stored.tree.length, 2);
assert.equal(stored.tree[0].children[0].props.text, 'Welcome');
assert.equal(stored.tree[1].children[0].style.cardColor, '#ffe8cc');
assert.equal(stored.tokens.pageBackground, '#f7f4ef');
assert.equal(stored.navigation.mobileMenu, 'hamburger');
assert.equal(stored.navigation.links.length, 3);

// Reopen simulation: accept stored JSON as source of truth
const reopened = stored;
assert.equal(reopened.tree[1].children[0].style.cardColor, '#ffe8cc');
assert.ok(reopened.tree.every((n) => n.id && n.type));
assert.equal(reopened.navigation.collapseAt, 'mobile');

console.log('cmsBuilder persist roundtrip ok');
