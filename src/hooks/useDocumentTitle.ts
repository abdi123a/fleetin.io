import { useEffect } from 'react';

import { APP_CONFIG } from '@/config/app';
import { useOrganization } from '@/features/settings';

/**
 * Sets `document.title` for the lifetime of the calling component and restores
 * the previous title on unmount.
 *
 * The suffix is the workspace's own trading name from Settings → Organization,
 * so renaming the company renames every tab — `APP_CONFIG.name` remains only as
 * the fallback for a workspace that has not been configured.
 *
 * @param title Page name; the application name is appended automatically.
 */
export function useDocumentTitle(title: string | undefined): void {
  const { tradingName } = useOrganization();

  useEffect(() => {
    if (!title) return;

    const previousTitle = document.title;
    const suffix = tradingName || APP_CONFIG.name;
    document.title = `${title} ${APP_CONFIG.titleSeparator} ${suffix}`;

    return () => {
      document.title = previousTitle;
    };
  }, [title, tradingName]);
}
