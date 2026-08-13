import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils';

export interface ShipmentStatusDonutProps extends HTMLAttributes<HTMLDivElement> {
  total?: number;
  created?: number;
  completed?: number;
  cancelled?: number;
}

export const ShipmentStatusDonut = forwardRef<HTMLDivElement, ShipmentStatusDonutProps>(
  function ShipmentStatusDonut(
    {
      total = 632,
      created = 354,
      completed = 188,
      cancelled = 20,
      className,
      ...props
    },
    ref,
  ) {
    // SVG Donut calculation
    const size = 180;
    const strokeWidth = 14;
    const center = size / 2;
    const radius = center - strokeWidth;
    const circumference = 2 * Math.PI * radius;

    const createdRatio = created / total;
    const completedRatio = completed / total;
    const cancelledRatio = cancelled / total;

    const createdLength = createdRatio * circumference;
    const completedLength = completedRatio * circumference;
    const cancelledLength = cancelledRatio * circumference;

    // Offsets
    const createdOffset = 0;
    const completedOffset = -createdLength;
    const cancelledOffset = -(createdLength + completedLength);

    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center justify-between gap-6 p-5 bg-card rounded-lg border border-border shadow-xs', className)}
        {...props}
      >
        {/* Title */}
        <div className="w-full flex items-center justify-between">
          <span className="type-h3 text-card-foreground">Total Shipments</span>
        </div>

        {/* Donut Chart */}
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              className="text-border"
              strokeWidth={strokeWidth}
            />
            {/* Created Segment (Accent / Amber) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="var(--accent)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${createdLength} ${circumference - createdLength}`}
              strokeDashoffset={createdOffset}
              strokeLinecap="round"
            />
            {/* Completed Segment (Success / Green) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="var(--success)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${completedLength} ${circumference - completedLength}`}
              strokeDashoffset={completedOffset}
              strokeLinecap="round"
            />
            {/* Cancelled Segment (Destructive / Red) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="var(--destructive)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${cancelledLength} ${circumference - cancelledLength}`}
              strokeDashoffset={cancelledOffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Center Metric text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-extrabold text-foreground leading-none">{total}</span>
            <span className="text-xs font-semibold text-muted-foreground mt-1">Shipments</span>
          </div>
        </div>

        {/* Legend Grid - Grid layout prevents horizontal overflow outside card boundaries */}
        <div className="w-full grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
          {/* Created */}
          <div className="flex flex-col items-center text-center gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
              <span className="text-xs font-extrabold text-foreground truncate">{created}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate w-full">Created</span>
          </div>

          {/* Completed */}
          <div className="flex flex-col items-center text-center gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
              <span className="text-xs font-extrabold text-foreground truncate">{completed}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate w-full">Completed</span>
          </div>

          {/* Cancelled */}
          <div className="flex flex-col items-center text-center gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" />
              <span className="text-xs font-extrabold text-foreground truncate">{cancelled}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate w-full">Cancelled</span>
          </div>
        </div>
      </div>
    );
  },
);
