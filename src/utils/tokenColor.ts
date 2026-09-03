/**
 * Read a design token's colour as a hex string, at runtime.
 *
 * For the handful of places that hand a colour to something which is not CSS —
 * a canvas, a charting library — and so cannot take `var(--container-empty)`.
 * The alternative is a hex literal in a TSX file, which is the thing the token
 * layer exists to prevent and which `check:ds` counts as a warning. It also
 * means these colours follow the theme instead of freezing the light one.
 *
 * Two steps, because one is not enough. A probe element resolves the alias
 * chain (`--container-empty` → `--accent-bold` → `--fl-orange-500` → a colour),
 * and `getComputedStyle` hands back whatever serialisation the browser prefers
 * — `rgb()`, but also `color(srgb …)` for anything that went through
 * `color-mix`, and `oklch()` where a token is authored that way. A 1×1 canvas
 * then normalises all of them to bytes, because a 2D context accepts every CSS
 * colour and stores one thing.
 */
export function tokenColor(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;

  const probe = document.createElement('span');
  probe.style.cssText = `color:var(${variable});position:absolute;visibility:hidden;pointer-events:none`;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  if (!resolved) return fallback;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return fallback;

  /* An unparseable value leaves `fillStyle` at whatever it was, so the fallback
     is seeded first and comes back out unchanged rather than as black. */
  context.fillStyle = fallback;
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);

  const pixel = context.getImageData(0, 0, 1, 1).data;
  return `#${[pixel[0], pixel[1], pixel[2]]
    .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
    .join('')}`;
}
