import type { ReactNode } from 'react';

import { cn } from '@/utils';

/**
 * PageHeader — the title block every page opens with.
 *
 * Gives all modules an identical heading rhythm and one `<h1>` per page.
 * The teal, semibold title matches the platform's page headings.
 */

export interface PageHeaderProps {
  title: string;
  /** Supporting sentence under the title. */
  description?: string;
  /** Primary/secondary actions, right-aligned on wide screens. */
  actions?: ReactNode;
  /** Chip or status element rendered beside the title. */
  badge?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, badge, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-bold tracking-tight text-primary">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
