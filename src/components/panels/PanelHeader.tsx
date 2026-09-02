import type { ReactNode } from 'react';
import { Pencil } from '@/design-system/icons';
import { CloseButton, cornerActionClasses, SheetClose, Tooltip, VerificationBadge } from '@/design-system';
import { cn } from '@/utils';

export interface PanelHeaderProps {
  /** Avatar, company logo or `IconChip` — whatever identifies this record at a glance. */
  media?: ReactNode;
  title: ReactNode;
  /** Reference, model, sector — the quiet line under the name. */
  subtitle?: ReactNode;
  /** Sits inline after the name. `verified` is the shorthand for the common case. */
  badge?: ReactNode;
  /** Renders the standard verification tick beside the name. Ignored when `badge` is given. */
  verified?: boolean;
  /** The status pill, on its own line under the subtitle. */
  status?: ReactNode;
  /** Turns on the Edit control. Omit on a panel with nothing to edit. */
  onEdit?: () => void;
  /** True while the panel is in its edit state — the control steps aside; see below. */
  editing?: boolean;
  /** Replaces the Edit control entirely, for a panel whose action is something else. */
  actions?: ReactNode;
  /**
   * Draw the sheet's close button as part of this header's action group.
   *
   * Pass `hideCloseButton` on the `SheetContent` when you turn this on, or the
   * sheet renders its own on top of this one. See the note on the group below
   * for why it belongs in the flow rather than floating over it.
   */
  withClose?: boolean;
  className?: string;
}

/**
 * The top of every record side panel — driver, vehicle, shipper, transporter.
 *
 * The four grew separately and showed it: one put editing in a three-tab bar,
 * one in a filled button, one in an outline button somewhere else, and one
 * offered no way to edit at all. Same kind of object, same kind of panel, four
 * different answers to "how do I change this". They share this header now, so
 * the identity block and the Edit control are in the same place and the same
 * shape wherever the reader opens one.
 *
 * ## The Edit control disappears while editing
 *
 * It used to become "Done", which sat a few centimetres above the form's own
 * "Save" and quietly discarded everything instead of saving it — two controls
 * that looked like one decision. While a panel is editing, its form owns the
 * ending: Cancel goes back, Save commits, and the corner is empty.
 *
 * ## What the header does not repeat
 *
 * `status` takes the pill and nothing else. The driver panel briefly carried
 * its star rating here too, which wrapped onto a second line at the panel's
 * width and read as ragged — and said 4.1 twice, since the Performance block
 * immediately below leads with the same number. Whatever the body already
 * states, the header does not.
 *
 * ## It is the same band as every other side sheet
 *
 * A peek panel and a form sheet are both "a side sheet with a top", and they
 * had drifted into three different tops: one hand-rolled its own bordered
 * band, two let the header float in the body's padding with nothing separating
 * it from the content. This is now the same band `SheetHeading` renders for
 * the form sheets — same gutters, same rule underneath, same close-button
 * clearance — so the two kinds of sheet open the same way.
 *
 * ## Names wrap; they are never cut
 *
 * A company name is the one thing on the panel the reader is checking they
 * opened the right record. Truncating it to "Al Wahda Trad…" saves a line and
 * costs the only fact that mattered, so the title runs to two lines instead
 * and the badge stays pinned beside it.
 */
export function PanelHeader({
  media,
  title,
  subtitle,
  badge,
  verified,
  status,
  onEdit,
  editing = false,
  actions,
  withClose = false,
  className,
}: PanelHeaderProps) {
  const mark =
    badge ?? (verified === undefined ? null : <VerificationBadge state={verified ? 'verified' : 'unverified'} size="lg" />);

  return (
    /* The same band every other side sheet's top is: `border-b`, the same
       gutters as the body under it, and `pr-14` to clear the sheet's own close
       button — 34px of control inset 16px from the right edge.
       See `SheetHeading`, which does this for the form sheets. */
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface-sunken px-6 py-5 sm:px-8',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {/* One size for every kind of mark.
         *
         * The four panels passed their own: a 64px driver avatar, a 56px
         * company logo, a 44px icon chip. So the title started at a different
         * x on each one and the header was a different height on each one —
         * which is most of why they did not read as the same component. The
         * box is fixed here and whatever is handed in fills it. */}
        {media && <div className="size-11 shrink-0 [&>*]:size-full">{media}</div>}
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 text-lg font-extrabold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere] line-clamp-2">
              {title}
            </h3>
            {/* `mt-0.5` centres the mark on the *first* line, so it reads the
                same beside a one-line plate and a two-line company name. */}
            {mark && <span className="mt-0.5 shrink-0">{mark}</span>}
          </div>

          {/* Reference and status share a line.
           *
           * They were stacked, which — under a title and above the panel's
           * first action — made four separate rows of small things marching
           * down the top-left corner, none of them related to the one above
           * it. They belong together: both answer "which record is this and
           * what state is it in", and neither is wide. The dot only appears
           * when there is something on each side of it. */}
          {(subtitle || status) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {subtitle && (
                <span className="min-w-0 text-xs leading-snug text-muted-foreground">
                  {subtitle}
                </span>
              )}
              {/* No separator between the two.
               *
               * A dot here was orphaned the moment the status wrapped to its
               * own line — the reference ended "DRV-00063 ·" with nothing
               * after it, and the pill sat underneath looking unattached. The
               * pill already has an outline and a colour of its own; a dot in
               * front of it was chrome doing a job the shape had done. */}
              {status}
            </div>
          )}
        </div>
      </div>

      {/* Edit and Close are one pair, in one shape.
       *
       * They were two unrelated controls that happened to land near each
       * other: Edit a borderless label inside the band, Close a bordered box
       * absolutely positioned at `top-4` over it — different shape, different
       * weight, 4px apart vertically. Near-level reads as a mistake in a way
       * that clearly-offset does not.
       *
       * Both are icon-only now and both wear `cornerActionClasses`, the close
       * button's own style. Edit dropped its word rather than Close gaining a
       * border: at this size a label made the pair lopsided, and a pencil in
       * the corner of a record panel needs no caption. The name survives as
       * the tooltip and the accessible name.
       *
       * They sit in the layout rather than floating over it, which is why the
       * band no longer reserves a `pr-14` corner for the close to hover in. */}
      {/* `mt-[5px]` centres the 34px pair on the 44px mark opposite them.
          Anchored to the top rather than `items-center` on the row: a long
          company name wraps to two lines, and a corner control that slid to
          the middle of a taller block would stop reading as a corner. */}
      <div className="mt-[5px] flex shrink-0 items-center gap-2">
        {actions ??
          (onEdit && !editing && (
            <Tooltip content="Edit">
              <button type="button" aria-label="Edit" onClick={onEdit} className={cornerActionClasses}>
                <Pencil className="h-4 w-4" />
              </button>
            </Tooltip>
          ))}

        {withClose && (
          <SheetClose asChild>
            <CloseButton />
          </SheetClose>
        )}
      </div>

    </div>
  );
}
