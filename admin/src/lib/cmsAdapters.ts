/** Central CMS adapter catalogue — labels only; secrets never stored here. */

export type CmsAdapterCode =
  | 'okang_native'
  | 'sandbox_mock'
  | 'okang_dev_client'
  | 'treasure_house_staging'
  | 'wordpress_rest'
  | 'custom_webhook'
  | 'manual_only';

export type CmsAdapterInfo = {
  code: CmsAdapterCode;
  label: string;
  integrationMode: 'platform' | 'sandbox' | 'external' | 'hybrid';
  externalLive: boolean;
  summary: string;
};

export const CMS_ADAPTERS: CmsAdapterInfo[] = [
  {
    code: 'okang_native',
    label: 'OkangGroup native',
    integrationMode: 'platform',
    externalLive: false,
    summary: 'Platform content store — Generic / Custom / Hybrid managed in OkangGroup.',
  },
  {
    code: 'sandbox_mock',
    label: 'Sandbox mock (dev)',
    integrationMode: 'sandbox',
    externalLive: false,
    summary: 'Safe development probe — no live client applications contacted.',
  },
  {
    code: 'okang_dev_client',
    label: 'Dev client CMS (HTTP)',
    integrationMode: 'external',
    externalLive: true,
    summary: 'Dedicated non-production client stub via gateway — vault credential_ref required.',
  },
  {
    code: 'treasure_house_staging',
    label: 'Treasure House staging (HTTP)',
    integrationMode: 'external',
    externalLive: true,
    summary:
      'Isolated TH staging bridge via gateway — same /v1 protocol as okang_dev_client; requires separate DB/auth/storage and vault ref dev/treasure-house-staging. Not connected.',
  },
  {
    code: 'wordpress_rest',
    label: 'WordPress REST',
    integrationMode: 'external',
    externalLive: true,
    summary: 'Requires vault credential_ref and a reachable WordPress REST endpoint.',
  },
  {
    code: 'custom_webhook',
    label: 'Custom webhook',
    integrationMode: 'external',
    externalLive: true,
    summary: 'Requires vault credential_ref and signed webhook — client-app specific.',
  },
  {
    code: 'manual_only',
    label: 'Manual only',
    integrationMode: 'external',
    externalLive: false,
    summary: 'Out-of-band publishing; OkangGroup tracks status only.',
  },
];

export function adapterLabel(code: string | null | undefined): string {
  return CMS_ADAPTERS.find((a) => a.code === code)?.label ?? code ?? 'Unknown';
}
