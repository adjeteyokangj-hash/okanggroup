import { useCallback, useMemo, useState } from 'react';
import {
  OpsWatchMarketingEditor,
  type OpsWatchEditorBridge,
} from '../components/OpsWatchMarketingEditor';
import type { CmsSelection } from '../lib/opswatchCmsSelection';
import { useAuth } from '../lib/auth';
import { mergeCapabilities } from './capabilityRegistry';
import { createOpsWatchAdapter, cmsSelectionToStudio } from './adapters/opswatchAdapter';
import { VisualStudioShell } from './VisualStudioShell';
import type { StudioLayerNode } from './types';
import { EMPTY_SELECTION } from './types';
import {
  OpsWatchColourTool,
  OpsWatchEffectsTool,
  OpsWatchImageTool,
  OpsWatchLayoutTool,
  OpsWatchTextTool,
} from './tools/OpsWatchStudioTools';

type Props = {
  instanceId: string;
  clientId?: string | null;
  canEdit: boolean;
  canPublish: boolean;
  canUploadMedia?: boolean;
  publicSiteUrl?: string | null;
};

function layerToCmsSelection(node: StudioLayerNode): CmsSelection | null {
  if (node.id === 'pageSettings') return { kind: 'pageSettings' };
  if (node.id === 'hero') return { kind: 'hero' };
  if (node.id === 'heroImage') return { kind: 'heroImage' };
  if (node.id === 'heroCta-primary') return { kind: 'heroCta', which: 'primary' };
  if (node.id === 'heroCta-secondary') return { kind: 'heroCta', which: 'secondary' };
  if (node.id === 'chromeBlurb') return { kind: 'chromeBlurb' };
  if (node.id === 'chromeNav') return { kind: 'chromeNav' };
  if (node.id === 'chromeFooter-company') return { kind: 'chromeFooter', which: 'company' };
  if (node.id === 'chromeFooter-getStarted') return { kind: 'chromeFooter', which: 'getStarted' };
  if (node.id === 'chromeFooter-note') return { kind: 'chromeFooter', which: 'note' };
  if (node.targetType === 'section') return { kind: 'section', sectionId: node.id };
  if (node.id.endsWith('-image') && node.targetType === 'image') {
    return { kind: 'sectionImage', sectionId: node.id.replace(/-image$/, '') };
  }
  if (node.id.includes('-cta-') && node.targetType === 'cta') {
    const match = node.id.match(/^(.*)-cta-(\d+)$/);
    if (match) {
      return { kind: 'sectionCta', sectionId: match[1], ctaIndex: Number(match[2]) };
    }
  }
  return null;
}

function findCardSelection(
  page: OpsWatchEditorBridge['page'],
  cardId: string,
): CmsSelection | null {
  if (!page) return null;
  for (const section of page.sections) {
    if ((section.cards ?? []).some((c) => c.id === cardId)) {
      return { kind: 'card', sectionId: section.id, cardId };
    }
  }
  return null;
}

/**
 * Canvas-first Visual Studio host for OpsWatch.
 * One draft canvas in Edit mode; separate Preview mode for the live site iframe.
 */
export function OpsWatchVisualStudio({
  instanceId,
  clientId,
  canEdit,
  canPublish,
  canUploadMedia,
  publicSiteUrl,
}: Props) {
  const { user } = useAuth();
  const [bridge, setBridge] = useState<OpsWatchEditorBridge | null>(null);
  const [studioSurface, setStudioSurface] = useState<'edit' | 'preview'>('edit');

  const onWorkspaceMode = useCallback((mode: 'content' | 'design' | 'preview') => {
    setStudioSurface(mode === 'preview' ? 'preview' : 'edit');
  }, []);

  const adapter = useMemo(
    () =>
      createOpsWatchAdapter({
        page: bridge?.page ?? null,
        chrome: bridge?.chrome ?? null,
        chromeMode: bridge?.chromeMode ?? false,
      }),
    [bridge?.page, bridge?.chrome, bridge?.chromeMode],
  );

  const capabilities = useMemo(
    () => mergeCapabilities(adapter.info.capabilities, null, { canEdit, canPublish }),
    [adapter.info.capabilities, canEdit, canPublish],
  );

  const selection = bridge
    ? cmsSelectionToStudio('opswatch_marketing', bridge.moduleCode, bridge.selection)
    : EMPTY_SELECTION('opswatch_marketing', '');

  const onLayerSelect = useCallback(
    (node: StudioLayerNode) => {
      if (!bridge) return;
      if (node.targetType === 'card') {
        const cardSel = findCardSelection(bridge.page, node.id);
        if (cardSel) bridge.setSelection(cardSel);
        return;
      }
      const mapped = layerToCmsSelection(node);
      if (mapped) bridge.setSelection(mapped);
    },
    [bridge],
  );

  const enterPreview = useCallback(async () => {
    if (bridge) await Promise.resolve(bridge.onPreview());
  }, [bridge]);

  return (
    <VisualStudioShell
      userId={user?.id}
      instanceId={instanceId}
      adapter={adapter}
      selection={selection}
      onSelectionChange={onLayerSelect}
      capabilities={capabilities}
      viewport={bridge?.viewport ?? 'desktop'}
      onViewport={(v) => bridge?.setViewport(v)}
      canEdit={canEdit}
      canPublish={canPublish}
      dirty={bridge?.dirty}
      canUndo={bridge?.canUndo}
      canRedo={bridge?.canRedo}
      onUndo={() => bridge?.onUndo()}
      onRedo={() => bridge?.onRedo()}
      onSave={() => bridge?.onSave()}
      onEnterPreview={enterPreview}
      onViewModeChange={onWorkspaceMode}
      onPublish={() => bridge?.onPublish()}
      onRollback={() => bridge?.onRollback()}
      onClearSelection={() => bridge?.setSelection({ kind: 'pageSettings' })}
      connectionLabel={bridge?.healthLabel ?? 'Checking connection…'}
      connectionTone={bridge?.connectionTone ?? 'muted'}
      notice={bridge?.message}
      alert={bridge?.error}
      onReconnect={() => bridge?.onReconnect()}
      reconnectBusy={bridge?.reconnecting}
      textTool={<OpsWatchTextTool bridge={bridge} />}
      imageTool={<OpsWatchImageTool bridge={bridge} />}
      layoutTool={<OpsWatchLayoutTool bridge={bridge} />}
      colourTool={<OpsWatchColourTool bridge={bridge} />}
      effectsTool={<OpsWatchEffectsTool bridge={bridge} />}
      canvas={
        <OpsWatchMarketingEditor
          instanceId={instanceId}
          clientId={clientId}
          canEdit={canEdit}
          canPublish={canPublish}
          canUploadMedia={canUploadMedia}
          publicSiteUrl={publicSiteUrl}
          studioEmbed
          studioSurface={studioSurface}
          onBridgeChange={setBridge}
        />
      }
    />
  );
}
