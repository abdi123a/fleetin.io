import { useRef, type ReactNode } from 'react';
import {
  BarChart3,
  Container,
  FileText,
  Gauge,
  MapPin,
  Truck,
  Wallet,
} from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The seven subjects of the analytics suite.
 *
 * The page used to be one 8,500px scroll of ~30 cards, which is why the same
 * number could appear three times without anyone noticing: nothing was ever on
 * screen next to its own duplicate. Splitting by subject means one view answers
 * one question, and a number that shows up in two views is a deliberate
 * cross-reference rather than an accident.
 *
 * Underline tabs, matching `ShipperTabNav` — these views are peers, and a pill
 * bar would read as a filter sitting directly under the actual filter bar.
 */

export type AnalyticsTabKey =
  | 'overview'
  | 'operations'
  | 'cost'
  | 'containers'
  | 'transporters'
  | 'reports'
  | 'history';

export interface AnalyticsTab {
  key: AnalyticsTabKey;
  label: string;
  icon: ReactNode;
  /** A count worth seeing before you click. Omit rather than pass zero-as-unknown. */
  count?: number;
  /** Draws the count as an alert instead of a neutral pill. */
  countIntent?: 'neutral' | 'critical';
}

export interface AnalyticsTabNavProps {
  active: AnalyticsTabKey;
  onChange: (tab: AnalyticsTabKey) => void;
  /** Open shipments scoring above the risk threshold. */
  atRiskCount: number;
  /** Containers already past their free time. */
  overdueReturnCount: number;
  /** Shipments in the searchable history. */
  historyCount: number;
}

export function AnalyticsTabNav({
  active,
  onChange,
  atRiskCount,
  overdueReturnCount,
  historyCount,
}: AnalyticsTabNavProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const tabs: AnalyticsTab[] = [
    { key: 'overview', label: 'Overview', icon: <Gauge /> },
    {
      key: 'operations',
      label: 'Operations',
      icon: <MapPin />,
      count: atRiskCount || undefined,
      countIntent: 'critical',
    },
    { key: 'cost', label: 'Cost', icon: <Wallet /> },
    {
      key: 'containers',
      label: 'Containers',
      icon: <Container />,
      count: overdueReturnCount || undefined,
      countIntent: 'critical',
    },
    { key: 'transporters', label: 'Transporters', icon: <Truck /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 /> },
    { key: 'history', label: 'History', icon: <FileText />, count: historyCount },
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
      aria-label="Analytics views"
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
            id={`analytics-tab-${tab.key}`}
            data-tab-key={tab.key}
            aria-selected={isActive}
            aria-controls={`analytics-panel-${tab.key}`}
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
