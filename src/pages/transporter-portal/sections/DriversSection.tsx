import { useMemo, useState } from 'react';
import { Users } from '@/design-system/icons';
import { ChartCard } from '@/features/shipper-bi/charts';
import { formatCompact, formatKm, inPeriod, type TripFact } from '@/features/transporter-bi';
import { cn } from '@/utils';
import type { TransporterSectionProps } from '../sectionContract';
import { StatCard } from './cards/StatCard';
import { TablePager, usePagedRows } from './cards/TablePager';

type SortKey = 'rank' | 'trips' | 'onTimeRate' | 'distanceKm' | 'name';

interface DriverRow {
  driverId: string;
  name: string;
  trips: number;
  onTimeRate: number;
  distanceKm: number;
  rank: number;
}

/**
 * Drivers — ranked performance from period-filtered trip facts, joined to
 * driver names on the dataset.
 */
export function DriversSection({
  dataset,
  facts,
  period,
  onOpenDetail,
}: TransporterSectionProps) {
  const [sortKey, setSortKey] = useState<SortKey>('onTimeRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const periodFacts = useMemo(() => inPeriod(facts, period), [facts, period]);

  const leaderboard = useMemo(() => {
    const rows = buildDriverLeaderboard(periodFacts, dataset);
    return sortDriverRows(rows, sortKey, sortDir);
  }, [periodFacts, dataset, sortKey, sortDir]);

  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(leaderboard, { pageSize, resetKey: `${sortKey}|${sortDir}` });

  const headline = useMemo(() => {
    const trips = periodFacts.length;
    const driversWithTrips = leaderboard.length;
    const onTimeSum = leaderboard.reduce((sum, row) => sum + row.onTimeRate, 0);
    const fleetOnTime = driversWithTrips > 0 ? onTimeSum / driversWithTrips : 0;
    return { trips, driversWithTrips, fleetOnTime };
  }, [periodFacts, leaderboard]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Trips run"
          value={formatCompact(headline.trips)}
          caption="Completed in this period"
        />
        <StatCard
          label="Drivers with trips"
          value={formatCompact(headline.driversWithTrips)}
          caption="Active in this period"
        />
        <StatCard
          label="Fleet on-time contribution"
          value={`${(headline.fleetOnTime * 100).toFixed(1)}%`}
          caption="Average on-time across drivers"
          intent={
            headline.driversWithTrips === 0
              ? 'neutral'
              : headline.fleetOnTime >= 0.92
                ? 'good'
                : headline.fleetOnTime < 0.85
                  ? 'warning'
                  : 'neutral'
          }
        />
      </div>


      <ChartCard
        title="Driver Leaderboard"
        subtitle={`${leaderboard.length} drivers with trips in this period`}
        icon={<Users className="size-4" />}
        isEmpty={leaderboard.length === 0}
        emptyMessage="No driver activity in this period."
        tableRows={leaderboard}
        tableColumns={[
          { key: 'rank', header: 'Rank', align: 'left', render: (row) => row.rank },
          { key: 'name', header: 'Driver', align: 'left', render: (row) => row.name },
          { key: 'trips', header: 'Trips', render: (row) => formatCompact(row.trips) },
          {
            key: 'onTimeRate',
            header: 'On-time',
            render: (row) => `${(row.onTimeRate * 100).toFixed(1)}%`,
          },
          {
            key: 'distanceKm',
            header: 'Distance',
            render: (row) => formatKm(row.distanceKm),
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <SortHeader label="#" active={sortKey === 'rank'} dir={sortDir} onClick={() => toggleSort('rank')} align="left" />
                <SortHeader label="Driver" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} align="left" />
                <SortHeader label="Trips" active={sortKey === 'trips'} dir={sortDir} onClick={() => toggleSort('trips')} />
                <SortHeader label="On-time" active={sortKey === 'onTimeRate'} dir={sortDir} onClick={() => toggleSort('onTimeRate')} />
                <SortHeader label="Distance" active={sortKey === 'distanceKm'} dir={sortDir} onClick={() => toggleSort('distanceKm')} />
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((row) => (
                <tr
                  key={row.driverId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() => onOpenDetail({ kind: 'driver', driverId: row.driverId })}
                >
                  <td className="py-2.5 pr-4 font-semibold tabular-nums text-foreground">
                    {row.rank}
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatCompact(row.trips)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 text-right font-medium tabular-nums',
                      row.onTimeRate >= 0.92 ? 'text-success' : 'text-warning-foreground',
                    )}
                  >
                    {(row.onTimeRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-foreground">
                    {formatKm(row.distanceKm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leaderboard.length > 0 ? (
          <TablePager
            paged={paged}
            noun="drivers"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </ChartCard>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'right',
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={cn('py-2 pr-4', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          active ? 'text-foreground' : 'text-muted-foreground',
          align === 'right' && 'ml-auto',
        )}
      >
        {label}
        {active ? <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </th>
  );
}

function buildDriverLeaderboard(
  facts: TripFact[],
  dataset: TransporterSectionProps['dataset'],
): DriverRow[] {
  const byDriver = new Map<
    string,
    { trips: number; onTime: number; judged: number; distanceKm: number }
  >();

  for (const fact of facts) {
    const entry = byDriver.get(fact.driverId) ?? {
      trips: 0,
      onTime: 0,
      judged: 0,
      distanceKm: 0,
    };
    entry.trips += 1;
    entry.distanceKm += fact.totalKm || fact.distanceKm;
    if (fact.onTime !== undefined) {
      entry.judged += 1;
      if (fact.onTime) entry.onTime += 1;
    }
    byDriver.set(fact.driverId, entry);
  }

  const nameById = new Map(dataset.drivers.map((driver) => [driver.id, driver.name]));

  const rows = Array.from(byDriver.entries()).map(([driverId, entry]) => ({
    driverId,
    name: nameById.get(driverId) ?? driverId,
    trips: entry.trips,
    onTimeRate: entry.judged > 0 ? entry.onTime / entry.judged : 0,
    distanceKm: Math.round(entry.distanceKm),
    rank: 0,
  }));

  // Default ranking: on-time, then trips, then distance.
  rows.sort((a, b) => {
    if (b.onTimeRate !== a.onTimeRate) return b.onTimeRate - a.onTimeRate;
    if (b.trips !== a.trips) return b.trips - a.trips;
    return b.distanceKm - a.distanceKm;
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function sortDriverRows(rows: DriverRow[], key: SortKey, dir: 'asc' | 'desc'): DriverRow[] {
  const sorted = [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === 'string' && typeof right === 'string') {
      return left.localeCompare(right);
    }
    return Number(left) - Number(right);
  });
  if (dir === 'desc') sorted.reverse();
  // Keep rank as the default-order position, not the current sort position.
  return sorted;
}
