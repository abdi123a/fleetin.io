import { useEffect, useRef, type ReactNode } from 'react';
import {
  Clock,
  FileText,
  Gauge,
  Globe,
  Route,
  Users,
  Wallet,
} from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The seven subjects of the transporter command center.
 *
 * Same shape and discipline as the shipper suite's `AnalyticsTabNav`: one
 * subject, one tab, one card. Underline tabs because these views are peers —
 * a pill bar directly under the filter bar would read as another filter.
 */

export type TransporterTabKey =
  | 'overview'
  | 'operations'
  | 'delays'
  | 'drivers'
  | 'payments'
  | 'network'
  | 'trips';

export function isTransporterTabKey(value: string | null): value is TransporterTabKey {
  return (
    value !== null &&
    ['overview', 'operations', 'delays', 'drivers', 'payments', 'network', 'trips'].includes(value)
  );
}

interface TransporterTab {
  key: TransporterTabKey;
  label: string;
  icon: ReactNode;
  /** A count worth seeing before you click. Omit rather than pass zero. */
  count?: number;
  countIntent?: 'neutral' | 'critical';
}

export interface TransporterTabNavProps {
  active: TransporterTabKey;
  onChange: (tab: TransporterTabKey) => void;
  /** Live trips nearing arrival with no return load. */
  emptyRiskCount: number;
  /** Invoices past due. */
  overdueCount: number;
  /** Trips in the searchable report. */
  tripCount: number;
}

export function TransporterTabNav({
  active,
  onChange,
  emptyRiskCount,
  overdueCount,
  tripCount,
}: TransporterTabNavProps) {
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the selected tab in view.
   *
   * Seven tabs need ~960px and a phone has 343, so the strip scrolls. Arriving
   * on `?tab=trips` from a sidebar deep link used to leave the strip parked at
   * Overview with the real selection off the right-hand edge — the page said
   * one thing and the tab bar said another. Nothing to do on a wide screen,
   * where every tab is already visible.
   */
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>(`[data-tab-key="${active}"]`);
    if (!list || !selected) return;
    if (list.scrollWidth <= list.clientWidth) return;

    const overshootLeft = selected.offsetLeft - list.scrollLeft;
    const overshootRight =
      selected.offsetLeft + selected.offsetWidth - (list.scrollLeft + list.clientWidth);
    if (overshootLeft >= 0 && overshootRight <= 0) return;

    // Centre it rather than nudge it to the edge: the neighbouring tabs are
    // the affordance that says the strip scrolls at all.
    list.scrollTo({
      left: selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [active]);

  const tabs: TransporterTab[] = [
    { key: 'overview', label: 'Overview', icon: <Gauge /> },
    {
      key: 'operations',
      label: 'Fleet & Backhaul',
      icon: <Route />,
      count: emptyRiskCount || undefined,
      countIntent: 'critical',
    },
    { key: 'delays', label: 'Delays & Waiting', icon: <Clock /> },
    { key: 'drivers', label: 'Drivers', icon: <Users /> },
    {
      key: 'payments',
      label: 'Payments',
      icon: <Wallet />,
      count: overdueCount || undefined,
      countIntent: 'critical',
    },
    { key: 'network', label: 'Network', icon: <Globe /> },
    { key: 'trips', label: 'Trip Reports', icon: <FileText />, count: tripCount },
  ];

  /** Arrow keys move between tabs — a tablist that only responds to Tab is a list. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;

    onChange(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-key="${next.key}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Command center views"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const isAlert = tab.countIntent === 'critical';
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`transporter-tab-${tab.key}`}
            data-tab-key={tab.key}
            aria-selected={isActive}
            aria-controls={`transporter-panel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5',
              'text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              '[&_svg]:size-4 [&_svg]:shrink-0',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
            )}
          >
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                  isAlert
                    ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                    : isActive
                      ? 'bg-primary-subtle text-primary-subtle-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
