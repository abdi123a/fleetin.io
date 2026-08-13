import { ChevronRight } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Breadcrumb types
 * ------------------------------------------------------------------------- */

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

/* ---------------------------------------------------------------------------
 * PageHeaderBlock
 * ---------------------------------------------------------------------------
 * Standalone composable page header with breadcrumbs, title, description,
 * status badge, primary action, secondary actions, and an optional tabs slot.
 * This is the LAYOUT-SYSTEM primitive. It has no dependency on the app shell's
 * PageHeader component in src/components/.
 * ------------------------------------------------------------------------- */

export interface PageHeaderBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Page title. */
  title: ReactNode;
  /** Supporting description below the title. */
  description?: ReactNode;
  /** Breadcrumb trail rendered above the title. */
  breadcrumbs?: BreadcrumbItem[];
  /** Status badge or indicator node. */
  badge?: ReactNode;
  /** Primary action button(s). */
  actions?: ReactNode;
  /** Secondary action nodes (icon buttons, menus, etc.) */
  secondaryActions?: ReactNode;
  /** Tab navigation rendered in the bottom slot. */
  tabs?: ReactNode;
  /** Stacks the action row below the title on small screens. Default true. */
  responsive?: boolean;
}

export const PageHeaderBlock = forwardRef<HTMLDivElement, PageHeaderBlockProps>(
  function PageHeaderBlock(
    {
      title,
      description,
      breadcrumbs,
      badge,
      actions,
      secondaryActions,
      tabs,
      responsive = true,
      className,
      ...props
    },
    ref,
  ) {
    return (
      <div ref={ref} className={cn('flex flex-col gap-1', className)} {...props}>
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1 type-body-xs text-muted-foreground">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <li key={crumb.label} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                    {isLast ? (
                      <span className="font-medium text-foreground" aria-current="page">
                        {crumb.label}
                      </span>
                    ) : crumb.href ? (
                      <a
                        href={crumb.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {/* Title row */}
        <div
          className={cn(
            'flex gap-4',
            responsive
              ? 'flex-col items-start sm:flex-row sm:items-start sm:justify-between'
              : 'flex-row items-start justify-between',
          )}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-display-sm font-bold text-foreground truncate">{title}</h1>
              {badge}
            </div>
            {description && (
              <p className="type-body-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {/* Actions */}
          {(actions || secondaryActions) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {secondaryActions}
              {actions}
            </div>
          )}
        </div>

        {/* Tabs slot */}
        {tabs && <div className="mt-2">{tabs}</div>}
      </div>
    );
  },
);
