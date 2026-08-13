import { Check } from '@/design-system/icons';


import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ===========================================================================
 * LinearProgress
 * =========================================================================== */

export type ProgressStatus = 'default' | 'success' | 'warning' | 'danger';
export type ProgressSize   = 'xs' | 'sm' | 'md' | 'lg';

const trackSizes: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const barColors: Record<ProgressStatus, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-destructive',
};

export interface LinearProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. */
  value?: number;
  /** Indeterminate animation when value is undefined. */
  indeterminate?: boolean;
  size?: ProgressSize;
  status?: ProgressStatus;
  /** Label shown above the bar. */
  label?: string;
  /** Show the percentage value. */
  showValue?: boolean;
  /** aria-label for assistive tech. */
  'aria-label'?: string;
}

export const LinearProgress = forwardRef<HTMLDivElement, LinearProgressProps>(
  function LinearProgress(
    { value, indeterminate, size = 'md', status = 'default', label, showValue, className, ...props },
    ref,
  ) {
    const pct = Math.min(100, Math.max(0, value ?? 0));

    return (
      <div ref={ref} className={cn('w-full space-y-1.5', className)} {...props}>
        {(label || showValue) && (
          <div className="flex items-center justify-between gap-2">
            {label && <span className="type-body-xs text-muted-foreground">{label}</span>}
            {showValue && !indeterminate && (
              <span className="type-body-xs font-medium tabular-nums text-foreground">{pct}%</span>
            )}
          </div>
        )}
        <div
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn('w-full overflow-hidden rounded-full bg-muted', trackSizes[size])}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              barColors[status],
              indeterminate && 'animate-indeterminate w-1/3',
            )}
            style={!indeterminate ? { width: `${pct}%` } : undefined}
          />
        </div>
      </div>
    );
  },
);

/* ===========================================================================
 * CircularProgress
 * =========================================================================== */

export interface CircularProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. */
  value?: number;
  indeterminate?: boolean;
  /** SVG viewBox size in px (controls rendered size). Default 64. */
  size?: number;
  /** Stroke width in px. Default 6. */
  strokeWidth?: number;
  status?: ProgressStatus;
  /** Content rendered inside the ring (e.g. percentage text). */
  children?: ReactNode;
}

export function CircularProgress({
  value,
  indeterminate,
  size = 64,
  strokeWidth = 6,
  status = 'default',
  children,
  className,
  ...props
}: CircularProgressProps) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value ?? 0));
  const offset = circ - (pct / 100) * circ;

  const strokeCols: Record<ProgressStatus, string> = {
    default: 'stroke-primary',
    success: 'stroke-success',
    warning: 'stroke-warning',
    danger:  'stroke-destructive',
  };

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={size} height={size} className={cn(indeterminate && 'animate-spin')}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Bar */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={indeterminate ? circ * 0.75 : offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('transition-all duration-500', strokeCols[status])}
        />
      </svg>
      {children && (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      )}
    </div>
  );
}

/* ===========================================================================
 * ProgressRing — thin decorative variant
 * =========================================================================== */

export interface ProgressRingProps extends CircularProgressProps {}

export function ProgressRing({ strokeWidth = 3, size = 40, ...props }: ProgressRingProps) {
  return <CircularProgress size={size} strokeWidth={strokeWidth} {...props} />;
}

/* ===========================================================================
 * ProgressSteps
 * =========================================================================== */

export type StepStatus = 'completed' | 'current' | 'upcoming';

export interface ProgressStep {
  id: string;
  label: string;
  status: StepStatus;
  description?: string;
}

export interface ProgressStepsProps extends HTMLAttributes<HTMLOListElement> {
  steps: ProgressStep[];
  /** Orientation. Default 'horizontal'. */
  orientation?: 'horizontal' | 'vertical';
}

export function ProgressSteps({ steps, orientation = 'horizontal', className, ...props }: ProgressStepsProps) {
  if (orientation === 'vertical') {
    return (
      <ol className={cn('space-y-0', className)} {...props}>
        {steps.map((step, idx) => (
          <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
            )}
            {/* Icon */}
            <div className={cn(
              'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2',
              step.status === 'completed' && 'bg-primary ring-primary',
              step.status === 'current'   && 'bg-surface ring-primary',
              step.status === 'upcoming'  && 'bg-surface ring-border',
            )}>
              {step.status === 'completed'
                ? <Check className="h-3.5 w-3.5 text-primary-foreground" />
                : step.status === 'current'
                  ? <span className="h-2 w-2 rounded-full bg-primary" />
                  : <span className="h-2 w-2 rounded-full bg-border" />}
            </div>
            {/* Text */}
            <div className="pt-0.5">
              <p className={cn('type-body-sm font-medium', step.status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>
                {step.label}
              </p>
              {step.description && <p className="type-body-xs text-muted-foreground mt-0.5">{step.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className={cn('flex items-center w-full', className)} {...props}>
      {steps.map((step, idx) => (
        <li key={step.id} className={cn('flex items-center', idx < steps.length - 1 && 'flex-1')}>
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ring-2',
              step.status === 'completed' && 'bg-primary text-primary-foreground ring-primary',
              step.status === 'current'   && 'bg-surface text-primary ring-primary',
              step.status === 'upcoming'  && 'bg-surface text-muted-foreground ring-border',
            )}>
              {step.status === 'completed' ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span className={cn('type-body-xs whitespace-nowrap', step.status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={cn('mx-2 h-px flex-1', step.status === 'completed' ? 'bg-primary' : 'bg-border')} />
          )}
        </li>
      ))}
    </ol>
  );
}
