import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Star } from '@/design-system/icons';
import { formatStars, type PerformanceSummary } from '@/lib/rating';
import { cn } from '@/utils';
import { StarRating } from './StarRating';

export interface DriverRatingRowProps {
  name: string;
  /** Driver reference or plate — the second line under the name. */
  meta?: string;
  photoUrl?: string;
  /** Sits beside the name. Small marks only — a verification tick, not a pill. */
  badge?: ReactNode;
  /** Sits on the second line beside `meta`. Dropped in the narrow layout, where the figures need that space. */
  status?: ReactNode;
  summary: PerformanceSummary;
  onOpen?: () => void;
  className?: string;
}

/**
 * One driver on a transporter's roster — the whole record in a row.
 *
 * Rating, missions and on-time, because those are the three the reader is
 * scanning the roster for. Everything else about the driver is one click away
 * in their own profile, which is what the row opens.
 *
 * ## Laid out against its own width, never the window's
 *
 * The `@[520px]` breakpoints here are **container** queries, and that is the
 * whole point. This row ships in a card the transporter dossier squeezes to
 * roughly 340px on the very same 1180px screen where the drivers page gives it
 * 900px. A `sm:` breakpoint only ever asks about the viewport, so it chose the
 * wide layout in both — and in the narrow one the fixed right-hand columns
 * (five glyphs, two figure blocks, a chevron) ate the flexible middle until the
 * driver's name was gone entirely. A roster row showing a rating, a mission
 * count and no name is worse than no row.
 *
 * Under 520px of row the figures move down to the meta line and the status chip
 * gives up its place to them. Nothing is dropped at any width; only the
 * reference and the chip, both of which the profile behind the row repeats.
 */
export function DriverRatingRow({
  name,
  meta,
  photoUrl,
  badge,
  status,
  summary,
  onOpen,
  className,
}: DriverRatingRowProps) {
  const Wrapper = onOpen ? 'button' : 'div';
  return (
    <Wrapper
      type={onOpen ? 'button' : undefined}
      onClick={onOpen}
      className={cn(
        '@container flex w-full items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2.5 text-left @[400px]:gap-3 @[400px]:px-3',
        onOpen && 'transition-colors hover:border-primary/40 hover:bg-primary/5',
        className,
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {/* Wraps rather than truncates. "Djibril Ahmed Egueh" became
              "Djibril Ahmed…" on a phone, which is not a name — and the name is
              the only reason this row exists. Two lines cost less than a
              half-word. */}
          <span className="text-xs font-bold leading-tight text-foreground @[400px]:truncate">
            {name}
          </span>
          {badge}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 pt-0.5">
          {meta && (
            <span className="hidden truncate font-mono text-[10px] text-muted-foreground @[520px]:inline">
              {meta}
            </span>
          )}
          {/* A narrow row has no column for the figures, so they ride here. */}
          <span className="min-w-0 text-[10px] leading-tight text-muted-foreground @[520px]:hidden">
            {summary.missions.toLocaleString()} missions
            {summary.onTimePct !== null && ` · ${summary.onTimePct}% on time`}
          </span>
          {status && <span className="hidden shrink-0 @[520px]:inline-flex">{status}</span>}
        </span>
      </span>

      {/* On a narrow row the name matters more than five glyphs: the strip
          collapses to one star and the number. */}
      <StarRating value={summary.overall} size="sm" className="hidden shrink-0 @[520px]:inline-flex" />
      <span className="inline-flex shrink-0 items-center gap-1 @[520px]:hidden">
        <Star aria-hidden className="size-3 text-warning fill-warning" />
        <span className="text-[11px] font-bold tabular-nums text-foreground">
          {formatStars(summary.overall)}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-4 text-right @[520px]:flex">
        <Figure value={summary.missions.toLocaleString()} label="Missions" />
        <Figure
          value={summary.onTimePct === null ? '—' : `${summary.onTimePct}%`}
          label="On Time"
        />
      </span>

      {onOpen && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </Wrapper>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span className="block w-14">
      <span className="block text-xs font-bold tabular-nums text-foreground">{value}</span>
      <span className="block text-[10px] font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
