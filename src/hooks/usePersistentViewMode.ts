import { useEffect, useState } from 'react';

export type ViewMode = 'panel' | 'table';

const isViewMode = (value: string | null): value is ViewMode =>
  value === 'panel' || value === 'table';

export const usePersistentViewMode = (
  storageKey: string,
  defaultViewMode: ViewMode
) => {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') {
      return defaultViewMode;
    }

    const storedValue = window.localStorage.getItem(storageKey);
    return isViewMode(storedValue) ? storedValue : defaultViewMode;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, viewMode);
  }, [storageKey, viewMode]);

  return [viewMode, setViewMode] as const;
};
