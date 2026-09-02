import type { ElementType, ReactNode } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * SheetHeading
 * ---------------------------------------------------------------------------
 * The top of every side sheet in the app.
 *
 * Six panels had grown their own copy of the same block — the shipment wizard,
 * both onboarding forms, the driver, vehicle and location editors — each with
 * the same class string retyped and each drifting slightly: `pt-6 sm:pt-8`
 * against a flat `pb-4`, a `pr-8` hand-measured to dodge the close button, a
 * title that wrapped under the avatar beside it on a narrow sheet.
 *
 * ## What this fixes, and why the numbers are what they are
 *
 * - **Symmetric padding.** `px-6 py-5 sm:px-8` — the same gutter the sheet's
 *   scrolling body uses, so the title sits on the same left edge as the fields
 *   under it rather than a few pixels off. The old `pt-8 pb-4` made the header
 *   look top-heavy and pushed the first field into the rule above it.
 * - **`pr-12`, not `pr-8`.** The close button is a 40px target inset 8px from
 *   the corner; 8 units (32px) left the longest titles tucking under it.
 * - **The trailing slot is a sibling of the title, not an overlay.** Anything
 *   that has to sit up there — the wizard's assignee avatar — takes real space
 *   in a flex row, so a long title shortens instead of colliding with it.
 * ------------------------------------------------------------------------- */

export interface SheetHeadingProps {
  /** The panel's name. Short — this is a title, not a sentence. */
  title: ReactNode;
  /** One line under it saying what this step or panel is for. */
  description?: ReactNode;
  /** A badge or tag that qualifies the title, rendered inline after it. */
  badge?: ReactNode;
  /** A control pinned to the title's right — an assignee, a menu. */
  trailing?: ReactNode;
  /** Anything that belongs under the title inside the header: a stepper. */
  children?: ReactNode;
  /**
   * What renders the title and the description.
   *
   * Sheets split two ways on this. A wizard puts an `sr-only` `SheetTitle`
   * elsewhere and draws its own visible heading, so a plain `h2`/`p` is right.
   * A simpler panel has no second title, so its visible one has to *be* the
   * Radix `SheetTitle` that the dialog's `aria-labelledby` points at —
   * otherwise the sheet announces itself as nothing. Passing the components in
   * lets both keep their markup while sharing one set of styles.
   */
  titleComponent?: ElementType;
  descriptionComponent?: ElementType;
  className?: string;
}

export function SheetHeading({
  title,
  description,
  badge,
  trailing,
  children,
  titleComponent: Title = 'h2',
  descriptionComponent: Description = 'p',
  className,
}: SheetHeadingProps) {
  return (
    <div
      className={cn(
        'shrink-0 space-y-4 border-b border-border/60 px-6 py-5 sm:px-8',
        className,
      )}
    >
      <div className="space-y-1 pr-12">
        <div className="flex items-start justify-between gap-3">
          <Title className="min-w-0 text-lg font-extrabold leading-tight tracking-tight text-foreground">
            <span className="flex flex-wrap items-center gap-2">
              {title}
              {badge}
            </span>
          </Title>
          {trailing && <div className="mt-0.5 shrink-0">{trailing}</div>}
        </div>
        {description && (
          <Description className="text-xs leading-snug text-muted-foreground">
            {description}
          </Description>
        )}
      </div>
      {children}
    </div>
  );
}
