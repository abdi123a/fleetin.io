import { Star } from '@/design-system/icons';
import { RATING_MAX, formatStars } from '@/lib/rating';
import { cn } from '@/utils';

export interface StarRatingProps {
  /** 1–5. `null` renders the unrated state. */
  value: number | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the number and show the stars alone. */
  glyphsOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { star: 'size-3', gap: 'gap-0.5', text: 'text-[11px] font-bold' },
  md: { star: 'size-3.5', gap: 'gap-0.5', text: 'text-sm font-bold' },
  lg: { star: 'size-4', gap: 'gap-1', text: 'text-lg font-extrabold' },
  xl: { star: 'size-5', gap: 'gap-1', text: 'text-3xl font-black' },
} as const;

/**
 * Five stars, filled to the rating — the one place a star is drawn.
 *
 * The fill is a clipped overlay rather than a run of full/half/empty glyphs, so
 * 4.3 and 4.4 actually look different. Colour is never the only carrier: the
 * number is printed beside the stars, and the empty portion differs in fill as
 * well as hue.
 */
export function StarRating({ value, size = 'md', glyphsOnly = false, className }: StarRatingProps) {
  const scale = SIZES[size];
  const pct = value === null ? 0 : Math.min(Math.max(value / RATING_MAX, 0), 1) * 100;

  return (
    <span
      className={cn('inline-flex items-center', scale.gap, className)}
      role="img"
      aria-label={value === null ? 'Not yet rated' : `${formatStars(value)} out of ${RATING_MAX}`}
    >
      <span className={cn('relative inline-flex shrink-0', scale.gap)}>
        {Array.from({ length: RATING_MAX }, (_, i) => (
          <Star key={i} aria-hidden className={cn(scale.star, 'text-border fill-muted')} />
        ))}
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 inline-flex overflow-hidden', scale.gap)}
          style={{ width: `${pct}%` }}
        >
          {Array.from({ length: RATING_MAX }, (_, i) => (
            <Star key={i} className={cn(scale.star, 'shrink-0 text-warning fill-warning')} />
          ))}
        </span>
      </span>
      {!glyphsOnly && (
        <span className={cn(scale.text, 'ml-1.5 tabular-nums text-foreground')}>
          {formatStars(value)}
        </span>
      )}
    </span>
  );
}
