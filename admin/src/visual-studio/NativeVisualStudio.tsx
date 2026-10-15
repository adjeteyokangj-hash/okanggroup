import { useCallback, useMemo, useState } from 'react';
import { VisualCmsEditor } from '../components/VisualCmsEditor';
import { useAuth } from '../lib/auth';
import type { CmsBuilderDoc } from '../lib/cmsBuilder/types';
import { mergeCapabilities } from './capabilityRegistry';
import { createNativeAdapter } from './adapters/nativeAdapter';
import { VisualStudioShell } from './VisualStudioShell';
import type { StudioLayerNode } from './types';
import { EMPTY_SELECTION } from './types';
import {
  NativeAnimationTool,
  NativeColourTool,
  NativeEffectsTool,
  NativeImageTool,
  NativeLayoutTool,
  NativeTextTool,
  type NativeEditorBridge,
} from './tools/NativeStudioTools';

type Props = {
  clientId: string;
  instanceId: string;
  documentKey?: string | null;
  siteName: string;
  title: string;
  slug: string;
  bodyJson: unknown;
  canEdit: boolean;
  canPublish: boolean;
  busy?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onTitleChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onBodyChange: (body: CmsBuilderDoc) => void;
  onSaveDraft: () => void;
  workflowActions?: React.ReactNode;
};

/**
 * Shared Visual Studio host for OkangGroup native CMS builder documents.
 */
export function NativeVisualStudio(props: Props) {
  const { user } = useAuth();
  const [bridge, setBridge] = useState<NativeEditorBridge | null>(null);
  const [studioSurface, setStudioSurface] = useState<'edit' | 'preview'>('edit');

  const adapter = useMemo(() => createNativeAdapter(bridge?.doc ?? null), [bridge?.doc]);
  const capabilities = useMemo(
    () =>
      mergeCapabilities(adapter.info.capabilities, null, {
        canEdit: props.canEdit,
        canPublish: props.canPublish,
      }),
    [adapter.info.capabilities, props.canEdit, props.canPublish],
  );

  const selection = bridge?.selected
    ? {
        adapterId: 'okang_native',
        documentKey: props.documentKey ?? '',
        targetType:
          bridge.selected.type === 'image'
            ? ('image' as const)
            : bridge.selected.type === 'text' ||
                bridge.selected.type === 'heading' ||
                bridge.selected.type === 'button'
              ? ('text' as const)
              : ('node' as const),
        targetId: bridge.selected.id,
        label: bridge.selected.name || bridge.selected.type,
      }
    : EMPTY_SELECTION('okang_native', props.documentKey ?? '');

  const onLayerSelect = useCallback(
    (node: StudioLayerNode) => {
      bridge?.setSelectedId(node.id);
    },
    [bridge],
  );

  const onWorkspaceMode = useCallback((mode: 'content' | 'design' | 'preview') => {
    setStudioSurface(mode === 'preview' ? 'preview' : 'edit');
  }, []);

  return (
    <VisualStudioShell
      userId={user?.id}
      instanceId={props.instanceId}
      adapter={adapter}
      selection={selection}
      onSelectionChange={onLayerSelect}
      capabilities={capabilities}
      viewport={bridge?.viewport ?? 'desktop'}
      onViewport={(v) => bridge?.setViewport(v)}
      canEdit={props.canEdit}
      canPublish={props.canPublish}
      dirty={bridge?.dirty}
      canUndo={bridge?.canUndo}
      canRedo={bridge?.canRedo}
      onUndo={() => bridge?.onUndo()}
      onRedo={() => bridge?.onRedo()}
      onSave={() => bridge?.onSave()}
      onViewModeChange={onWorkspaceMode}
      onClearSelection={() => bridge?.setSelectedId(bridge.doc.tree[0]?.id ?? null)}
      textTool={<NativeTextTool bridge={bridge} />}
      imageTool={<NativeImageTool bridge={bridge} />}
      layoutTool={<NativeLayoutTool bridge={bridge} />}
      colourTool={<NativeColourTool bridge={bridge} />}
      effectsTool={<NativeEffectsTool bridge={bridge} />}
      animationTool={<NativeAnimationTool bridge={bridge} />}
      canvas={
        <VisualCmsEditor
          clientId={props.clientId}
          instanceId={props.instanceId}
          documentKey={props.documentKey}
          siteName={props.siteName}
          title={props.title}
          slug={props.slug}
          bodyJson={props.bodyJson}
          canEdit={props.canEdit}
          busy={props.busy}
          expanded={props.expanded}
          onExpandedChange={props.onExpandedChange}
          onTitleChange={props.onTitleChange}
          onSlugChange={props.onSlugChange}
          onBodyChange={props.onBodyChange}
          onSaveDraft={props.onSaveDraft}
          workflowActions={props.workflowActions}
          studioEmbed
          studioSurface={studioSurface}
          onBridgeChange={setBridge}
        />
      }
    />
  );
}
