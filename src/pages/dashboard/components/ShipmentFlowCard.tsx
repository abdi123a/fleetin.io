import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  Legend,
  PanelLink,
  SegmentBar,
  StatBox,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import type { OperationsModel } from '../model';

/**
 * Where every shipment on the book physically is, as one bar.
 *
 * Twelve backend statuses folded into the six states an administrator steers
 * by — nobody dispatches differently for "Loading" than for "En Route", both
 * mean the truck is out. The fold that earns its keep is `Awaiting proof`: the
 * only stage on this bar that freezes money, and the only one drawn in orange.
 *
 * The pipeline is a `SegmentBar` rather than a chart because it is a census,
 * not a series — every shipment is in exactly one stage and the widths add to
 * the whole book. That is what the segment bar says and what an axis would
 * obscure.
 */
export function ShipmentFlowCard({
  operations,
  className,
}: {
  operations: OperationsModel;
  className?: string;
}) {
  const total = operations.stages.reduce((sum, stage) => sum + stage.count, 0);
  const awaiting = operations.stages.find((stage) => stage.key === 'awaiting_pod')?.count ?? 0;

  return (
    <ConsolePanel
      className={className}
      title="Shipment Flow"
      subtitle={`${total} shipments · ${operations.containers} containers live`}
      action={
        <Link to={ROUTES.shipmentsList}>
          <PanelLink>Open shipments</PanelLink>
        </Link>
      }
      footer={
        <InsightNote tone={awaiting > 0 || operations.awaitingInvoice > 0 ? 'attention' : 'neutral'}>
          {awaiting > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {awaiting} delivered {awaiting === 1 ? 'shipment' : 'shipments'} missing POD
              </span>{' '}
              — cannot be billed until the paper is in.
            </>
          ) : operations.awaitingInvoice > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {operations.awaitingInvoice} delivered{' '}
                {operations.awaitingInvoice === 1 ? 'shipment' : 'shipments'} not yet invoiced
              </span>{' '}
              — ready to bill.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">All clear.</span> No missing POD, nothing left to bill.
            </>
          )}
        </InsightNote>
      }
    >
      {total === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No shipments yet.
        </p>
      ) : (
        <>
          <SegmentBar
            height={54}
            segments={operations.stages
              .filter((stage) => stage.count > 0)
              .map((stage) => ({
                key: stage.key,
                label: stage.label,
                value: stage.count,
                color: stage.color,
                foreground: stage.fg,
                caption: stage.label,
              }))}
          />

          <Legend
            className="mt-3"
            items={operations.stages.map((stage) => ({
              label: `${stage.label} ${stage.count}`,
              color: stage.color,
              shape: 'square' as const,
            }))}
          />

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <StatBox
              label="Awaiting POD"
              value={String(awaiting)}
              note="Delivered, POD not filed"
              tone={awaiting > 0 ? 'attention' : 'neutral'}
            />
            <StatBox
              label="To invoice"
              value={String(operations.awaitingInvoice)}
              note="Delivered and priced, not billed"
              tone={operations.awaitingInvoice > 0 ? 'attention' : 'neutral'}
            />
            <StatBox
              label="Completion rate"
              value={operations.completionRate !== null ? pct(operations.completionRate) : '—'}
              note={
                operations.completionRate !== null
                  ? 'Of finished shipments'
                  : 'Nothing finished yet'
              }
            />
          </div>
        </>
      )}
    </ConsolePanel>
  );
}
