import type { ReactNode } from 'react';

import * as Popover from '@radix-ui/react-popover';

import { HelpCircle } from '@/design-system/icons';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * HelpHint
 * ---------------------------------------------------------------------------
 * The explanation a screen owes the reader, folded behind a mark they can
 * choose to open.
 *
 * Forms in this app had grown paragraphs — a five-line note above the
 * transporter list explaining how the scoring works, a sentence under half the
 * fields explaining what the field was for. Every one of them was true and
 * useful the first time, and noise on the four hundredth: the operator filling
 * their tenth shipment of the day reads past a wall of grey to find the two
 * controls they came for.
 *
 * So the prose moves in here. The mark sits beside the label it belongs to, the
 * text is one click away, and the form goes back to being a form.
 *
 * ## When NOT to use this
 *
 * A hint is for *explanation* — how a score is computed, why a field exists,
 * what a term means. It is not for anything the reader must know **before**
 * acting: a warning, a consequence, a required format. Those stay on the page,
 * because a caution nobody opens is a caution nobody reads.
 * ------------------------------------------------------------------------- */

export interface HelpHintProps {
  /** What the reader sees on opening. Plain sentences, no headings. */
  children: ReactNode;
  /** Names the mark for screen readers — "How the score works". */
  label: string;
  className?: string;
}

export function HelpHint({ children, label, className }: HelpHintProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          /* `type="button"`: these live inside the create-shipment form, and a
             bare button in a form submits it. */
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            className,
          )}
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          /* Centred on the mark, not aligned to its left edge. These open from
             inside a 448px side sheet, and a 288px panel anchored at `start`
             hung off toward the middle of the screen with its arrow pointing
             back at a mark it had left behind. Centred, it stays under the
             thing it explains. */
          align="center"
          sideOffset={6}
          collisionPadding={12}
          /* `z-modal`: these open from inside side sheets and wizards, which
             carry their own stacking context — anything lower renders behind
             the panel that opened it. */
          className="z-modal w-64 rounded-card-nested border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground shadow-lg"
        >
          {children}
          <Popover.Arrow className="fill-card" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
