import { useBranding, useOrganization } from '@/features/settings';
import { cn } from '@/utils';

export interface LogoProps {
  /** Hides the wordmark, leaving only the icon glyph. Used by the collapsed sidebar rail. */
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  /**
   * `'white'` flattens the full wordmark to a solid white silhouette for a
   * dark panel. Deliberately has no effect when `iconOnly` — see below.
   */
  variant?: 'default' | 'white';
  className?: string;
}

const iconSizeMap = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-9',
  xl: 'h-10',
  '2xl': 'h-12',
  '3xl': 'h-14',
  '4xl': 'h-16',
};

const fullSizeMap = {
  sm: 'h-7 max-w-[140px]',
  md: 'h-8 max-w-[165px]',
  lg: 'h-10 max-w-[195px]',
  xl: 'h-11 max-w-[220px]',
  '2xl': 'h-14 max-w-[270px]',
  '3xl': 'h-16 max-w-[310px]',
  // Login/auth hero. The wordmark's 2.57:1 ratio means height is always the
  // binding constraint here, so max-w only guards narrow viewports.
  '4xl': 'h-20 max-w-[360px]',
};

/**
 * The icon-only glyph is a *solid* teal disc with the whole brand mark cut
 * into it in white — there is no plain-colour region to preserve. A
 * `brightness-0 invert` pass forces every opaque pixel to black before
 * inverting, regardless of its original hue, so the teal disc and the white
 * detail sitting on top of it collapse to the exact same white: the glyph
 * doesn't recolour, it disappears into a blank circle. It always renders in
 * its natural colours instead — teal-500 already reads clearly against the
 * darker teal-800 sidebar rail with no filter needed.
 *
 * The full wordmark doesn't have that problem: it's mostly solid-colour
 * "FLEETIN" lettering, which a white flatten renders as clean white
 * letterforms. It does cost the leading icon mark its internal dot detail,
 * reduced to a plain white silhouette — an acceptable trade for a wordmark
 * that needs to read clearly on the dark rail, so `variant="white"` is
 * opt-in here only.
 */
export function Logo({ iconOnly = false, size = 'lg', variant = 'default', className }: LogoProps) {
  const branding = useBranding();
  const org = useOrganization();

  if (iconOnly) {
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0 py-0.5', className)}
        aria-label={org.tradingName}
      >
        <img
          src={branding.resolvedMarkSrc}
          alt={org.tradingName}
          className={cn(iconSizeMap[size], 'w-auto object-contain shrink-0 transition-all')}
        />
      </span>
    );
  }

  /*
   * An uploaded white wordmark is used as-is; the `brightness-0 invert` pass
   * is only for the shipped colour artwork, where flattening is the whole
   * point. Applying it to a mark somebody uploaded *because* it is already
   * white would erase the detail they uploaded it for.
   */
  const hasOwnWhiteMark = variant === 'white' && branding.logoWhiteSrc != null;
  const src = variant === 'white' ? branding.resolvedLogoWhiteSrc : branding.resolvedLogoSrc;

  return (
    <span
      className={cn('inline-flex items-center shrink-0 gap-2 py-0.5', className)}
      aria-label={`${org.tradingName} Logistics`}
    >
      <img
        src={src}
        alt={`${org.tradingName} Internal Management System`}
        className={cn(
          fullSizeMap[size],
          'w-auto object-contain shrink-0 transition-all',
          variant === 'white' && !hasOwnWhiteMark && 'brightness-0 invert',
        )}
      />
    </span>
  );
}
