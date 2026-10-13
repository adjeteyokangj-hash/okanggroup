export type CmsEditorLayoutPrefs = {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
};

export const CMS_EDITOR_LAYOUT_DEFAULTS: CmsEditorLayoutPrefs = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 280,
  rightWidth: 300,
};

const MIN_RAIL = 200;
const MAX_RAIL = 420;

export function clampRailWidth(n: number) {
  return Math.min(MAX_RAIL, Math.max(MIN_RAIL, Math.round(n)));
}

export function cmsEditorLayoutKey(userId: string | undefined, instanceId: string) {
  return `okang.cmsEditorLayout.${userId ?? 'anon'}.${instanceId}`;
}

export function loadCmsEditorLayout(key: string): CmsEditorLayoutPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...CMS_EDITOR_LAYOUT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<CmsEditorLayoutPrefs>;
    return {
      leftOpen: parsed.leftOpen ?? CMS_EDITOR_LAYOUT_DEFAULTS.leftOpen,
      rightOpen: parsed.rightOpen ?? CMS_EDITOR_LAYOUT_DEFAULTS.rightOpen,
      leftWidth: clampRailWidth(parsed.leftWidth ?? CMS_EDITOR_LAYOUT_DEFAULTS.leftWidth),
      rightWidth: clampRailWidth(parsed.rightWidth ?? CMS_EDITOR_LAYOUT_DEFAULTS.rightWidth),
    };
  } catch {
    return { ...CMS_EDITOR_LAYOUT_DEFAULTS };
  }
}

export function saveCmsEditorLayout(key: string, prefs: CmsEditorLayoutPrefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}
