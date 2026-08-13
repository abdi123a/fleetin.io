import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind conflicts, so a
 * consumer-supplied `className` always wins over a component's own defaults.
 *
 * @example cn('px-4 text-sm', isActive && 'text-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
