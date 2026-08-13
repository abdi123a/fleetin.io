import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils';

export type CardDataFieldTheme = 'teal' | 'blue' | 'emerald' | 'amber' | 'slate' | 'avatar' | 'purple' | 'none';

const themeClasses: Record<CardDataFieldTheme, string> = {
  teal: 'bg-primary/10 text-primary border border-primary/20',
  blue: 'bg-info/10 text-info border border-info/20',
  emerald: 'bg-success/10 text-success border border-success/20',
  amber: 'bg-warning/10 text-warning border border-warning/20',
  slate: 'bg-secondary text-secondary-foreground border border-border/80',
  purple: 'bg-chart-5/10 text-chart-5 border border-chart-5/20',
  avatar: 'bg-primary/10 text-primary font-bold text-xs border border-primary/20',
  none: '',
};

export interface CardDataFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon node or Avatar */
  icon?: ReactNode;
  /** Color theme for icon box background & icon color */
  iconTheme?: CardDataFieldTheme;
  /** Main value/heading display */
  value: ReactNode;
  /** Subtitle / label below or above value */
  label?: ReactNode;
  /** Optional action element inline with value (e.g. edit icon button) */
  action?: ReactNode;
}

export const CardDataField = forwardRef<HTMLDivElement, CardDataFieldProps>(
  function CardDataField(
    { icon, iconTheme = 'teal', value, label, action, className, ...props },
    ref,
  ) {
    const valueString = typeof value === 'string' ? value : undefined;
    const labelString = typeof label === 'string' ? label : undefined;

    return (
      <div ref={ref} className={cn('flex items-start gap-2.5 sm:gap-3 min-w-0 group/field py-0.5', className)} {...props}>
        {icon && (
          <div
            className={cn(
              'h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0 select-none shadow-2xs transition-transform group-hover/field:scale-105 mt-0.5',
              themeClasses[iconTheme],
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex flex-col justify-center">
          {label && (
            <span
              className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-tight mb-0.5 line-clamp-1"
              title={labelString}
            >
              {label}
            </span>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2 break-words"
              title={valueString}
            >
              {value}
            </span>
            {action}
          </div>
        </div>
      </div>
    );
  },
);



