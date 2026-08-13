import { forwardRef, type HTMLAttributes } from 'react';
import { MapPin } from '@/design-system/icons';
import { cn } from '@/utils';

export interface RouteTimelineProps extends HTMLAttributes<HTMLDivElement> {
  /** Origin location name */
  origin: string;
  /** Destination location name */
  destination: string;
  /** Subtitle for origin */
  originSubtitle?: string;
  /** Subtitle for destination */
  destinationSubtitle?: string;
  /** Compact vertical gap mode */
  compact?: boolean;
}

export const RouteTimeline = forwardRef<HTMLDivElement, RouteTimelineProps>(
  function RouteTimeline(
    { origin, destination, originSubtitle, destinationSubtitle, compact = false, className, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn('flex flex-col gap-1 min-w-0', className)} {...props}>
        {/* Origin Node */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-4 h-4 rounded-full border-2 border-success bg-success-subtle shrink-0 flex items-center justify-center shadow-2xs mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
          </span>
          <div className="min-w-0 flex flex-col">
            <span
              className="text-xs sm:text-sm font-extrabold text-foreground leading-snug line-clamp-2 break-words"
              title={origin}
            >
              {origin}
            </span>
            {originSubtitle && (
              <span className="text-[11px] font-medium text-muted-foreground truncate">{originSubtitle}</span>
            )}
          </div>
        </div>

        {/* Vertical Dashed Line Connector */}
        <div
          className={cn(
            'border-l-2 border-dashed border-success/40 ml-[7px] my-0.5',
            compact ? 'h-2.5' : 'h-3.5',
          )}
        />

        {/* Destination Node */}
        <div className="flex items-start gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-destructive-subtle-foreground fill-destructive/20 shrink-0 mt-0.5" />
          <div className="min-w-0 flex flex-col">
            <span
              className="text-xs sm:text-sm font-extrabold text-foreground leading-snug line-clamp-2 break-words"
              title={destination}
            >
              {destination}
            </span>
            {destinationSubtitle && (
              <span className="text-[11px] font-medium text-muted-foreground truncate">{destinationSubtitle}</span>
            )}
          </div>
        </div>
      </div>
    );
  },
);

