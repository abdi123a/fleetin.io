import { AlertTriangle, ArrowRight } from '@/design-system/icons';
import { Badge, Card, CompanyAvatar, IconChip } from '@/design-system';
import { onTimeGraceMinutes, riskSeverityThresholds } from '@/lib/bi/config';
import { formatDuration } from '@/features/shipper-bi/format';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn } from '@/utils';

/**
 * The shipments worth a phone call today.
 *
 * Ranked by the blended risk score rather than by lateness, because the two are
 * not the same question: a shipment can be perfectly on schedule and still be
 * the urgent one because its free time expires tonight. The reason column says
 * which of the three failure modes fired, so the row is actionable without
 * opening it.
 *
 * Only open work appears here. A delivery that already missed its date is
 * history — it belongs in the on-time rate, not in a list of things someone can
 * still change.
 */

/** Enough to work down before lunch; more than this and nobody reads any of it. */
const MAX_ALERTS = 5;

export interface RiskAlertsCardProps {
  rows: ShipperShipmentRow[];
  onOpenShipment?: (row: ShipperShipmentRow) => void;
  onViewAll?: () => void;
}

export function RiskAlertsCard({ rows, onOpenShipment, onViewAll }: RiskAlertsCardProps) {
  const atRisk = rows
    .filter((row) => row.status === 'open' && row.riskScore >= riskSeverityThresholds().warning)
    .sort((a, b) => b.riskScore - a.riskScore);

  const shown = atRisk.slice(0, MAX_ALERTS);

  return (
    <Card variant="default" padding="lg" className="h-full gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Orange only while something actually asks for the reader. */}
        <IconChip
          icon={AlertTriangle}
          size={36}
          tint={atRisk.length > 0 ? 'orange' : 'teal'}
        />
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Needs Your Attention
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {atRisk.length === 0
              ? 'No open shipment is flagged right now'
              : `${atRisk.length} open ${atRisk.length === 1 ? 'shipment' : 'shipments'} predicted to slip or accrue charges`}
          </p>
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            All shipments
            <ArrowRight className="size-3.5" />
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card-nested border border-border-subtle bg-success-subtle/40 px-4 py-6 text-center text-xs text-muted-foreground">
          Everything in flight is tracking to plan and inside its free time.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Shipment', 'Route', 'Why', 'Risk'].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className={cn(
                      'px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                      header === 'Risk' ? 'text-right' : 'text-left',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {shown.map((row) => {
                const severity = severityOf(row.riskScore);
                return (
                  <tr
                    key={row.shipmentId}
                    tabIndex={onOpenShipment ? 0 : undefined}
                    role={onOpenShipment ? 'button' : undefined}
                    onClick={() => onOpenShipment?.(row)}
                    onKeyDown={(event) => {
                      if (onOpenShipment && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        onOpenShipment(row);
                      }
                    }}
                    className={cn(
                      'transition-colors',
                      onOpenShipment &&
                        'cursor-pointer hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    )}
                  >
                    <td className="px-1 py-2.5">
                      <span className="block font-mono text-xs font-semibold text-foreground">
                        {row.reference}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <CompanyAvatar
                          src={getTransporterLogoUrl(row.transporter)}
                          name={row.transporter}
                          fallback={row.transporter.substring(0, 2).toUpperCase()}
                          size="xs"
                          shape="circle"
                          className="shrink-0"
                        />
                        <span className="truncate">{row.transporter}</span>
                      </span>
                    </td>
                    <td className="max-w-[150px] px-1 py-2.5">
                      <span className="block truncate text-xs text-foreground">
                        {row.origin} → {row.destination}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {row.stageLabel}
                      </span>
                    </td>
                    <td className="max-w-[190px] px-1 py-2.5">
                      <span className="block truncate text-xs text-foreground" title={reasonFor(row)}>
                        {reasonFor(row)}
                      </span>
                    </td>
                    <td className="px-1 py-2.5 text-right">
                      <Badge
                        intent={severity === 'critical' ? 'destructive' : 'warning'}
                        size="sm"
                        className="tabular-nums"
                      >
                        {row.riskScore}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function severityOf(score: number): 'critical' | 'warning' {
  return score >= riskSeverityThresholds().critical ? 'critical' : 'warning';
}

/**
 * Why this shipment is flagged, in the order the money leaves.
 *
 * Free time first: it is the only one of the three already being charged.
 */
function reasonFor(row: ShipperShipmentRow): string {
  const headroom = row.freeTimeHoursRemaining;
  if (headroom !== undefined && row.returnedAt === undefined && headroom <= 0) {
    const over = Math.abs(headroom);
    return over >= 24
      ? `Container ${Math.round(over / 24)}d past free time`
      : `Container ${Math.round(over)}h past free time`;
  }

  if (headroom !== undefined && row.returnedAt === undefined && headroom <= 48) {
    return `Free time expires in ${Math.round(headroom)}h`;
  }

  if (row.varianceMinutes !== undefined && row.varianceMinutes > onTimeGraceMinutes()) {
    return `Forecast ${formatDuration(row.varianceMinutes)} past promised date`;
  }

  return `Held at ${row.stageLabel.toLowerCase()} longer than usual`;
}
