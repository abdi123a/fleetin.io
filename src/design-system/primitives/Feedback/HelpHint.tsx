import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

import { Info } from '../../icons';
import { cn } from '@/utils';

/**
 * How the system works, folded away until somebody asks.
 *
 * Explanatory text is written for the reader's first day and re-read by
 * everybody else for the rest of the product's life. Left on the page it is a
 * paragraph of grey between two things somebody came here to do — and because
 * it never changes, it stops being read within a week, which is the worst of
 * both: it costs the space and teaches nobody.
 *
 * Behind a mark it is the opposite. The person who needs it can find it every
 * time, in the same place, next to the thing it explains; the person who does
 * not never pays for it again.
 *
 * A click, not a hover. A tooltip is for a label too short to say itself —
 * three lines about how two records stay in step is something somebody chooses
 * to read, and hover has no answer on a touch screen.
 */
export function HelpHint({
  children,
  label = 'How this works',
  align = 'start',
  side = 'bottom',
  className,
}: {
  children: ReactNode;
  /** The accessible name — what this explains, not "help". */
  label?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground',
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-popover max-w-xs rounded-md border border-border bg-surface p-3 shadow-md',
            'text-xs leading-relaxed text-muted-foreground animate-zoom-in focus:outline-none',
          )}
        >
          {children}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
