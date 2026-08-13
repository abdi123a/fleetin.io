/**
 * Colour value formatting for the design-system documentation.
 *
 * Computed custom properties come back in whatever notation the stylesheet
 * used — `#4f8a94`, `rgb(79 138 148 / 0.16)`, `oklch(...)`. These helpers
 * normalise that into something readable in a spec row without ever claiming a
 * precision the source does not have: a translucent value stays translucent
 * rather than being flattened into a misleading opaque hex.
 */

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_FULL = /^#[0-9a-f]{6}$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/i;

function toHexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function parseAlpha(raw: string | undefined): number {
  if (!raw) return 1;
  return raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
}

/**
 * Formats a computed colour for display.
 *
 * Opaque colours become uppercase hex. Translucent ones keep their alpha,
 * shown as `#RRGGBB · 16%`, because the transparency is the point of those
 * tokens (dark-theme subtle fills are alpha over the canvas).
 */
export function formatColorValue(value: string): string {
  const input = value.trim();
  if (!input) return '—';

  const short = HEX_SHORT.exec(input);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  }

  if (HEX_FULL.test(input)) return input.toUpperCase();

  const rgb = RGB.exec(input);
  if (rgb) {
    const hex = `#${toHexChannel(Number(rgb[1]))}${toHexChannel(Number(rgb[2]))}${toHexChannel(Number(rgb[3]))}`;
    const alpha = parseAlpha(rgb[4]);
    return alpha >= 1 ? hex : `${hex} · ${Math.round(alpha * 100)}%`;
  }

  // Unrecognised notation (gradients, oklch, colour functions) is shown as-is
  // rather than guessed at.
  return input;
}
