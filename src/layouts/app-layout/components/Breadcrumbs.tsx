import { ChevronRight } from '@/design-system/icons';

import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { useBreadcrumbs } from '@/hooks';
import { cn } from '@/utils';

/**
 * Breadcrumbs — the trail for the current route.
 *
 * Derived entirely from the URL and the navigation config (see
 * `useBreadcrumbs`), so pages never declare their own trail and it can never
 * fall out of step with the route.
 */

export interface BreadcrumbsProps {
  className?: string;
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
  const items = useBreadcrumbs();

  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {items.map((item, index) => (
          <Fragment key={item.path ?? item.label}>
            {index > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}

            <li className="min-w-0">
              {item.isCurrent || !item.path ? (
                <span
                  aria-current={item.isCurrent ? 'page' : undefined}
                  className="block truncate font-medium text-foreground"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className={cn(
                    'block truncate text-muted-foreground transition-colors duration-fast',
                    'hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
