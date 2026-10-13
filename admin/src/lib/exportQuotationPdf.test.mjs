import assert from 'node:assert/strict';
import {
  A4_HEIGHT_MM,
  MARGIN_MM,
  choosePdfSliceHeight,
  quotationPdfPagePlan,
} from './exportQuotationPdf.ts';

const usable = A4_HEIGHT_MM - MARGIN_MM * 2;

const short = quotationPdfPagePlan(180, usable);
assert.equal(short.pages, 1);
assert.ok(short.fitScale <= 1);

const tinyOverflow = quotationPdfPagePlan(usable + 0.2, usable);
assert.equal(tinyOverflow.pages, 1);

const long = quotationPdfPagePlan(usable * 2.2, usable);
assert.equal(long.pages, 3);

// One-page canvas: remaining fits — no keep-band adjustment needed.
assert.equal(
  choosePdfSliceHeight({
    renderedY: 0,
    pageHeightPx: 1000,
    canvasHeight: 900,
    keepBands: [{ startPx: 800, endPx: 950 }],
  }),
  900,
);

// Multi-page: ideal cut would orphan a heading (band 900–980 across cut at 1000).
// Break before the band so heading + paragraph stay together on page 2.
assert.equal(
  choosePdfSliceHeight({
    renderedY: 0,
    pageHeightPx: 1000,
    canvasHeight: 2200,
    keepBands: [{ startPx: 920, endPx: 1100 }],
  }),
  920,
);

// Band larger than a page starting early: allow mid-band cut (no good early break).
assert.equal(
  choosePdfSliceHeight({
    renderedY: 0,
    pageHeightPx: 1000,
    canvasHeight: 3000,
    keepBands: [{ startPx: 50, endPx: 2500 }],
  }),
  1000,
);

// Second page: keep Client responsibilities heading with its paragraph.
assert.equal(
  choosePdfSliceHeight({
    renderedY: 1000,
    pageHeightPx: 1000,
    canvasHeight: 2500,
    keepBands: [
      { startPx: 1880, endPx: 2050 }, // would be split by cut at 2000
    ],
  }),
  880,
);

console.log('exportQuotationPdf.test.mjs PASS');
