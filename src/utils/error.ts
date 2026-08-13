/**
 * Error helpers shared across the application.
 */

/**
 * Reads a human-readable message off an unknown `catch` binding.
 * Falls back to `fallback` for thrown non-Errors and blank messages.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}
