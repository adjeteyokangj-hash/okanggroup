import { createContext, useContext, type ReactNode } from 'react';
import type { CmsSelection } from '../lib/opswatchCmsSelection';
import type { MarketingPageContent, MarketingSiteChrome } from '../lib/opswatchMarketing';

export type OpsWatchStudioBridge = {
  page: MarketingPageContent | null;
  chrome: MarketingSiteChrome | null;
  chromeMode: boolean;
  moduleCode: string;
  selection: CmsSelection;
  setSelection: (sel: CmsSelection) => void;
  dirty: boolean;
  viewport: 'desktop' | 'tablet' | 'mobile';
  setViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;
  canEdit: boolean;
  canPublish: boolean;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onRollback: () => void;
};

const Ctx = createContext<OpsWatchStudioBridge | null>(null);

export function OpsWatchStudioBridgeProvider({
  value,
  children,
}: {
  value: OpsWatchStudioBridge | null;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOpsWatchStudioBridge() {
  return useContext(Ctx);
}
