import type { ReactNode } from 'react';
import { ArrowUpRight, Download } from '@/design-system/icons';
import { Button } from '@/design-system';
import { cn } from '@/utils';

/**
 * The masthead that opens the shipper home: who is looking, what is pending,
 * and the window controls. Charts sit immediately under it.
 */

export interface HeroBandProps {
  greeting: string;
  firstName: string;
  /** Shipments that still need a look — drives the alert pill. */
  pendingCount: number;
  onPendingClick?: () => void;
  onExport?: () => void;
  /** The timeframe picker, rendered into the control row. */
  timeframe: ReactNode;
}

export function HeroBand({
  greeting,
  firstName,
  pendingCount,
  onPendingClick,
  onExport,
  timeframe,
}: HeroBandProps) {
  const hasPending = pendingCount > 0;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="min-w-0 flex flex-col gap-2">
            <h1 className="type-display text-foreground">
              Hi {firstName}, {greeting}!
            </h1>
          </div>

          {hasPending ? (
            <button
              type="button"
              onClick={onPendingClick}
              className={cn(
                'group inline-flex items-center gap-2 rounded-full border border-destructive/40',
                'bg-destructive-subtle px-3 py-1.5 text-xs font-bold text-destructive-subtle-foreground transition-all cursor-pointer',
                'hover:bg-destructive/20 hover:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 active:scale-95 shrink-0 shadow-2xs',
              )}
              title="View pending empty returns"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
              </span>
              <span className="tracking-tight">{pendingCount} Pending Empty Return</span>
              <ArrowUpRight
                className="size-3 shrink-0 text-destructive-subtle-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {timeframe}
          <Button
            type="button"
            variant="outline"
            shape="pill"
            size="md"
            leadingIcon={<Download className="size-4" />}
            onClick={onExport}
          >
            Export CSV
          </Button>
        </div>
      </div>
    </section>
  );
}
