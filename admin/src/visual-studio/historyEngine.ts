import { useCallback, useState } from 'react';

type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

/**
 * Session undo/redo for Visual Studio edits (text, style, layout, media fields).
 * Does not replace server-side publish/rollback history.
 */
export function useHistoryEngine<T>(initial: T, max = 50) {
  const [hist, setHist] = useState<HistoryState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback(
    (next: T) => {
      setHist((h) => ({
        past: [...h.past.slice(-(max - 1)), h.present],
        present: next,
        future: [],
      }));
    },
    [max],
  );

  const replace = useCallback((next: T) => {
    setHist((h) => ({ ...h, present: next }));
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.past.length) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present],
        present: next,
        future: rest,
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setHist({ past: [], present: next, future: [] });
  }, []);

  return {
    present: hist.present,
    commit,
    replace,
    undo,
    redo,
    reset,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
  };
}
