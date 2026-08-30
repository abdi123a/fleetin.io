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
 */
export type StatusIntent = 'teal' | 'orange' | 'green' | 'blue' | 'slate';

export const statusIntentClasses: Record<StatusIntent, string> = {
  teal: 'bg-primary text-primary-foreground',
  orange: 'bg-accent text-accent-foreground',
  green: 'bg-success text-success-foreground',
  blue: 'bg-info text-info-foreground',
  slate: 'bg-secondary text-secondary-foreground',
};

/** Shared geometry for the pill, independent of colour. */
export const statusPillBase =
  'inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium select-none';
