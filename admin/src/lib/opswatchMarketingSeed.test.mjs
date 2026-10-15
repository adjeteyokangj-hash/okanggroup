/**
 * The editor canvas must show the same website copy the public site uses
 * when a CMS module has no saved draft.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { mergeCmsPage } = await import(pathToFileURL(path.join(here, 'opswatchMarketing.ts')).href);

const platform = mergeCmsPage('opswatch.page.platform', null);
assert.equal(platform.hero.title, 'One operational spine for health, impact and repair');
assert.equal(platform.hero.primaryCta.label, 'Start monitoring');
assert.ok(platform.sections.length > 0);

const partial = mergeCmsPage('opswatch.page.platform', {
  hero: { title: 'Edited spine' },
});
assert.equal(partial.hero.title, 'Edited spine');
assert.match(partial.hero.subtitle, /topology context/);
assert.equal(partial.sections.length, platform.sections.length);

const home = mergeCmsPage('opswatch.page.home', {
  hero: { title: 'Command Center for application health and recovery' },
});
assert.equal(home.hero.title, 'Command Center for application health and recovery');
assert.equal(home.hero.showCommandCenterPreview, true);

console.log('opswatchMarketingSeed.test.mjs OK');
