import { useCallback, useState } from 'react';
import { EMPTY_SELECTION, type StudioSelection } from './types';

export function useSelectionBus(adapterId: string, documentKey: string) {
  const [selection, setSelectionState] = useState<StudioSelection>(() =>
    EMPTY_SELECTION(adapterId, documentKey),
  );

  const setSelection = useCallback(
    (next: Partial<StudioSelection> | StudioSelection | null) => {
      if (!next) {
        setSelectionState(EMPTY_SELECTION(adapterId, documentKey));
        return;
      }
      setSelectionState((prev) => ({
        ...prev,
        adapterId,
        documentKey,
        ...next,
      }));
    },
    [adapterId, documentKey],
  );

  const clearSelection = useCallback(() => {
    setSelectionState(EMPTY_SELECTION(adapterId, documentKey));
  }, [adapterId, documentKey]);

  return { selection, setSelection, clearSelection };
}
