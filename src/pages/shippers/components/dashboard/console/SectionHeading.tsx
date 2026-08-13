import type { ReactNode } from 'react';
import { cn } from '@/utils';

/**
 * The divider between one act of the dashboard and the next.
 *
 * The page used to be eight panels in a row with no stated order, which left a
 * reader to work out for themselves which two of them were urgent and which
 * five were background. Each act now opens with a number, a title and the
 * question it answers, in that order, so the page can be read top to bottom as
 * a sentence: where things are, what needs you, how it is going, what it costs.
 *
 * The numbered chip is the only ornament, and it carries the act's colour —
 * teal for the acts that report, orange for the one that asks for something.
 * A reader who scrolls past a teal number has skipped a summary; a reader who
 * scrolls past the orange one has skipped a bill.
 */

export interface SectionHeadingProps {
  /** Position in the narrative — rendered as the chip. */
  step: number;
  title: string;
  /** The plain-language question this act answers. */
  question: string;
  tone?: 'brand' | 'attention';
  action?: ReactNode;
}

export function SectionHeading({
  step,
  title,
  question,
  tone = 'brand',
  action,
}: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={cn(
            'type-body-sm flex size-9 shrink-0 items-center justify-center rounded-lg font-bold tabular-nums',
            tone === 'attention'
              ? 'bg-accent-bold text-accent-bold-foreground'
              : 'bg-primary-bold text-primary-bold-foreground',
          )}
          aria-hidden
        >
          {String(step).padStart(2, '0')}
        </span>

        <div className="min-w-0">
          <h2 className="type-h2 truncate text-foreground">{title}</h2>
          <p className="type-body-sm truncate text-muted-foreground">{question}</p>
        </div>
      </div>

      {action}
    </div>
  );
}
