import { Check, X } from '@/design-system/icons';

import type { ReactNode } from 'react';

import { cn } from '@/utils';

/**
 * GuidelineList — paired do / don't guidance.
 *
 * Rules are shown side by side because a "don't" is only useful next to the
 * thing you should do instead. Colour is never the sole carrier of meaning:
 * each column has an icon and a text heading as well.
 */

export interface Guideline {
  /** What to do. */
  do: ReactNode;
  /** The matching thing to avoid. */
  dont: ReactNode;
}

export interface GuidelineListProps {
  guidelines: Guideline[];
  className?: string;
}

export function GuidelineList({ guidelines, className }: GuidelineListProps) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      <GuidelineColumn
        tone="do"
        title="Do"
        items={guidelines.map((guideline) => guideline.do)}
      />
      <GuidelineColumn
        tone="dont"
        title="Don't"
        items={guidelines.map((guideline) => guideline.dont)}
      />
    </div>
  );
}

function GuidelineColumn({
  tone,
  title,
  items,
}: {
  tone: 'do' | 'dont';
  title: string;
  items: ReactNode[];
}) {
  const isDo = tone === 'do';
  const Icon = isDo ? Check : X;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border bg-surface',
        isDo ? 'border-success/30' : 'border-destructive/30',
      )}
      aria-label={title}
    >
      <header
        className={cn(
          'flex items-center gap-2 border-b px-4 py-2.5',
          isDo
            ? 'border-success/30 bg-success-subtle text-success-subtle-foreground'
            : 'border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <h4 className="type-h4">{title}</h4>
      </header>

      <ul className="divide-y divide-border-subtle">
        {items.map((item, index) => (
          // Guidelines are static config with no stable id; index is the only
          // key available and the list never reorders.
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="px-4 py-2.5 type-body-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
