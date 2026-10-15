import { useEffect, useState } from 'react';
import { CmsCustomModulePanel } from './CmsCustomModulePanel';
import { CmsMediaLibrary } from './CmsMediaLibrary';
import {
  TH_SHADOW_EXCLUDED,
  TH_SHADOW_NAV,
  type ThShadowNavItem,
} from '../lib/treasureHouseCmsShadow';
import { supabase } from '../lib/supabase';
import type { TreasureHouseEditorBridge } from '../visual-studio/tools/TreasureHouseStudioTools';

type Props = {
  instanceId: string;
  clientId: string;
  canEdit: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  canUploadMedia: boolean;
  /** Controlled section key from Visual Studio Layers (optional). */
  activeSectionKey?: string | null;
  onSectionChange?: (key: string) => void;
  onBridgeChange?: (bridge: TreasureHouseEditorBridge | null) => void;
};

type Counts = {
  media: number;
  heroes: number;
  ministries: number;
  events: number;
  sermons: number;
};

export function TreasureHouseCmsShadow({
  instanceId,
  clientId,
  canEdit,
  canSubmit,
  canPublish,
  canUploadMedia,
  activeSectionKey = null,
  onSectionChange,
  onBridgeChange,
}: Props) {
  const [section, setSection] = useState<ThShadowNavItem>(TH_SHADOW_NAV[0]);
  const [counts, setCounts] = useState<Counts>({
    media: 0,
    heroes: 0,
    ministries: 0,
    events: 0,
    sermons: 0,
  });

  useEffect(() => {
    if (!activeSectionKey) return;
    const next = TH_SHADOW_NAV.find((n) => n.key === activeSectionKey);
    if (next && next.key !== section.key) setSection(next);
  }, [activeSectionKey, section.key]);

  useEffect(() => {
    if (section.kind !== 'module') onBridgeChange?.(null);
  }, [section.kind, onBridgeChange]);

  function selectSection(item: ThShadowNavItem) {
    setSection(item);
    onSectionChange?.(item.key);
  }

  useEffect(() => {
    void (async () => {
      const { data: defs } = await supabase
        .from('cms_custom_module_defs')
        .select('id, module_code')
        .eq('cms_instance_id', instanceId)
        .eq('status', 'active');
      const byCode = new Map((defs ?? []).map((d) => [d.module_code, d.id]));
      async function countFor(code: string) {
        const id = byCode.get(code);
        if (!id) return 0;
        const { count } = await supabase
          .from('cms_custom_records')
          .select('id', { count: 'exact', head: true })
          .eq('cms_instance_id', instanceId)
          .eq('module_def_id', id);
        return count ?? 0;
      }
      const { count: mediaCount } = await supabase
        .from('client_cms_media')
        .select('id', { count: 'exact', head: true })
        .eq('cms_instance_id', instanceId);
      setCounts({
        media: mediaCount ?? 0,
        heroes: await countFor('hero'),
        ministries: await countFor('ministries'),
        events: await countFor('events'),
        sermons: await countFor('sermons'),
      });
    })();
  }, [instanceId, section.key]);

  return (
    <div className="th-shadow">
      <header className="page-head">
        <div>
          <h2>Treasure House Website CMS (Shadow)</h2>
          <p>
            Shadow copy of the church website CMS administration inside OkangGroup. Synthetic data
            only — membership, pastoral, prayer requests and giving are excluded. Not connected to
            production. Staging gateway deferred (C3-01).
          </p>
        </div>
      </header>

      <nav className="th-shadow-nav" aria-label="Treasure House Website Management">
        {TH_SHADOW_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={section.key === item.key ? 'on' : 'secondary'}
            onClick={() => selectSection(item)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {section.kind === 'dashboard' ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Dashboard</h3>
          <p className="muted-sm">{section.description}</p>
          <div className="stat-grid" style={{ marginTop: '1rem' }}>
            <div className="stat">
              <div className="stat-label">Media assets</div>
              <div className="stat-value">{counts.media}</div>
            </div>
            <div className="stat">
              <div className="stat-label">HERO designs</div>
              <div className="stat-value">{counts.heroes}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ministries</div>
              <div className="stat-value">{counts.ministries}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Events / programmes</div>
              <div className="stat-value">{counts.events}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Sermons</div>
              <div className="stat-value">{counts.sermons}</div>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            {TH_SHADOW_NAV.filter((n) => n.key !== 'dashboard').slice(0, 8).map((item) => (
              <button key={item.key} type="button" className="secondary" onClick={() => selectSection(item)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="muted-sm" style={{ marginTop: '1rem' }}>
            Excluded from shadow: {TH_SHADOW_EXCLUDED.join(', ')}.
          </div>
        </div>
      ) : null}

      {section.kind === 'media' ? (
        canUploadMedia || canEdit ? (
          <CmsMediaLibrary instanceId={instanceId} clientId={clientId} canUpload={canUploadMedia || canEdit} />
        ) : (
          <div className="error">Media upload not permitted for this grant.</div>
        )
      ) : null}

      {section.kind === 'info' ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{section.label}</h3>
          <p>{section.description}</p>
          {section.key === 'mobile_designer' ? (
            <button
              type="button"
              onClick={() => selectSection(TH_SHADOW_NAV.find((n) => n.key === 'homepage')!)}
            >
              Open Homepage document
            </button>
          ) : null}
          {section.key === 'history' ? (
            <p className="muted-sm">
              Record status workflow: draft → in_review → published. Use submit/publish actions on module
              records. Full revision snapshots for custom records follow OkangGroup platform history when
              enabled for the instance.
            </p>
          ) : null}
        </div>
      ) : null}

      {section.kind === 'module' && section.moduleCode ? (
        <CmsCustomModulePanel
          instanceId={instanceId}
          clientId={clientId}
          canEdit={canEdit}
          canSubmit={canSubmit}
          canPublish={canPublish}
          focusModuleCode={section.moduleCode}
          hideHeader
          onBridgeChange={onBridgeChange}
        />
      ) : null}
    </div>
  );
}
