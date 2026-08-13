import type { ReactNode } from 'react';

import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';

/**
 * ShowcaseExample — a live demo with the code that produced it.
 *
 * The preview and the snippet sit in one component so a reader never has to
 * guess which code made which result. The snippet is authored by hand rather
 * than derived from the JSX: generated snippets end up showing internal props
 * and wrapper elements that a consumer would never write.
 */

export interface ShowcaseExampleProps {
  /** Short title for the example. */
  title?: string;
  /** What this example demonstrates, or when to use it. */
  description?: ReactNode;
  /** The rendered demo. */
  children: ReactNode;
  /** Copy-pasteable usage. */
  code?: string;
  /** Stacks the demo items vertically instead of wrapping in a row. */
  layout?: 'row' | 'column' | 'bare';
  /** Renders the preview on the page canvas rather than the surface colour. */
  canvas?: boolean;
  className?: string;
}

export function ShowcaseExample({
  title,
  description,
  children,
  code,
  layout = 'row',
  canvas = false,
  className,
}: ShowcaseExampleProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-md border border-border bg-surface', className)}>
      {(title || description) && (
        <div className="shrink-0 space-y-0.5 border-b border-border px-4 py-3">
          {title && <p className="type-body-sm font-medium text-foreground">{title}</p>}
          {description && (
            <p className="type-caption text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      <div
        className={cn(
          'flex-1 p-4 sm:p-5',
          canvas ? 'bg-background' : 'bg-surface',
          layout === 'row' && 'flex flex-wrap items-center gap-3',
          layout === 'column' && 'flex flex-col items-start gap-3',
        )}
      >
        {children}
      </div>

      {code && (
        <div className="shrink-0 border-t border-border bg-surface-sunken px-4 py-2.5">
          <CopyableToken label={code} emphasis="muted" multiline />
        </div>
      )}
    </div>
  );
}

/**
 * Labels a single item inside an example row, e.g. the name of a variant.
 * Keeps demo items aligned in a column with their caption underneath.
 */
export function ShowcaseItem({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1.5', className)}>
      {children}
      <span className="type-caption text-muted-foreground">{label}</span>
    </div>
  );
}
