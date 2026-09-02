/* ---------------------------------------------------------------------------
 * Status intents
 * ---------------------------------------------------------------------------
 * The filled status pill that sits in the top-right of a shipment or booking
 * card. Shipment and booking cards render the same pill, so the colour map and
 * the pill geometry live here rather than being restated in each component.
 *
 * Geometry matches the production app: a fully-rounded 20px-tall chip with
 * 12px of horizontal padding and 13px medium text.
 * ------------------------------------------------------------------------- */

/**
 * `teal` joined on 2026-08-30, when the booking ladder was recoloured by phase
 * — teal booked, green in transit, amber owing a return, slate closed. `blue`
 * stays for the surfaces that still ask for it by name; nothing on the ladder
 * uses it any more.
 *
 * `green-deep` and `orange-deep` joined on 2026-09-01. They are **not new
 * phases** — they are the second rung of an existing one. Two of the four
 * phases cover two rungs each (Picked Up → Delivered, Empty Ready → Empty
 * Picked Up), and painting both rungs one flat colour left the picker unable
 * to show which of the two a booking had reached. Same hue, one step along the
 * ramp, so the phase still reads at a glance and the position within it reads
 * on a second look.
 *
 * Anything that speaks in phases rather than rungs — `Badge`, `CornerBadge` —
 * folds these back onto `success`/`warning` and `green`/`orange`. Those
 * primitives have deliberately small intent vocabularies and a within-phase
 * step is not a thing they are for.
 */
export type StatusIntent =
  | 'teal'
  | 'orange'
  | 'orange-deep'
  | 'green'
  | 'green-deep'
  | 'blue'
  | 'red'
  | 'slate';

export const statusIntentClasses: Record<StatusIntent, string> = {
  teal: 'bg-primary text-primary-foreground',
  orange: 'bg-accent text-accent-foreground',
  'orange-deep': 'bg-warning-deep text-warning-deep-foreground',
  green: 'bg-success text-success-foreground',
  'green-deep': 'bg-success-deep text-success-deep-foreground',
  /* The one rung the operator has to see coming — see `STEP_INTENT`. */
  red: 'bg-destructive text-destructive-foreground',
  blue: 'bg-info text-info-foreground',
  slate: 'bg-secondary text-secondary-foreground',
};

/** Shared geometry for the pill, independent of colour. */
export const statusPillBase =
  'inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium select-none';
