import { useState } from 'react';
import { ArrowRight } from '@/design-system/icons';
import { CompanyMark, formatKm } from '@/features/transporter-bi';
import { cn } from '@/utils';
import { ConsolePanel, Meter, PanelOutlineLink, UnderlineTabs } from './kit';
import type { AvailableLoad, CargoGroup } from './model';
import { CARGO_GROUPS, CARGO_GROUP_COLOR, CARGO_GROUP_LABELS } from './model';
import { djfFull } from './money';

/**
 * Return loads on the board, ranked by how well they fit a truck about to go
 * free.
 *
 * The bar under each row is the match score, and it is deliberately the widest
 * element: a load worth 96,000 francs that needs a truck on the other side of
 * the city is worth less than a smaller one the fleet is already next to, and
 * the money column alone would rank them the wrong way round.
 */

type LoadTab = 'all' | CargoGroup;

export interface AvailableLoadsCardProps {
  loads: AvailableLoad[];
  onViewAll?: () => void;
  className?: string;
}

export function AvailableLoadsCard({ loads, onViewAll, className }: AvailableLoadsCardProps) {
  const [active, setActive] = useState<LoadTab>('all');

  const tabs: Array<{ key: LoadTab; label: string; count: number }> = [
    { key: 'all', label: 'All', count: loads.length },
    ...CARGO_GROUPS.map((group) => ({
      key: group as LoadTab,
      label: CARGO_GROUP_LABELS[group],
      count: loads.filter((load) => load.group === group).length,
    })).filter((tab) => tab.count > 0),
  ];

  const visible = (active === 'all' ? loads : loads.filter((load) => load.group === active)).slice(
    0,
    5,
  );
  const nearby = loads.filter((load) => load.deadheadKm <= 20).length;

  return (
    <ConsolePanel
      className={className}
      title="Available Loads Nearby"
      subtitle="Shipper job orders matched to trucks finishing soon"
      action={
        <div className="flex gap-5 text-[11.5px] font-semibold text-muted-foreground">
          <span>Offer</span>
          <span>Free at</span>
        </div>
      }
      band={
        <UnderlineTabs className="mt-4" tabs={tabs} active={active} onChange={setActive} />
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body-xs text-muted-foreground">
            {nearby} of <span className="font-bold text-foreground">{loads.length} open loads</span>{' '}
            within 20 km of a truck going free
          </p>
          {onViewAll ? <PanelOutlineLink onClick={onViewAll}>View all loads →</PanelOutlineLink> : null}
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="type-body-xs text-muted-foreground">
          Nothing on the board for this cargo type right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((load) => (
            <li
              key={load.id}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_auto] sm:gap-4"
            >
              <div className="min-w-0">
                <p className="type-body-xs mb-2 min-w-0 truncate text-foreground">
                  <CompanyMark
                    name={load.customerName}
                    className="mr-1.5 inline-flex align-middle"
                  />
                  <span className="text-primary">{load.customerName}</span>
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  {load.origin}
                  <ArrowRight className="mx-1 inline size-3 text-muted-foreground/60" aria-hidden />
                  {load.destination}
                  <span className="ml-1.5 font-medium text-muted-foreground">
                    · {load.containerLabel} · {formatKm(load.distanceKm)}
                    {load.deadheadKm > 0 ? ` · ${load.deadheadKm} km deadhead` : ''}
                  </span>
                </p>
                <Meter
                  value={load.matchScore}
                  color={CARGO_GROUP_COLOR[load.group]}
                  height={9}
                />
              </div>

              <span
                className={cn(
                  'type-body-xs shrink-0 whitespace-nowrap font-bold tabular-nums sm:w-28 sm:text-right',
                  load.matched ? 'text-primary' : 'text-foreground',
                )}
              >
                {djfFull(load.revenue)}
              </span>
              <span className="type-body-xs shrink-0 whitespace-nowrap font-semibold tabular-nums text-foreground sm:w-16 sm:text-right">
                {load.freeAt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );
}

export default AvailableLoadsCard;
