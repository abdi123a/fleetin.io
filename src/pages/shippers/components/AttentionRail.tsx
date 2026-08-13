import { AlertTriangle, ArrowRight, CircleAlert, TriangleAlert } from '@/design-system/icons';
import { Badge, Button, Card } from '@/design-system';
import type { AccountAlert, ShipmentFilterKey } from '@/features/shipper-bi';
import type { ShipperTabKey } from './ShipperTabNav';
import { cn } from '@/utils';

/**
 * What is going wrong on this account, above the fold.
 *
 * The page previously held every one of these findings and showed none of them:
 * containers past free time were a tile in the control tower, shipments
 * forecast to miss were a slice of a gauge, and both sat below a masthead of
 * decorative statistics. An operator opening a customer record is asking "is
 * anything on fire" first and "how did the quarter go" second, and the layout
 * answered in the opposite order.
 *
 * The rail renders nothing when there is nothing — an empty "all clear" panel
 * teaches the reader to skip the region, which is exactly the habit that makes
 * the next real alert invisible.
 */

export interface AttentionRailProps {
  alerts: AccountAlert[];
  onNavigate: (tab: ShipperTabKey, filter?: ShipmentFilterKey) => void;
}

export function AttentionRail({ alerts, onNavigate }: AttentionRailProps) {
  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;

  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="inline-flex items-center gap-2 type-label text-muted-foreground">
          <AlertTriangle
            className={cn('size-3.5', criticalCount > 0 ? 'text-destructive' : 'text-warning')}
            aria-hidden
          />
          Needs attention
        </h2>
        <Badge intent={criticalCount > 0 ? 'destructive' : 'warning'} size="sm">
          {alerts.length}
        </Badge>
      </div>

      <ul className="divide-y divide-border">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-3 px-5 py-3.5">
            <span
              className={cn(
                'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
                alert.severity === 'critical'
                  ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                  : 'bg-warning-subtle text-warning-subtle-foreground',
              )}
              aria-hidden
            >
              {alert.severity === 'critical' ? <TriangleAlert /> : <CircleAlert />}
            </span>

            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="type-body-sm font-medium text-foreground">{alert.title}</p>
              <p className="type-caption text-muted-foreground">{alert.detail}</p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() =>
                onNavigate(
                  alert.target === 'compliance' ? 'profile' : alert.target,
                  alert.filter,
                )
              }
              trailingIcon={<ArrowRight className="size-3.5" />}
            >
              {alert.actionLabel}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
