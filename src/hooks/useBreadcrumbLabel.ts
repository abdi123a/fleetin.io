import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBreadcrumbLabelStore } from '@/stores/breadcrumbLabel.store';

/**
 * Overrides the current page's breadcrumb segment with a human-readable
 * label (e.g. a loaded entity's name) instead of the raw URL segment.
 * Pass `undefined` while the entity is still loading — no override is set
 * until a real label is available, and it is cleared on unmount so a stale
 * label never leaks onto a different page.
 */
export function useBreadcrumbLabel(label: string | undefined) {
  const { pathname } = useLocation();
  const setOverride = useBreadcrumbLabelStore((state) => state.setOverride);
  const clearOverride = useBreadcrumbLabelStore((state) => state.clearOverride);

  useEffect(() => {
    if (label) setOverride(pathname, label);
    return () => clearOverride(pathname);
  }, [pathname, label, setOverride, clearOverride]);
}
