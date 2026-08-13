/**
 * String helpers shared across the application.
 */

/**
 * Derives avatar initials from a name: "Marill Test" -> "MT".
 * Falls back to `placeholder` when nothing usable is supplied.
 */
export function getInitials(name: string | null | undefined, maxLength = 2, placeholder = '—'): string {
  if (!name?.trim()) return placeholder;

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, maxLength)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || placeholder;
}

/** Truncates with an ellipsis, never mid-way through the limit. */
export function truncate(value: string, maxLength: number, suffix = '…'): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

/** "vehicle-inspection" -> "Vehicle Inspection". Used to label unmapped route segments. */
export function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** "Vehicle Inspection" -> "vehicle-inspection". */
export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
