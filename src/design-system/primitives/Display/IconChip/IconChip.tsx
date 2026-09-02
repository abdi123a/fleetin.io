import type { ComponentType, ReactNode, SVGProps } from 'react';

import { cn } from '@/utils';

/**
 * The one icon mark that opens a card, panel or row — anywhere in the app.
 *
 * Promoted out of the finance module 2026-08-12. Finance settled the argument
 * there and the rest of the system was still speaking four dialects at once:
 * a 28px rounded square with a 10%-alpha wash on the dashboard KPIs, a 36px
 * `rounded-[0.7rem]` subtle tile on the shipper cards, a 48px `rounded-lg` on
 * the console, a 56px white ring on the KPI stat. Put two of those on one
 * screen and the page reads as two products stitched together.
 *
 * The rule, unchanged from finance:
 *
 * - **Round.** One shape. A rounded square beside a circle is two systems.
 * - **Solid, not a wash.** A 10% tint reads as a smudge next to a brand tile;
 *   the disc takes the colour and the glyph goes light, so the mark survives
 *   greyscale, a screenshot and a projector.
 * - **44px with a 20px glyph**, or **36px with an 18px glyph** in dense rows.
 *   Nothing in between, and nothing smaller — a 28px disc loses the icon.
 *
 * Each tint is a token pair already proven for filled surfaces: teal uses
 * `-bold` (white at 5.6:1, the reason that role exists), orange keeps its full
 * brand value with the near-black it was tuned for. `on-teal` / `on-light`
 * are the inverse used on the pastel brand tiles, where the card already owns
 * the colour and the disc goes white.
 */
export type IconChipTint =
  | 'teal'
  | 'green'
  | 'orange'
  | 'amber'
  | 'red'
  | 'blue'
  | 'neutral'
  | 'on-teal'
  | 'on-green'
  | 'on-done'
  | 'on-light';

export type IconChipSize = 44 | 36;

const CHIP_TINT: Record<IconChipTint, string> = {
  teal: 'bg-primary-bold text-primary-bold-foreground',
  /* The solid green the rest of the scale was missing. `on-green` below is its
     inverse — a white disc for use ON a green tile — and until this existed a
     green subject sitting on a plain white card had no disc of its own and had
     to borrow teal. Carbon is that subject. */
  green: 'bg-success text-success-foreground',
  orange: 'bg-accent-bold text-accent-bold-foreground',
  amber: 'bg-warning text-warning-foreground',
  red: 'bg-destructive text-destructive-foreground',
  blue: 'bg-info text-info-foreground',
  neutral: 'bg-muted-foreground text-background',
  /* On a filled tile the card carries the hue, so the disc inverts. */
  'on-teal': 'bg-white text-tile-teal',
  /* The same inversion for the shipment ladder's other two filled tiles.
     Written as a token *pair* rather than a literal white, because both of
     these grounds flip between themes — `--tile-done` is a near-black slab on
     light and a near-white one on dark, so a hard-coded white disc would
     vanish into it the moment the theme changed. */
  'on-green': 'bg-success-foreground text-success',
  'on-done': 'bg-tile-done-foreground text-tile-done',
  'on-light': 'bg-white text-tile-foreground',
};

export interface IconChipProps {
  /**
   * Icon component — the usual form. The union is deliberate: the bare call
   * signature is what lucide's forwardRef icons satisfy structurally, and
   * `ComponentType<SVGProps>` is how several modules already type their own
   * icon props. Requiring either one alone breaks half the call sites.
   */
  icon?:
    | ((props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode)
    | ComponentType<SVGProps<SVGSVGElement>>;
  /** Already-rendered glyph, for call sites that take an icon as a node. */
  children?: ReactNode;
  tint?: IconChipTint;
  /** 44 by default; 36 for the denser list rows and KPI headers. */
  size?: IconChipSize;
  className?: string;
}

export function IconChip({
  icon: Icon,
  children,
  tint = 'teal',
  size = 44,
  className,
}: IconChipProps) {
  const glyph = size === 44 ? 'size-5' : 'size-[18px]';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        size === 44 ? 'size-11' : 'size-9',
        CHIP_TINT[tint],
        // Nodes passed as children carry their own size classes; normalise them
        // so a call site that hands over a `size-4` icon still reads right.
        // Written out rather than interpolated — Tailwind only sees literals.
        children && (size === 44 ? '[&>svg]:size-5' : '[&>svg]:size-[18px]'),
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className={glyph} /> : children}
    </span>
  );
}
