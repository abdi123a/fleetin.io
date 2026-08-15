import { useEffect, type ReactNode } from 'react';

import { STORAGE_KEYS } from '@/config/storage';
import { useBranding, useOrganization } from '@/features/settings';
import { useThemeStore } from '@/stores';

/**
 * Applies the parts of branding that live outside React's tree.
 *
 * The favicon and the document title are attributes of the page itself, not of
 * any component, so uploading a new mark under Settings → Branding has to
 * reach out and set them. Both run as effects here rather than in a component
 * that might unmount.
 *
 * The theme default is subtler: it must only apply to somebody who has never
 * chosen. A stored preference is the user's, and a workspace default has no
 * business overruling it — so the check is on the presence of the persisted
 * key, not on its value.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const branding = useBranding();
  const org = useOrganization();

  useEffect(() => {
    const href = branding.resolvedFaviconSrc;
    if (!href) return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [branding.resolvedFaviconSrc]);

  useEffect(() => {
    // Only the bare title — a page with its own title appends to it through
    // `useDocumentTitle` and would otherwise fight this effect.
    if (!document.title || document.title === 'FLEETIN') {
      document.title = org.tradingName;
    }
  }, [org.tradingName]);

  useEffect(() => {
    const hasOwnPreference = window.localStorage.getItem(STORAGE_KEYS.theme) != null;
    if (hasOwnPreference) return;
    useThemeStore.getState().setMode(branding.defaultTheme);
  }, [branding.defaultTheme]);

  return <>{children}</>;
}
