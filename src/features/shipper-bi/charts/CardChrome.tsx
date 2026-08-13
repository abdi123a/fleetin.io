import type { ReactNode } from 'react';
import { cn } from '@/utils';
import { IconChip } from '@/design-system';

/**
 * The heading every card in the control tower wears.
 *
 * One component rather than six copies of the same flex row, because the thing
 * that makes a dashboard read as one surface is that every card starts the same
 * way — same chip, same title size, same baseline. When that lives in each card
 * it drifts within a release.
 *
 * The chip is the system's solid disc rather than a tinted wash: at 36px
 * it is the only mark on the card competing with the headline figure, and a
 * subtle tint at that size reads as a smudge. Solid also survives the theme
 * flip — near-black on light, near-white on dark — without a second rule.
 */

export function CardIcon({ children }: { children: ReactNode }) {
  return (
    <IconChip size={36}>{children}</IconChip>
  );
}

export interface CardHeadingProps {
  title: string;
  /** One clause of context. Never a restatement of the title. */
  subtitle?: string;
  icon?: ReactNode;
  /** Rendered right — a range chip, a series toggle, a link. Never a filter. */
  actions?: ReactNode;
  /** For `aria-labelledby` on the card that owns this heading. */
  titleId?: string;
  className?: string;
}

export function CardHeading({
  title,
  subtitle,
  icon,
  actions,
  titleId,
  className,
}: CardHeadingProps) {
  return (
    /* Wrapping, not shrinking: a title beside a wide action chip in a narrow
       column would otherwise truncate to "Logi…" while the chip kept its full
       width. The basis lets the actions drop to their own line first. */
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {icon ? <CardIcon>{icon}</CardIcon> : null}

      <div className="min-w-0 flex-1 basis-32">
        <h3
          id={titleId}
          className="truncate text-[15px] font-semibold leading-tight text-foreground"
        >
          {title}
        </h3>
        {subtitle ? (
          /* The subtitle is the one clause explaining what the card measures,
             so on a phone it wraps to a second line rather than losing its verb
             to an ellipsis. From `sm` up the column is wide enough that a single
             clipped line is the tidier choice, and that is what it stays. */
          <p
            className="mt-0.5 text-xs leading-snug text-muted-foreground sm:truncate"
            title={subtitle}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        /* Capped at the line width so a wide actions group — a search field
           next to a status select, say — wraps inside itself instead of
           pushing the card wider than the screen. Unchanged wherever it fits. */
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  );
}
