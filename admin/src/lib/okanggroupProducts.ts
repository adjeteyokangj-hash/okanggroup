/** Catalogue of OkangGroup-owned websites/apps for Managed Websites registration.
 *  Adding a future product = catalogue entry (+ adapter if new). No ownership schema migration.
 */

import type { CmsAdapterCode } from './cmsAdapters';

export type OkangGroupProduct = {
  code: string;
  name: string;
  adapter: CmsAdapterCode;
  /** Public marketing site origin (preview). */
  defaultPublicSiteUrl: string;
  /** CMS HTTP API base used by the gateway adapter. */
  defaultCmsApiUrl: string;
  summary: string;
};

export const OKANGGROUP_PRODUCTS: OkangGroupProduct[] = [
  {
    code: 'opswatch',
    name: 'OpsWatch',
    adapter: 'opswatch_marketing',
    defaultPublicSiteUrl: 'http://localhost:3000',
    defaultCmsApiUrl: 'http://localhost:4000/api/cms',
    summary: 'OkangGroup product — public marketing website only via opswatch_marketing.',
  },
];

export function productByCode(code: string | null | undefined): OkangGroupProduct | undefined {
  if (!code) return undefined;
  return OKANGGROUP_PRODUCTS.find((p) => p.code === code);
}

/** True when My Client CMS / workspace must open the OpsWatch marketing Visual Studio. */
export function isOpsWatchMarketingCms(input: {
  adapterCode?: string | null;
  productCode?: string | null;
  slug?: string | null;
  displayName?: string | null;
}): boolean {
  if (input.adapterCode === 'opswatch_marketing') return true;
  if (input.productCode === 'opswatch') return true;
  if ((input.slug ?? '').toLowerCase() === 'opswatch') return true;
  return Boolean(input.displayName && /^opswatch(\b|$|[\s_-])/i.test(input.displayName));
}
