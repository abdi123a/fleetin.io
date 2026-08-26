import { ContainerIcon } from '@/design-system/icons';
import { RateGauge } from '@/features/shipper-bi/charts';
import { TONE, Block, ComparisonBars, Readout } from './kit';
import type { ShipperInsight } from './buildInsight';

/**
 * Question three: **are my boxes going back before free time runs out?**
 *
 * The metric that separates a well-run Djibouti account from a costly one, and
 * the one thing on this page a shipper can fix by Monday. A gauge for the rate,
 * two bars for the split, and the consequence — chargeable days — beside it.
 *
 * Detention and demurrage are reported separately on purpose. They look like
 * one problem and have different fixes: demurrage accrues while the box is
 * still inside the terminal and is owed to the line; detention accrues once it
 * is out, and is usually a yard or a transporter. Added together, the figure
 * tells you that you are losing money but not which lever moves it.
 */
export function ContainerCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { containers } = insight;

  const closed = containers.withinFreeTime + containers.pastFreeTime;
  const cleanRate = closed === 0 ? 0 : containers.withinFreeTime / closed;
  const clean = containers.pastFreeTime === 0;

  const answer =
    closed === 0
      ? 'No containers have completed their cycle in this period yet.'
      : clean
        ? `Yes — all ${containers.withinFreeTime} boxes went back inside their free time.`
        : `${containers.pastFreeTime} of ${closed} went back late, costing ${containers.daysLost} chargeable day${containers.daysLost === 1 ? '' : 's'}.`;

  return (
    <Block
      className={className}
      title="Are my containers going back in time?"
      answer={answer}
      icon={<ContainerIcon />}
      tint={clean ? 'teal' : 'orange'}
      bodyClassName="justify-between gap-6"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <RateGauge
            value={cleanRate}
            target={1}
            label="back in free time"
            color={clean ? TONE.good : TONE.attention}
            size={168}
          />
          <p className="type-body-xs text-center text-muted-foreground">
            {containers.withinFreeTime} of {closed} completed cycles
          </p>
        </div>

        <ComparisonBars
          rows={[
            {
              label: 'Back within free time',
              value: containers.withinFreeTime,
              display: String(containers.withinFreeTime),
              tone: 'good',
            },
            {
              label: 'Back past free time',
              value: containers.pastFreeTime,
              display: String(containers.pastFreeTime),
              tone: 'attention',
            },
            ...(containers.stillOut > 0
              ? [
                  {
                    label: 'Still out today',
                    value: containers.stillOut,
                    display: String(containers.stillOut),
                    tone: 'attention' as const,
                  },
                ]
              : []),
          ]}
          footnote={
            <div className="grid grid-cols-3 gap-x-4 gap-y-4">
              <Readout
                label="Average time out"
                value={`${containers.avgCycleDays.toFixed(1)}d`}
              />
              <Readout
                label="Detention days"
                value={String(containers.detentionDays)}
                attention={containers.detentionDays > 0}
              />
              <Readout
                label="Demurrage days"
                value={String(containers.demurrageDays)}
                attention={containers.demurrageDays > 0}
              />
            </div>
          }
        />
      </div>
    </Block>
  );
}
