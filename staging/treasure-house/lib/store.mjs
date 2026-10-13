import {
  mapShadowHomepageToTh,
  mapShadowLeadershipToTh,
  mapShadowMinistryToTh,
  mapShadowQuickCardsToTh,
} from './mappers.mjs';
import { TH_STAGING_FIRST_WAVE_MODULES } from './guards.mjs';

function emptyModule(seedDraft) {
  return {
    draft: structuredClone(seedDraft),
    published: null,
    revisions: [],
  };
}

/** In-memory staging content store (synthetic). Optional DB wiring comes after Owner project create. */
export function createStagingStore() {
  const modules = new Map([
    [
      'ministries',
      emptyModule({
        items: [
          mapShadowMinistryToTh({
            slug: 'youth-staging',
            name: 'Youth (Staging)',
            summary: 'Synthetic youth ministry for OkangGroup staging tests.',
            body: 'Synthetic body — not live church content.',
            sort_order: 10,
            is_published: false,
          }),
        ],
        updated_at: new Date().toISOString(),
      }),
    ],
    [
      'homepage',
      emptyModule(
        mapShadowHomepageToTh({
          welcome_long: 'Synthetic Treasure House staging homepage welcome.',
          intro_heading: 'Welcome (Staging)',
        }),
      ),
    ],
    [
      'quick_cards',
      emptyModule(
        mapShadowQuickCardsToTh({
          cards: [
            {
              href: '/live',
              label: 'Live Stream',
              detail: 'Synthetic card',
              icon: 'live',
              visible: true,
            },
            {
              href: '/bible',
              label: 'Holy Bible',
              detail: 'Synthetic card',
              icon: 'bible',
              visible: true,
            },
          ],
        }),
      ),
    ],
    [
      'leadership',
      emptyModule({
        items: [
          mapShadowLeadershipToTh({
            slug: 'pastor-staging',
            display_name: 'Pastor Staging',
            role_title: 'Pastor (Synthetic)',
            summary: 'Synthetic leadership profile for staging only.',
            bio: 'Not a real pastoral record.',
            draft_status: 'draft',
            sort_order: 10,
          }),
        ],
        updated_at: new Date().toISOString(),
      }),
    ],
  ]);

  return {
    moduleCodes() {
      return [...modules.keys()];
    },
    firstWave() {
      return [...TH_STAGING_FIRST_WAVE_MODULES];
    },
    get(code) {
      return modules.get(code) ?? null;
    },
    put(code, body) {
      const mod = modules.get(code);
      if (!mod) return null;
      let draft = body;
      if (code === 'ministries' && body && typeof body === 'object' && !Array.isArray(body.items)) {
        if (body.slug || body.name) {
          draft = {
            items: [mapShadowMinistryToTh(body)],
            updated_at: new Date().toISOString(),
          };
        }
      } else if (
        code === 'leadership' &&
        body &&
        typeof body === 'object' &&
        !Array.isArray(body.items)
      ) {
        if (body.slug || body.display_name || body.name) {
          draft = {
            items: [mapShadowLeadershipToTh(body)],
            updated_at: new Date().toISOString(),
          };
        }
      } else if (code === 'homepage') {
        draft = { ...mapShadowHomepageToTh(body), updated_at: new Date().toISOString() };
      } else if (code === 'quick_cards') {
        draft = { ...mapShadowQuickCardsToTh(body), updated_at: new Date().toISOString() };
      } else {
        draft = { ...body, updated_at: new Date().toISOString() };
      }
      mod.draft = draft;
      return mod;
    },
    publish(code, correlationId) {
      const mod = modules.get(code);
      if (!mod) return null;
      const snap = structuredClone(mod.draft);
      mod.revisions.push({
        revision_no: mod.revisions.length + 1,
        snapshot: snap,
        published_at: new Date().toISOString(),
        correlation_id: correlationId,
      });
      mod.published = snap;
      return mod;
    },
    rollback(code, revisionNo) {
      const mod = modules.get(code);
      if (!mod) return null;
      const rev = mod.revisions.find((r) => r.revision_no === Number(revisionNo));
      if (!rev) return { error: 'Revision not found' };
      mod.draft = structuredClone(rev.snapshot);
      mod.published = structuredClone(rev.snapshot);
      return { mod, restored_revision: Number(revisionNo) };
    },
  };
}
