import { Spinner } from '@/design-system';
import { cn } from '@/utils';

/**
 * RouteLoader — Suspense fallback for lazily loaded routes.
 *
 * Sized to fill the content area so the shell does not collapse while a route
 * chunk is in flight.
 */

export interface RouteLoaderProps {
  label?: string;
  className?: string;
}

export function RouteLoader({ label = 'Loading page', className }: RouteLoaderProps) {
  return (
    <div
      className={cn('flex flex-1 min-h-96 w-full items-center justify-center', className)}
      aria-busy
      aria-live="polite"
    >
      <Spinner size="lg" label={label} />
    </div>
  );
}
