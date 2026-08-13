import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck, Timer, Zap } from '@/design-system/icons';
import { Tooltip } from '@/design-system';
import { RETURN_RISK_META } from '@/data/emptyReturnData';
import type { ReturnRiskLevel } from '@/types/emptyReturn';
import { cn } from '@/utils';

export interface UrgencyBadgeProps {
  risk: ReturnRiskLevel | null;
  /** Alert messages — icon + tooltip only; never a second badge that breaks row height. */
  alerts?: readonly string[];
  className?: string;
}

const RISK_ICONS: Record<ReturnRiskLevel, typeof Timer> = {
  overdue: AlertCircle,
  at_risk: AlertTriangle,
  critical: Zap,
  watch: Timer,
  safe: CheckCircle2,
  protected: ShieldCheck,
};

/**
 * Modern Urgency Badge with semantic status icon and crisp pill container.
 */
export function UrgencyBadge({ risk, alerts = [], className }: UrgencyBadgeProps) {
  if (!risk) {
    return <span className={cn('text-xs text-muted-foreground/60', className)}>—</span>;
  }

  const label = RETURN_RISK_META[risk].label;
  const alertCount = alerts.length;
  const Icon = RISK_ICONS[risk] || Timer;

  return (
    <div className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold tracking-tight shadow-2xs',
          risk === 'overdue' && 'bg-destructive text-destructive-foreground animate-pulse motion-reduce:animate-none shadow-sm',
          risk === 'at_risk' && 'bg-warning-subtle text-warning-subtle-foreground border border-warning/30',
          risk === 'critical' && 'bg-warning-subtle text-warning-subtle-foreground border border-warning/30',
          risk === 'watch' && 'bg-info-subtle text-info-subtle-foreground border border-info/30',
          risk === 'safe' && 'bg-success-subtle text-success-subtle-foreground border border-success/30',
          risk === 'protected' && 'bg-primary-subtle text-primary-subtle-foreground border border-primary/30',
        )}
      >
        <Icon className="size-3 shrink-0" aria-hidden />
        {label}
      </span>

      {alertCount > 0 && (
        <Tooltip
          content={
            <ul className="space-y-0.5 text-xs">
              {alerts.map((alert) => (
                <li key={alert} className="flex items-center gap-1">
                  <AlertTriangle className="size-3 text-warning-subtle-foreground shrink-0" />
                  <span>{alert}</span>
                </li>
              ))}
            </ul>
          }
        >
          <span
            className={cn(
              'inline-flex size-5 items-center justify-center rounded-sm bg-warning-subtle text-warning-subtle-foreground border border-warning/30 text-[10px] font-bold cursor-help',
            )}
            aria-label={alerts.join('; ')}
          >
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
          </span>
        </Tooltip>
      )}
    </div>
  );
}

