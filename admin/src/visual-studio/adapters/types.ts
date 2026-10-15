import type {
  StudioAdapterInfo,
  StudioCapability,
  StudioLayerNode,
  StudioPatch,
  StudioSelection,
  StudioTargetType,
} from '../types';

export type StudioAdapterBridge = {
  info: StudioAdapterInfo;
  /** Build layers tree for the current document. */
  getLayers: () => StudioLayerNode[];
  /** Map selection to tools that should auto-open. */
  toolsForSelection: (selection: StudioSelection) => string[];
  /** Whether a target type is supported. */
  supportsTarget: (type: StudioTargetType) => boolean;
  /** Apply a patch to local draft state (adapter-specific). */
  applyPatch?: (patch: StudioPatch) => void;
};

export function capsFromFlags(
  id: string,
  label: string,
  caps: Partial<Record<StudioCapability, boolean>>,
): StudioAdapterInfo {
  return { id, label, capabilities: caps };
}
