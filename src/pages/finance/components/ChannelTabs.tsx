import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import type { OriginationChannel } from '@/types/finance';
import { cn } from '@/utils';

/**
 * The two books of business, as tabs.
 *
 * Fleetin-originated and DPCS-originated work is a genuine partition — a client
 * can appear under both, but a project belongs to exactly one — so the split is
 * a tab, not a filter chip. Each side leads with its own mark rather than a
 * word, because the operator thinks of these as two counterparties.
 *
 * Both marks sit on a white disc in every state, selected or not. A logo that
 * changes its backing when you click it stops reading as that company's logo,
 * so selection is carried by the pill around it instead.
 *
 * `dpcs-icon.png` is the DPCS compass cropped out of the full lock-up: the
 * wordmark version was illegible at 24px and duplicated the "DPCS" label
 * sitting next to it.
 */

export const CHANNEL_META: Record<
  OriginationChannel,
  { label: string; icon: string; blurb: string }
> = {
  fleetin_direct: {
    label: 'Fleetin',
    icon: '/logo/fleetin-icon.png',
    blurb: "Work Fleetin's own desk booked and priced",
  },
  dpcs: {
    label: 'DPCS',
    icon: '/logo/dpcs-icon.png',
    blurb: 'Work that arrived through the DPCS channel',
  },
};

export function ChannelTabs({
  active,
  counts,
}: {
  active: OriginationChannel;
  counts: Record<OriginationChannel, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Origination channel"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-card"
    >
      {(['fleetin_direct', 'dpcs'] as OriginationChannel[]).map((channel) => {
        const meta = CHANNEL_META[channel];
        const isActive = channel === active;
        return (
          <Link
            key={channel}
            to={`${ROUTES.financeShipments}?channel=${channel}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'group flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              isActive
                ? 'bg-primary-bold text-primary-bold-foreground'
                : 'text-foreground hover:bg-surface-sunken',
            )}
          >
            <span
              className={cn(
                'inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white transition-shadow',
                isActive ? 'ring-2 ring-white/70' : 'ring-1 ring-border',
              )}
            >
              <img src={meta.icon} alt="" className="size-7 object-contain" loading="lazy" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-extrabold">{meta.label}</span>
              <span
                className={cn(
                  'block text-[11px] font-bold',
                  isActive ? 'text-primary-bold-foreground/75' : 'text-muted-foreground',
                )}
              >
                {counts[channel]} client{counts[channel] === 1 ? '' : 's'}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** The channel mark used inline — beside a project name, on a booking header. */
export function ChannelBadge({
  channel,
  className,
}: {
  channel: OriginationChannel;
  className?: string;
}) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-bold text-foreground',
        className,
      )}
    >
      <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border">
        <img src={meta.icon} alt="" className="size-4 object-contain" loading="lazy" />
      </span>
      {meta.label}
    </span>
  );
}
