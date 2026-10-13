/**
 * Company CMS → Vite content export (Release 1).
 *
 * Writes a versioned artefact under content/cms/artefacts/ and updates
 * content/cms/current.json for the marketing site to consume at build time.
 *
 * Does NOT deploy to the public website. Production deploy requires separate
 * Owner approval.
 *
 * Usage:
 *   node scripts/cms-publish-export.mjs
 *
 * Env:
 *   SUPABASE_URL              (default: https://prbgsnxpwyepdggdysnt.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY (required — server-side export only)
 *   CMS_PUBLISH_DEPLOY=1      (forbidden — script exits if set)
 */

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cmsRoot = path.join(root, 'content', 'cms');
const artefactsDir = path.join(cmsRoot, 'artefacts');
const currentPath = path.join(cmsRoot, 'current.json');
const previousPath = path.join(cmsRoot, 'previous.json');

if (process.env.CMS_PUBLISH_DEPLOY === '1') {
  console.error(
    'Refusing to run: CMS_PUBLISH_DEPLOY=1 is set. Public website deploy is not authorised by this script.',
  );
  process.exit(2);
}

const url = (process.env.SUPABASE_URL ?? 'https://prbgsnxpwyepdggdysnt.supabase.co').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Export aborted (no deploy performed).');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function restGet(table, query) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table}: ${res.status} ${body}`);
  }
  return res.json();
}

async function restPatch(table, query, body) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${table}: ${res.status} ${text}`);
  }
}

let pages;
let sections;
let seo;
let navigation;
try {
  pages = await restGet(
    'cms_pages',
    'select=id,slug,title,page_type,status,published_at&status=eq.published&order=slug',
  );
  sections = await restGet(
    'cms_sections',
    'select=page_id,section_key,sort_order,content_json,status&order=sort_order',
  );
  seo = await restGet('cms_seo', 'select=page_id,title,description,og_image_path');
  navigation = await restGet(
    'cms_navigation',
    'select=id,parent_id,label,href,sort_order,status&status=eq.active&order=sort_order',
  );
} catch (err) {
  console.error('Failed to load CMS data:', err.message);
  process.exit(1);
}

const sectionsByPage = new Map();
for (const s of sections) {
  const list = sectionsByPage.get(s.page_id) ?? [];
  list.push(s);
  sectionsByPage.set(s.page_id, list);
}
const seoByPage = new Map(seo.map((row) => [row.page_id, row]));

const enrichedPages = pages.map((p) => ({
  ...p,
  sections: sectionsByPage.get(p.id) ?? [],
  seo: seoByPage.get(p.id) ?? null,
}));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artefactName = `site-bundle-${stamp}.json`;
const artefactRel = `artefacts/${artefactName}`;
const artefactAbs = path.join(artefactsDir, artefactName);

const bundle = {
  kind: 'okanggroup_company_cms_site_bundle',
  generated_at: new Date().toISOString(),
  deploy_authorised: false,
  pages: enrichedPages,
  navigation,
};

await mkdir(artefactsDir, { recursive: true });

if (existsSync(currentPath)) {
  await copyFile(currentPath, previousPath);
}

await writeFile(artefactAbs, JSON.stringify(bundle, null, 2), 'utf8');
await writeFile(currentPath, JSON.stringify(bundle, null, 2), 'utf8');

try {
  const pending = await restGet(
    'cms_publish_events',
    'select=id,previous_artefact_path&status=eq.pending&order=created_at.desc&limit=1',
  );
  if (pending[0]) {
    await restPatch(`cms_publish_events`, `id=eq.${pending[0].id}`, {
      status: 'succeeded',
      artefact_path: artefactRel,
      previous_artefact_path: existsSync(previousPath)
        ? 'previous.json'
        : pending[0].previous_artefact_path,
    });
  }
} catch (err) {
  console.warn('Publish event update skipped:', err.message);
}

const manifest = {
  current: 'current.json',
  previous: existsSync(previousPath) ? 'previous.json' : null,
  latest_artefact: artefactRel,
  note: 'Artefact written locally. Public Vite deploy requires separate Owner approval.',
};
await writeFile(path.join(cmsRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`CMS artefact written: ${artefactRel}`);
console.log('current.json updated. previous.json retained for rollback when available.');
console.log('Public website deploy NOT executed.');
