import { TOOL_REQUIREMENTS, mergeCapabilities, toolIsAvailable } from './capabilityRegistry';
import { createNativeAdapter } from './adapters/nativeAdapter';
import { createOpsWatchAdapter } from './adapters/opswatchAdapter';
import { createTreasureHouseAdapter } from './adapters/treasureHouseAdapter';
import type { StudioToolId } from './types';
import { TOOL_TITLES } from './tools/StudioTools';

/** Which Visual Studio tools each known adapter enables (for Managed Websites UI). */
export function studioToolMatrixForAdapter(
  adapterCode: string,
  grants: { canEdit?: boolean; canPublish?: boolean } = { canEdit: true, canPublish: true },
): Array<{ id: StudioToolId; label: string; available: boolean }> {
  const bridge =
    adapterCode === 'okang_native'
      ? createNativeAdapter(null)
      : adapterCode === 'treasure_house_staging' || adapterCode === 'treasure_house_shadow'
        ? createTreasureHouseAdapter()
        : createOpsWatchAdapter({ page: null, chrome: null, chromeMode: false });

  const caps =
    adapterCode === 'opswatch_marketing' || adapterCode === 'okang_native' || adapterCode.startsWith('treasure')
      ? mergeCapabilities(bridge.info.capabilities, null, grants)
      : mergeCapabilities({ edit: false, draft: false, publish: false }, null, grants);

  return (Object.keys(TOOL_REQUIREMENTS) as StudioToolId[]).map((id) => ({
    id,
    label: TOOL_TITLES[id],
    available: toolIsAvailable(id, caps),
  }));
}
