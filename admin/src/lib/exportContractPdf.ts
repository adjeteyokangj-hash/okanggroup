import { exportQuotationPdf } from './exportQuotationPdf';

/** A4 PDF for service agreements — same engine as quotations, with keep-together pagination. */
export async function exportContractPdf(options: {
  element: HTMLElement;
  fileName: string;
}): Promise<{ pages: number; fileName: string }> {
  return exportQuotationPdf({ ...options, keepTogether: true });
}
