import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { compact, compactDjf, fmtDjf } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  PanelLink,
  PillTabs,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK, rankedBarOptions } from './charts';
import type { NetworkModel } from '../model';

type Side = 'shippers' | 'transporters';

/**
 * Who the platform runs the work with, ranked by the money each side carries.
 *
 * One panel with a toggle rather than two side by side. The two lists answer
 * the same question from either end, and setting them next to each other
 * invites the false comparison — a client's billing and a transporter's cost
 * are not the same axis, and the subtitle changes with the toggle so it is
 * never ambiguous which one is on screen.
 */
export function NetworkCard({ network, className }: { network: NetworkModel; className?: string }) {
  const [side, setSide] = useState<Side>('shippers');
  const rows = useMemo(
    () => (side === 'shippers' ? network.shippers : network.transporters).slice(0, 6),
    [side, network],
  );

  const pending = side === 'shippers' ? network.shippersPending : network.transportersPending;
  const registered = side === 'shippers' ? network.shipperCount : network.transporterCount;
  const color = side === 'shippers' ? CHART_INK.teal : CHART_INK.tealDeep;

  const options = useMemo(
    () =>
      rankedBarOptions({
        categories: rows.map((row) => row.name),
        colors: [color],
        formatter: (value) => compact(value),
        tooltip: {
          shared: false,
          intersect: true,
          custom: ({ dataPointIndex }) => {
            const row = rows[dataPointIndex];
            if (!row) return '';
            return buildTooltipHtml(
              row.name,
              [
                {
                  key: 'v',
                  label: side === 'shippers' ? 'Billed to them' : 'Owed to them',
                  value: fmtDjf(row.valueDjf),
                  color,
                },
              ],
              `${row.shipments} shipments · ${row.containers} containers${row.unpriced > 0 ? ` · ${row.unpriced} unpriced` : ''}`,
            );
          },
        },
      }),
    [rows, color, side],
  );

  const series = useMemo(
    () => [
      {
        name: side === 'shippers' ? 'Billed' : 'Owed',
        data: rows.map((row) => Math.round(row.valueDjf)),
      },
    ],
    [rows, side],
  );

  const leader = rows[0];
  const totalValue = rows.reduce((sum, row) => sum + row.valueDjf, 0);

  return (
    <ConsolePanel
      className={className}
      title="The network"
      subtitle={
        side === 'shippers'
          ? 'Clients ranked by what has been billed against them'
          : 'Transporters ranked by what the work owes them'
      }
      action={
        <Link to={side === 'shippers' ? ROUTES.shippers : ROUTES.partners}>
          <PanelLink>{side === 'shippers' ? 'Shippers' : 'Transporters'}</PanelLink>
        </Link>
      }
      band={
        <PillTabs<Side>
          className="mt-3"
          tabs={[
            { key: 'shippers', label: 'Shippers', count: network.shippers.length },
            { key: 'transporters', label: 'Transporters', count: network.transporters.length },
          ]}
          active={side}
          onChange={setSide}
        />
      }
      footer={
        <InsightNote tone={pending > 0 ? 'attention' : 'neutral'}>
          {leader && totalValue > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {leader.name} carries {compactDjf(leader.valueDjf)}
              </span>{' '}
              — {Math.round((leader.valueDjf / totalValue) * 100)}% of everything on this side.
              {pending > 0
                ? ` ${pending} of the ${registered} registered ${side === 'shippers' ? 'shippers are' : 'transporters are'} not yet approved to trade.`
                : ` All ${registered} registered are approved to trade.`}
            </>
          ) : (
            <>
              No {side === 'shippers' ? 'client' : 'transporter'} has run a shipment yet, so there is nothing to
              rank. {registered} {registered === 1 ? 'is' : 'are'} registered.
            </>
          )}
        </InsightNote>
      }
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No {side === 'shippers' ? 'shipper' : 'transporter'} has run a shipment yet.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <ApexChart type="bar" series={series} options={options} height={Math.max(160, rows.length * 36)} />
        </div>
      )}
    </ConsolePanel>
  );
}
