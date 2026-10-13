import { exportQuotationPdf } from './exportQuotationPdf';

/** A4 PDF for expenses — shared engine with keep-together pagination. */
export async function exportExpensePdf(options: {
  element: HTMLElement;
  fileName: string;
}): Promise<{ pages: number; fileName: string }> {
  return exportQuotationPdf({ ...options, keepTogether: true });
}
