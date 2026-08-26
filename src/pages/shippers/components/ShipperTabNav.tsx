import { useRef, type ReactNode } from 'react';
import { BarChart3, Building2, CalendarDays, Package } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The three views of a shipper account.
 *
 * Underline tabs anchored to the page rather than a floating pill island: a
 * record page's sections are peers, and a pill bar reads as a filter — the
 * previous version reinforced that by growing the active tab 2%, so switching
 * views nudged the whole page. It also carried a "System Live" indicator and a
 * second copy of the record id, neither of which a reader can act on.
 *
 * Sticky under the shell header, because the tab you are in is the one thing
 * you lose track of on a page this tall.
 */

export type ShipperTabKey = 'analytics' | 'monthly-report' | 'shipments' | 'profile';

export interface ShipperTab {
  key: ShipperTabKey;
  label: string;
  icon: ReactNode;
  /** Rendered as a trailing count. Omit rather than pass zero-as-unknown. */
  count?: number;
}

export interface ShipperTabNavProps {
  active: ShipperTabKey;
  onChange: (tab: ShipperTabKey) => void;
  shipmentCount: number;
  documentCount: number;
}

export function ShipperTabNav({
  active,
  onChange,
  shipmentCount,
  documentCount,
}: ShipperTabNavProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const tabs: ShipperTab[] = [
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 /> },
    { key: 'monthly-report', label: 'Monthly Report', icon: <CalendarDays /> },
    { key: 'shipments', label: 'Active & Past Shipments', icon: <Package />, count: shipmentCount },
    { key: 'profile', label: 'Profile & compliance', icon: <Building2 />, count: documentCount },
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
    <div className="sticky top-header z-sticky bg-background/95 backdrop-blur-sm">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Shipper account views"
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`shipper-tab-${tab.key}`}
              data-tab-key={tab.key}
              aria-selected={isActive}
              aria-controls={`shipper-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5',
                'type-body-sm font-medium transition-colors',
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
                    'rounded-full px-1.5 py-0.5 type-caption tabular-nums',
                    isActive ? 'bg-primary-subtle text-primary-subtle-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
