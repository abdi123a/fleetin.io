/**
 * The analytics band's palette — four strings, and the argument for each.
 *
 * The page speaks in two hues (see `statusTone.ts`): teal is the account
 * working, orange is the account needing a person. The band has five marks to
 * colour and only one of them is a claim that something needs doing, so teal
 * carries the other four at three depths and orange is spent once, on the fees.
 *
 * Every depth is mixed against a *semantic* token rather than picked off a ramp,
 * so all four invert with the theme from one string. `--primary-bold` was the
 * obvious candidate for the deep step and is not used: it resolves to the same
 * `#436e74` in both themes, which is ~2.2:1 against the dark surface.
 *
 * The `--chart-*` categorical ramp is deliberately absent. Reaching into it
 * would give this band a third and fourth hue that mean nothing, which is the
 * mistake `ShipmentOverviewChart` documents having already made once.
 */

/** Base brand teal — total shipments, and the area under them. */
export const BAND_TOTAL = 'var(--primary)';

/**
 * A second, deeper teal — delivered shipments, and the containers slice.
 * Depth carries magnitude here, the same way it does in `statusTone`'s
 * delivered/in-transit pair.
 */
export const BAND_DEEP = 'color-mix(in srgb, var(--primary) 62%, var(--foreground))';

/** A pale teal one step off the card — bulk freight. */
export const BAND_PALE = 'color-mix(in srgb, var(--primary) 45%, var(--surface))';

/** Orange, used once: extra fees are money leaking, which is an ask. */
export const BAND_FEES = 'var(--accent-bold)';

/**
 * Charts in this band render their final frame immediately.
 *
 * Recharts drives its mount transition off `requestAnimationFrame`, which a
 * browser does not schedule for a hidden tab. A dashboard opened into a
 * background tab therefore paints frame zero — 0.5px bars, empty pie sectors —
 * and, because the transition never restarts once mounted, stays that way after
 * the reader switches to it. A 600ms flourish is not worth a chart that can be
 * permanently blank.
 */
export const BAND_ANIMATION = false;
