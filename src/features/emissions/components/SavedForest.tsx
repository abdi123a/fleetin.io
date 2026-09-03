import { KG_CO2_PER_TREE_YEAR } from '@/lib/co2';
import { cn } from '@/utils';

/**
 * The saving, as trees you can count.
 *
 * "382 kg" is a number; seventeen trees standing in a row is a picture, and
 * the user asked for the picture — "the exact trees … animated trees, not
 * just trees" (2026-09-03). So: one tree per year's absorption of a mature
 * tree (`KG_CO2_PER_TREE_YEAR`), each rising out of the ground in turn when
 * the row mounts — scale from the base, a small spring, settle — then a slow
 * sway. The leftover fraction is a sapling scaled to it, so the row is exact
 * rather than rounded.
 *
 * Drawn in the tones of whatever it sits on: on the green Saved card the
 * crowns are white and the trunks a dark wash, so the trees read as part of
 * the card rather than as icons pasted on it. A picture beside the measured
 * figure, never in a total.
 */
export function SavedForest({
  co2Kg,
  onGreen = false,
  startDelayMs = 0,
  className,
}: {
  co2Kg: number;
  /** The row sits on the filled green card rather than on a light surface. */
  onGreen?: boolean;
  /** Hold the growth until the card it sits in has entered and counted. */
  startDelayMs?: number;
  className?: string;
}) {
  if (!(co2Kg > 0)) return null;

  const trees = co2Kg / KG_CO2_PER_TREE_YEAR;
  const full = Math.floor(trees);
  const fraction = trees - full;
  const drawn = Math.min(full, MAX_DRAWN);
  const hidden = full - drawn;
  const sapling = fraction >= 0.05;

  return (
    /* The ground line the trees stand on, so a row of glyphs reads as a
       planting rather than a scatter of icons. `key` on the count: a new
       figure replants the row, and the growth plays again. */
    <div
      key={`${drawn}-${sapling ? fraction.toFixed(2) : 0}`}
      className={cn(
        'flex flex-wrap items-end gap-x-1 gap-y-2 border-b-2 pb-1',
        onGreen ? 'border-success-foreground/35' : 'border-success/30',
        className,
      )}
      role="img"
      aria-label={`${trees.toFixed(1)} trees' worth of CO₂ absorbed in a year`}
    >
      {Array.from({ length: drawn }, (_, index) => (
        <Tree key={index} index={index} onGreen={onGreen} startDelayMs={startDelayMs} />
      ))}
      {sapling && (
        <Tree index={drawn} scale={0.35 + fraction * 0.55} sapling onGreen={onGreen} startDelayMs={startDelayMs} />
      )}
      {hidden > 0 && (
        <span
          className={cn(
            'self-center pl-2 text-xs font-bold tabular-nums',
            onGreen ? 'text-success-foreground/90' : 'text-success-subtle-foreground',
          )}
        >
          +{hidden.toLocaleString()} more
        </span>
      )}
    </div>
  );
}

/** Beyond this the row is a texture, not a count; the rest is printed as a number. */
const MAX_DRAWN = 200;

/** How long each tree waits for the one before it. */
const STAGGER_MS = 65;

/**
 * One tree. Pines and round crowns alternate, and heights vary a little by
 * position, so twenty of them look planted rather than stamped. Two nested
 * elements because growth and sway are both transforms: the outer one
 * rises, the inner one sways.
 */
function Tree({
  index,
  scale = 1,
  sapling = false,
  onGreen,
  startDelayMs,
}: {
  index: number;
  scale?: number;
  sapling?: boolean;
  onGreen: boolean;
  startDelayMs: number;
}) {
  const pine = index % 2 === 0;
  const height = (42 + ((index * 7) % 12)) * scale;
  const growDelay = startDelayMs + Math.min(index, 40) * STAGGER_MS;
  const crown = onGreen ? 'rgba(255,255,255,0.92)' : 'var(--success)';
  const crownDeep = onGreen ? 'rgba(255,255,255,0.68)' : 'var(--success-deep)';
  const trunk = onGreen ? 'rgba(0,0,0,0.28)' : 'var(--fl-neutral-600)';
  return (
    <span
      className="inline-block origin-bottom animate-tree-grow transition-transform duration-fast hover:scale-110"
      style={{ animationDelay: `${growDelay}ms`, height, width: height * 0.72 }}
      title={sapling ? `${scale.toFixed(1)} of a tree` : undefined}
    >
      <svg
        viewBox="0 0 40 56"
        className={cn('h-full w-full origin-bottom animate-tree-sway', sapling && 'opacity-70')}
        style={{ animationDelay: `${growDelay + 720 + (index % 5) * 300}ms` }}
        aria-hidden
      >
        {pine ? (
          <>
            <path d="M20 3 L31 20 H9 Z" fill={crown} />
            <path d="M20 12 L34 32 H6 Z" fill={crown} />
            <path d="M20 22 L38 45 H2 Z" fill={crownDeep} />
          </>
        ) : (
          <>
            <circle cx="20" cy="20" r="14" fill={crown} />
            <circle cx="12" cy="27" r="10" fill={crownDeep} />
            <circle cx="28" cy="27" r="10" fill={crownDeep} />
            <circle cx="20" cy="30" r="9" fill={crown} />
          </>
        )}
        <rect x="17.5" y={pine ? 44 : 37} width="5" height={pine ? 12 : 19} rx="1" fill={trunk} />
      </svg>
    </span>
  );
}
