import { ChevronDown } from '@/design-system/icons';

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from 'react';

import { IconButton } from '@/design-system/primitives/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/design-system/primitives/Collapsible';
import { Skeleton } from '@/design-system/primitives/Skeleton';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * SectionHeader
 * ------------------------------------------------------------------------- */

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Section title. */
  title?: ReactNode;
  /** Supporting description below title. */
  description?: ReactNode;
  /** Action nodes rendered in the trailing slot. */
  actions?: ReactNode;
  /** Whether to render the bottom border divider. Default false. */
  divider?: boolean;
  /** Renders the collapse chevron button — managed by Section. */
  collapsible?: boolean;
  /** Whether the section is currently open — managed by Section. */
  isOpen?: boolean;
}

export const SectionHeader = forwardRef<HTMLDivElement, SectionHeaderProps>(
  function SectionHeader(
    { title, description, actions, divider = false, collapsible, isOpen, className, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-start justify-between gap-4',
          divider && 'border-b border-border pb-4',
          className,
        )}
        {...props}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          {title && (
            <h2 className="type-body-lg text-foreground">{title}</h2>
          )}
          {description && (
            <p className="type-body-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {collapsible && (
            <CollapsibleTrigger asChild>
              <IconButton variant="ghost" size="sm" aria-label={isOpen ? 'Collapse' : 'Expand'}>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')}
                />
              </IconButton>
            </CollapsibleTrigger>
          )}
        </div>
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * SectionBody
 * ------------------------------------------------------------------------- */

export const SectionBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SectionBody({ className, children, ...props }, ref) {
    return (
      <div ref={ref} className={cn('min-w-0', className)} {...props}>
        {children}
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * Section
 * ------------------------------------------------------------------------- */

export interface SectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Section title. */
  title?: ReactNode;
  /** Supporting description. */
  description?: ReactNode;
  /** Action nodes rendered in the header trailing slot. */
  actions?: ReactNode;
  /** Renders a divider line below the header. Default false. */
  divider?: boolean;
  /** Whether the section body can be collapsed. Default false. */
  collapsible?: boolean;
  /** Initial open state when collapsible. Default true. */
  defaultOpen?: boolean;
  /** Sticks the header to the top of the scroll container. Default false. */
  stickyHeader?: boolean;
  /** Vertical gap between header and body. Default 'md'. */
  gap?: 'sm' | 'md' | 'lg';
}

const gapClasses = { sm: 'gap-3', md: 'gap-4', lg: 'gap-6' };

export const Section = forwardRef<HTMLDivElement, SectionProps>(function Section(
  {
    title,
    description,
    actions,
    divider = false,
    collapsible = false,
    defaultOpen = true,
    stickyHeader = false,
    gap = 'md',
    className,
    children,
    ...props
  },
  ref,
) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasHeader = Boolean(title || description || actions);

  const header = hasHeader && (
    <div
      className={cn(
        stickyHeader && 'sticky top-0 z-10 bg-background',
      )}
    >
      <SectionHeader
        title={title}
        description={description}
        actions={actions}
        divider={divider}
        collapsible={collapsible}
        isOpen={isOpen}
      />
    </div>
  );

  if (collapsible) {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className={cn('flex flex-col', gapClasses[gap], className)}
        {...props}
      >
        {header}
        <CollapsibleContent>
          <SectionBody>{children}</SectionBody>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div ref={ref} className={cn('flex flex-col', gapClasses[gap], className)} {...props}>
      {header}
      <SectionBody>{children}</SectionBody>
    </div>
  );
});

/* ---------------------------------------------------------------------------
 * SectionSkeleton
 * ------------------------------------------------------------------------- */

export interface SectionSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of skeleton rows rendered in the body. Default 3. */
  rows?: number;
}

export function SectionSkeleton({ rows = 3, className, ...props }: SectionSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} role="presentation" aria-hidden {...props}>
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64" shape="text" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => `row-${i}`).map((k) => (
          <Skeleton key={k} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
