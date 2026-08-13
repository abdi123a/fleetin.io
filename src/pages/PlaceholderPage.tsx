import { Construction, type LucideIcon } from '@/design-system/icons';


import { EmptyState, PageHeader } from '@/components';
import { useDocumentTitle } from '@/hooks';

/**
 * PlaceholderPage — the Phase 1 body for every registered module.
 *
 * Exists so the eleven routes prove out the shell (layout, breadcrumbs, title,
 * theming) without any of them pretending to have functionality. Each module
 * replaces this with its real content in Phase 2; the page component and its
 * route entry stay exactly where they are.
 */

export interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** One-line note about what this module will contain. */
  upcoming?: string;
}

export function PlaceholderPage({
  title,
  description,
  icon = Construction,
  upcoming,
}: PlaceholderPageProps) {
  useDocumentTitle(title);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="rounded-md border border-border bg-surface shadow-xs">
        <EmptyState
          icon={icon}
          title={`${title} module`}
          description={
            upcoming ??
            'This module is registered in the application shell. Its screens are delivered in Phase 2.'
          }
        />
      </div>
    </div>
  );
}
