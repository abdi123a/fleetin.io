import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MapPin, Phone, Truck } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import { ROUTES } from '@/config/routes';
import { cn, formatNumber } from '@/utils';
import type { SpotlightTransporter } from '../../contracts';
import { formatMetric } from '../../format';
import { CardHeading } from '../../charts';
import { getTransporterLogoUrl } from '../../mocks/transporterProfiles';

const TRUCK_IMAGES = [
  '/images/fleet-truck-1.webp',
  '/images/fleet-truck-2.webp',
  '/images/fleet-truck-3.webp',
];

const DEFAULT_TRANSPORTERS: [SpotlightTransporter, ...SpotlightTransporter[]] = [
  {
    transporterId: 'TRP-04',
    name: 'Tadjoura Haulage',
    fleetCode: 'TDJ',
    logoUrl: getTransporterLogoUrl('TRP-04'),
    totalFleet: 6,
    deliveries: 19,
    onTimeRate: 0.789,
    distanceKm: 16665,
    activeVehiclePlate: 'DJ 1461 TDJ',
    activeShipmentStage: 'Empty Awaiting',
    driverName: 'Mohamed Hassan',
    driverPhone: '+253 77 12 34 56',
  },
  {
    transporterId: 'TRP-05',
    name: 'Red Sea Movers',
    fleetCode: 'RSM',
    logoUrl: getTransporterLogoUrl('TRP-05'),
    totalFleet: 8,
    deliveries: 42,
    onTimeRate: 0.925,
    distanceKm: 28410,
    activeVehiclePlate: 'DJ 2204 KLA',
    activeShipmentStage: 'On-Route',
    driverName: 'Ali Ahmed',
    driverPhone: '+253 77 89 01 23',
  },
  {
    transporterId: 'TRP-07',
    name: 'Gulf Freight Partners',
    fleetCode: 'GFP',
    logoUrl: getTransporterLogoUrl('TRP-07'),
    totalFleet: 4,
    deliveries: 28,
    onTimeRate: 0.857,
    distanceKm: 19200,
    activeVehiclePlate: 'DJ 0891 TKR',
    activeShipmentStage: 'Loading Cargo',
    driverName: 'Ibrahim Warsama',
    driverPhone: '+253 77 45 67 89',
  },
];

export interface FleetSpotlightCardProps {
  transporters?: SpotlightTransporter[];
  onOpenTransporter?: (transporter: SpotlightTransporter) => void;
  /** Surface overrides for the host page — the shipper dashboard puts every
   *  panel on `shadow-card`, the analytics sections leave them bordered. */
  className?: string;
}

