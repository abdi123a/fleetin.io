import { Container, AlertTriangle, Clock, CheckCircle2, ArrowRight } from '@/design-system/icons';
import { Badge, Card } from '@/design-system';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { CardHeading } from '../../charts';
import type { CategorySlice } from '../../contracts';

export interface ContainerFreeTimeCardProps {
  returnHeadroom?: CategorySlice[];
  onOpenReturns?: () => void;
}

export function ContainerFreeTimeCard({ returnHeadroom = [], onOpenReturns }: ContainerFreeTimeCardProps) {
  const overdue = returnHeadroom.find((s) => s.key === 'overdue')?.value ?? 0;
  const dueSoon = returnHeadroom.find((s) => s.key === 'due_soon')?.value ?? 3;
  const comfortable = returnHeadroom.find((s) => s.key === 'comfortable')?.value ?? 14;
  const total = overdue + dueSoon + comfortable;

  const overduePct = total > 0 ? (overdue / total) * 100 : 0;
  const dueSoonPct = total > 0 ? (dueSoon / total) * 100 : 0;
  const comfortablePct = total > 0 ? (comfortable / total) * 100 : 100;

  // Mock list of containers approaching free time deadline for high operational value
  const priorityContainers = [
    { id: 'MSCU-8849201', depot: 'PK12 Free Zone Depot', hoursLeft: 12, status: 'urgent' },
    { id: 'CMAU-4920182', depot: 'Port of Djibouti Terminal 2', hoursLeft: 36, status: 'warning' },
    { id: 'TLLU-1093847', depot: 'Mogadishu Container Yard', hoursLeft: 72, status: 'safe' },
  ];

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <CardHeading
        title="Container Free Time & Demurrage"
        subtitle="Track empty container return windows & demurrage risk"
        icon={<Container className="size-4 text-primary" />}
        actions={
          <Link
            to={ROUTES.emptyReturns}
            onClick={onOpenReturns}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline-none"
          >
            <span>Manage Returns</span>
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      {/* KPI status tiles */}
      <div className="grid grid-cols-3 gap-2.5 pt-1">
        <div className="flex flex-col rounded-lg border border-destructive/20 bg-destructive-subtle/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Overdue</span>
            <AlertTriangle className="size-3.5 text-destructive" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-destructive">{overdue}</span>
            <span className="text-[10px] text-muted-foreground">units</span>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-warning/20 bg-warning-subtle/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Due Soon</span>
            <Clock className="size-3.5 text-warning" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-warning-foreground">{dueSoon}</span>
            <span className="text-[10px] text-muted-foreground">units</span>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-success/20 bg-success-subtle/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Comfortable</span>
            <CheckCircle2 className="size-3.5 text-success" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-success-subtle-foreground">{comfortable}</span>
            <span className="text-[10px] text-muted-foreground">units</span>
          </div>
        </div>
      </div>

      {/* Visual headroom distribution bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
          <span>Headroom Distribution ({total} total containers)</span>
          <span className="font-semibold text-foreground">
            {total > 0 ? Math.round(((comfortable + dueSoon) / total) * 100) : 100}% on schedule
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {overdue > 0 && (
            <div
              style={{ width: `${overduePct}%` }}
              className="bg-destructive transition-all"
              title={`Overdue: ${overdue} (${Math.round(overduePct)}%)`}
            />
          )}
          {dueSoon > 0 && (
            <div
              style={{ width: `${dueSoonPct}%` }}
              className="bg-warning transition-all"
              title={`Due Soon: ${dueSoon} (${Math.round(dueSoonPct)}%)`}
            />
          )}
          <div
            style={{ width: `${comfortablePct}%` }}
            className="bg-success transition-all"
            title={`Comfortable: ${comfortable} (${Math.round(comfortablePct)}%)`}
          />
        </div>
      </div>

      {/* High-priority returns list */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Urgent Free Time Deadlines
        </span>
        <div className="space-y-1.5">
          {priorityContainers.map((container) => (
            <div
              key={container.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface/40 p-2 text-xs transition-colors hover:bg-surface"
            >
              <div className="flex items-center gap-2.5">
                <Container className="size-3.5 text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">{container.id}</p>
                  <p className="text-[10px] text-muted-foreground">{container.depot}</p>
                </div>
              </div>
              <Badge
                intent={container.status === 'urgent' ? 'destructive' : container.status === 'warning' ? 'warning' : 'info'}
                size="sm"
                className="text-[10px]"
              >
                {container.hoursLeft}h free time left
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
