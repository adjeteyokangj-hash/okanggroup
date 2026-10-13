import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
/** Comfortable customer margins — kept modest so short quotes stay on one page. */
export const MARGIN_MM = 10;

export type PdfKeepBand = {
  /** Inclusive start Y in canvas pixels (document top = 0). */
  startPx: number;
  /** Exclusive end Y in canvas pixels. */
  endPx: number;
};

/** Pure layout helper — short content must never open a blank second page. */
export function quotationPdfPagePlan(contentHeightMm: number, usableHeightMm: number): {
  pages: number;
  fitScale: number;
} {
  if (contentHeightMm <= usableHeightMm + 0.5) {
    return { pages: 1, fitScale: Math.min(1, usableHeightMm / Math.max(contentHeightMm, 0.01)) };
  }
  return { pages: Math.ceil(contentHeightMm / usableHeightMm), fitScale: 1 };
}

/**
 * Choose a page slice height that avoids cutting through keep-together bands
 * (e.g. a heading and its first paragraph). Used for multi-page canvas PDFs.
 */
export function choosePdfSliceHeight(options: {
  renderedY: number;
  pageHeightPx: number;
  canvasHeight: number;
  keepBands: PdfKeepBand[];
  /** Minimum fraction of a page that must be filled before we pull a band to the next page. */
  minFillRatio?: number;
}): number {
  const { renderedY, pageHeightPx, canvasHeight, keepBands } = options;
  const remaining = canvasHeight - renderedY;
  if (remaining <= pageHeightPx) return Math.max(1, remaining);

  const minFill = Math.floor(pageHeightPx * (options.minFillRatio ?? 0.35));
  const softFill = Math.floor(pageHeightPx * 0.18);
  const idealCut = renderedY + pageHeightPx;

  // Prefer the deepest band start that still leaves a reasonable page fill.
  let best: number | null = null;
  for (const band of keepBands) {
    if (band.endPx <= renderedY + 1 || band.startPx >= idealCut) continue;
    const splitsBand = band.startPx < idealCut && band.endPx > idealCut;
    if (!splitsBand) continue;

    const beforeBand = band.startPx - renderedY;
    if (beforeBand <= 0) continue;

    // Prefer a normal fill; allow a shorter page rather than orphan a heading.
    if (beforeBand >= minFill || beforeBand >= softFill) {
      if (best == null || beforeBand > best) best = beforeBand;
    }
  }

  if (best != null && best < pageHeightPx) return best;
  return pageHeightPx;
}

/**
 * Map `[data-pdf-keep]` blocks from the source DOM into canvas-pixel bands
 * after html2canvas has painted (uses canvas/CSS width ratio as scale).
 */
export function collectPdfKeepBands(element: HTMLElement, canvas: HTMLCanvasElement): PdfKeepBand[] {
  const cssWidth = Math.max(element.scrollWidth, element.offsetWidth, 1);
  const scale = canvas.width / cssWidth;
  const rootRect = element.getBoundingClientRect();
  const nodes = element.querySelectorAll<HTMLElement>('[data-pdf-keep]');
  const bands: PdfKeepBand[] = [];

  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    const topCss = r.top - rootRect.top + element.scrollTop;
    const heightCss = Math.max(r.height, 1);
    const startPx = Math.floor(topCss * scale);
    const endPx = Math.ceil((topCss + heightCss) * scale);
    if (endPx > startPx) bands.push({ startPx, endPx });
  }

  bands.sort((a, b) => a.startPx - b.startPx);
  return bands;
}

/**
 * Export a quotation DOM node as a true PDF (no browser URL/title/date chrome).
 * Short documents are scaled to fit a single A4 page; longer ones paginate cleanly.
 * Pass `keepTogether: true` (contracts) to avoid slicing through `[data-pdf-keep]` bands.
 */
export async function exportQuotationPdf(options: {
  element: HTMLElement;
  fileName: string;
  keepTogether?: boolean;
}): Promise<{ pages: number; fileName: string }> {
  const { element, fileName, keepTogether = false } = options;

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const usableWidth = A4_WIDTH_MM - MARGIN_MM * 2;
  const usableHeight = A4_HEIGHT_MM - MARGIN_MM * 2;
  const imgWidthMm = usableWidth;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Short quotation: fit entirely on one page (avoids a near-empty second sheet).
  if (imgHeightMm <= usableHeight + 0.5) {
    const scale = Math.min(1, usableHeight / imgHeightMm);
    const drawW = imgWidthMm * scale;
    const drawH = imgHeightMm * scale;
    const x = MARGIN_MM + (usableWidth - drawW) / 2;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, MARGIN_MM, drawW, drawH, undefined, 'FAST');
    pdf.save(fileName);
    return { pages: 1, fileName };
  }

  const keepBands = keepTogether ? collectPdfKeepBands(element, canvas) : [];

  // Longer document: slice the canvas across A4 pages, preferring keep-together breaks.
  const pageHeightPx = Math.floor((usableHeight * canvas.width) / imgWidthMm);
  let renderedY = 0;
  let pages = 0;

  while (renderedY < canvas.height - 1) {
    const sliceHeight = choosePdfSliceHeight({
      renderedY,
      pageHeightPx,
      canvasHeight: canvas.height,
      keepBands,
    });
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Could not create PDF page canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0,
      renderedY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    const sliceHeightMm = (sliceHeight * imgWidthMm) / canvas.width;
    if (pages > 0) pdf.addPage();
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.95),
      'JPEG',
      MARGIN_MM,
      MARGIN_MM,
      imgWidthMm,
      sliceHeightMm,
      undefined,
      'FAST',
    );

    renderedY += sliceHeight;
    pages += 1;
  }

  pdf.save(fileName);
  return { pages, fileName };
}