export function FleetSpotlightCard({
  transporters: providedTransporters,
  onOpenTransporter,
  className,
}: FleetSpotlightCardProps) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);

  const transporters =
    providedTransporters && providedTransporters.length > 0
      ? providedTransporters
      : DEFAULT_TRANSPORTERS;

  const count = transporters.length;
  const index = Math.min(activeIndex, count - 1);
  const transporter = transporters[index] ?? DEFAULT_TRANSPORTERS[0];
  const totalVehicles = transporters.reduce((total, t) => total + t.totalFleet, 0);

  const handleOpenVehicles = () => {
    if (onOpenTransporter) {
      onOpenTransporter(transporter);
    } else {
      navigate(ROUTES.vehicles);
    }
  };

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-5 overflow-hidden', className)}>
      <CardHeading
        title="Vehicles"
        icon={<Truck className="size-4" />}
        actions={
          <button
            type="button"
            onClick={handleOpenVehicles}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
          >
            {totalVehicles} Total
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatBox
          value={formatMetric(transporter.deliveries, 'count')}
          label="Deliveries"
          tone="teal"
        />
        <StatBox
          value={formatMetric(transporter.onTimeRate, 'percent')}
          label="On-time Rate"
          tone="peach"
        />
        <StatBox
          value={formatNumber(Math.round(transporter.distanceKm), { maximumFractionDigits: 0 })}
          label="Distance (km)"
          tone="sky"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {/*
          A product render rather than an icon: this card is the one place the
          dashboard shows the physical thing the numbers are about, and a
          photographic vehicle grounds an otherwise entirely abstract panel.
        */}
        <div className="relative -mx-6 h-40 min-h-40 w-[calc(100%+3rem)] flex-1 overflow-hidden">
          {transporters.map((t, i) => {
            // Shortest way round the ring, so with three vehicles there is
            // always exactly one peeking left and one peeking right.
            let offset = i - index;
            if (offset > count / 2) offset -= count;
            if (offset < -count / 2) offset += count;

            const isActive = offset === 0;
            const isPeeking = Math.abs(offset) === 1;

            return (
              <button
                key={t.transporterId}
                type="button"
                aria-label={
                  isActive
                    ? undefined
                    : offset < 0
                      ? `Previous vehicle (${t.name})`
                      : `Next vehicle (${t.name})`
                }
                aria-hidden={!isActive && !isPeeking}
                tabIndex={isActive || !isPeeking ? -1 : 0}
                onClick={() => !isActive && setActiveIndex(i)}
                style={{
                  transform: `translateX(${offset * 48}%) scale(${isActive ? 1 : 0.52})`,
                  opacity: isActive ? 1 : isPeeking ? 0.45 : 0,
                  zIndex: isActive ? 10 : 1,
                }}
                className={cn(
                  'group absolute inset-0 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  isActive ? 'cursor-default' : 'cursor-pointer hover:opacity-85',
                  !isPeeking && 'pointer-events-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                <img
                  src={TRUCK_IMAGES[i % TRUCK_IMAGES.length]}
                  alt=""
                  width={520}
                  height={290}
                  loading="lazy"
                  className={cn(
                    'size-full object-contain transition-transform duration-300 dark:opacity-90',
                    !isActive && 'group-hover:scale-105',
                  )}
                />
              </button>
            );
          })}
        </div>

        <p key={`plate-${index}`} className="animate-fade text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {transporter.activeVehiclePlate ?? transporter.fleetCode}
          </span>
          {transporter.activeShipmentStage ? (
            <>
              {' · '}
              <span className="font-medium text-primary-subtle-foreground">
                {transporter.activeShipmentStage}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div
        key={`operator-${index}`}
        className="flex animate-fade items-center gap-3 border-t border-border-subtle pt-5"
      >
        <CompanyAvatar
          src={transporter.logoUrl ?? getTransporterLogoUrl(transporter.transporterId) ?? getTransporterLogoUrl(transporter.name)}
          name={transporter.name}
          fallback={transporter.fleetCode.slice(0, 2).toUpperCase()}
          size="lg"
          shape="circle"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{transporter.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatNumber(transporter.totalFleet, { maximumFractionDigits: 0 })} vehicle
            {transporter.totalFleet === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <RoundAction
            label={`See ${transporter.name}'s shipments`}
            onClick={handleOpenVehicles}
            icon={<MapPin className="size-4" />}
          />
          <RoundAction
            label={`Call ${transporter.name} dispatch`}
            href={`tel:${transporter.driverPhone.replace(/\s/g, '')}`}
            icon={<Phone className="size-4" />}
          />
          <RoundAction
            label={`Email ${transporter.name} dispatch`}
            href={`mailto:dispatch@${transporter.fleetCode.toLowerCase()}.dj`}
            icon={<Mail className="size-4" />}
          />
        </div>
      </div>
    </Card>
  );
}

type StatTone = 'teal' | 'peach' | 'sky';

const STAT_TONE: Record<StatTone, { box: string; value: string; label: string }> = {
  teal: {
    box: 'border-transparent bg-tile-teal',
    value: 'text-tile-teal-foreground',
    label: 'text-tile-teal-foreground/80',
  },
  peach: {
    box: 'border-transparent bg-tile-peach',
    value: 'text-tile-foreground',
    label: 'text-tile-foreground/75',
  },
  sky: {
    box: 'border-transparent bg-tile-sky',
    value: 'text-tile-foreground',
    label: 'text-tile-foreground/75',
  },
};

function StatBox({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: StatTone;
}) {
  const styles = STAT_TONE[tone];
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-card-nested border px-2 py-4 text-center',
        styles.box,
      )}
    >
      <span className={cn('text-2xl font-semibold leading-none', styles.value)}>{value}</span>
      <span className={cn('text-xs leading-tight', styles.label)}>{label}</span>
    </div>
  );
}

function RoundAction({
  label,
  icon,
  href,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    'flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className={className}>
        {icon}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={className}>
      {icon}
    </button>
  );
}
