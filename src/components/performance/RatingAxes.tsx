import { Star } from '@/design-system/icons';
import { RATING_MAX, formatStars, type PerformanceSummary } from '@/lib/rating';
import { cn } from '@/utils';

export interface RatingAxesProps {
  summary: PerformanceSummary;
  className?: string;
}

/* Word for word the questions the debrief asks. These bars print back what a
   person answered, so they must be labelled with what that person was asked —
   "On-Time Rate" was right while the mark was the measured share of missions
   inside their window, and wrong the moment the mark became somebody's answer
   to "was it done on time?". The measured share is still computed and still
   shown, as the On Time figure beside the star, where it is a fact rather than
   a verdict. */
const AXES = [
  { key: 'reliability', label: 'Reliability' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'professionalism', label: 'Professionalism' },
] as const;

/**
 * The three marks behind the overall star — the three questions an operator
 * answered at the moment they closed the delivery.
 *
 * They are shown together and never alone: an overall of 4.2 built on a weak
 * punctuality reads completely differently from one built on a weak
 * reliability, and the point of splitting the rating in three is that the
 * reader can see which.
 *
 * The bars run the full 1–5 scale, so a 2.9 is visibly short of a 4.9 rather
 * than merely a slightly different number. Every bar is the same colour: the
 * axes are three readings of one record, not three states, and tinting the low
 * one red would make the weakest axis read as an alert rather than a score.
 */
export function RatingAxes({ summary, className }: RatingAxesProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {AXES.map(({ key, label }) => {
        const value = summary[key];
        const pct = value === null ? 0 : (value / RATING_MAX) * 100;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-[98px] shrink-0 truncate text-[11px] font-medium leading-tight text-muted-foreground">
              {label}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="inline-flex w-10 shrink-0 items-center justify-end gap-1">
              <Star aria-hidden className="size-3 shrink-0 text-warning fill-warning" />
              <span className="text-xs font-bold tabular-nums text-foreground">
                {formatStars(value)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
