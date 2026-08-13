import { useEffect } from 'react';

import { APP_CONFIG } from '@/config/app';

/**
 * Sets `document.title` for the lifetime of the calling component and restores
 * the previous title on unmount.
 *
 * @param title Page name; the application name is appended automatically.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;

    const previousTitle = document.title;
    document.title = `${title} ${APP_CONFIG.titleSeparator} ${APP_CONFIG.name}`;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
