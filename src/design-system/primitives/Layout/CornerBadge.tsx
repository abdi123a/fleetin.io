import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * CornerBadge
 * ---------------------------------------------------------------------------
 * The Shipment# / Booking# tag that sits flush in a card's top-left corner.
 *
 * Shape: a square-cornered tab block with rounded bottom-right corner —
 * reads as an integrated top tab cut into the card. The top-left corner
 * is clipped smoothly by the parent card's `overflow-hidden`.
 * ------------------------------------------------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-bold tracking-wide z-raised transition-all select-none shadow-2xs',
  {
    variants: {
      intent: {
        /** Brand primary teal — standard Booking / Shipment ID tag */
        teal: 'bg-primary text-primary-foreground border-b border-r border-primary-strong/20',
        /** Accent orange — secondary Shipment tag stacked under a Booking tag */
        orange: 'bg-accent text-accent-foreground border-b border-r border-accent-strong/20',
        /** Green — the container is loaded and moving */
        green: 'bg-success text-success-foreground border-b border-r border-success-strong/20',
        /**
         * The later rung of a phase — see `--success-deep` / `--warning-deep`.
         *
         * The tab used to fold these onto their phase, so a card at "Delivered"
         * and a card at "Picked Up" wore the same tab while the picker inside
         * each drew them a step apart. The ramp is the point: hue says the
         * phase, depth says how far into it, and a mark that drops the depth is
         * a mark that only tells half of what it knows.
         */
        'green-deep': 'bg-success-deep text-success-deep-foreground border-b border-r border-success-deep/20',
        'orange-deep': 'bg-warning-deep text-warning-deep-foreground border-b border-r border-warning-deep/20',
        /** Blue — info tag */
        blue: 'bg-info text-info-foreground border-b border-r border-info-strong/20',
        /** Red — the rung that needs watching (Unstuffing). */
        red: 'bg-destructive text-destructive-foreground border-b border-r border-destructive/20',
        /** Neutral — de-emphasised tag */
        neutral: 'bg-secondary text-secondary-foreground border-b border-r border-border',
        /**
         * Ink — a container that is home and a job that is closed.
         *
         * The container scale's third state (`--container-returned`), so a
         * finished booking's tab is the same mark as its tag. Not `neutral`:
         * that is a de-emphasised grey, and a finished booking washed out
         * against a white card until you could not tell it from an unstyled one.
         */
        ink: 'bg-container-returned text-container-returned-foreground border-b border-r border-container-returned-border',
        /** Purple — premium / special route tag */
        purple: 'bg-chart-5 text-white border-b border-r border-chart-5/30',
      },
      size: {
        sm: 'px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        md: 'px-3 py-1 text-xs font-bold uppercase tracking-wider',
        lg: 'px-3.5 py-1.5 text-sm font-extrabold uppercase tracking-wider',
      },
      position: {
        /** Top-most badge, flush into the card's top-left corner. */
        top: 'rounded-br-lg',
        /** Second badge stacked directly beneath the first. */
        second: 'rounded-br-lg mt-[2px]',
        /** Detached from any corner — rounds on all sides. */
        inline: 'rounded-md',
      },
    },
    defaultVariants: {
      intent: 'teal',
      size: 'md',
      position: 'top',
    },
  },
);

export interface CornerBadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * The tab's text — one fact, the reference this card is looked up by.
   *
   * `string`, deliberately. This was widened to `ReactNode` so the shipment row
   * could stack its cargo type under the reference in one tab; that put the
   * page's smallest, faintest text inside its heaviest element and pushed the
   * card body down to clear the second line. The type belongs with the card's
   * other facts, not in its identifier. Kept narrow so the next caller cannot
   * quietly reintroduce a two-fact tab.
   */
  label: string;
  icon?: ReactNode;
}

export const CornerBadge = forwardRef<HTMLDivElement, CornerBadgeProps>(
  function CornerBadge({ label, icon, intent, size, position, className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ intent, size, position }), className)}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{label}</span>
      </div>
    );
  },
);

