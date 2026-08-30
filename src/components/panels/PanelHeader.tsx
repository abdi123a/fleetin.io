import type { ReactNode } from 'react';
import { Pencil } from '@/design-system/icons';
import { Button, VerificationBadge } from '@/design-system';
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
  className,
}: PanelHeaderProps) {
  const mark =
    badge ?? (verified === undefined ? null : <VerificationBadge state={verified ? 'verified' : 'unverified'} size="lg" />);

  return (
    /* `pr-10` keeps the control clear of the sheet's own close button, which is
       absolutely positioned in this same corner. */
    <div className={cn('flex items-start justify-between gap-4 pr-10', className)}>
      <div className="flex min-w-0 items-start gap-4">
        {media}
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere] line-clamp-2">
              {title}
            </h3>
            {/* `mt-1` centres the mark on the *first* line, so it reads the
                same beside a one-line plate and a two-line company name. */}
            {mark && <span className="mt-1 shrink-0">{mark}</span>}
          </div>
          {subtitle && (
            <p className="text-xs leading-snug text-muted-foreground line-clamp-2">{subtitle}</p>
          )}
          {status && <div className="pt-1">{status}</div>}
        </div>
      </div>

      {actions ??
        (onEdit && !editing && (
          /* Editing is one control in the corner, not a destination in a tab
             bar. `self-center`, not the row's `items-start`: the sheet's own
             close button sits 8px higher than this row's content box, so
             top-aligning left the two almost — but not quite — level, which
             reads as a mistake. Centred on the media block it is deliberate. */
          /* Ghost, not outlined. A bordered pill beside the record's own name
             competed with it — two boxed things at the top of the panel, and
             the louder one was the secondary action. Editing is available, not
             announced: it recedes to a quiet glyph-and-word and comes forward
             on hover, the way a corner action should. */
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
            className="h-8 shrink-0 self-center px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Edit
          </Button>
        ))}
    </div>
  );
}
