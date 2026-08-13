import { useRef, type ReactNode } from 'react';
import { Link2, Repeat } from '@/design-system/icons';
import { cn } from '@/utils';

export type CyclesTabKey = 'cycles' | 'chains';

interface TabDef {
  key: CyclesTabKey;
  label: string;
  icon: ReactNode;
  count?: number;
}

export interface EmptyReturnCyclesTabNavProps {
  active: CyclesTabKey;
  onChange: (tab: CyclesTabKey) => void;
  /** Live chain count for the tab badge — omit rather than pass zero-as-unknown. */
  chainsCount: number;
}

/**
 * Cycles and Chains as tabs of one page, not two routes.
 *
 * Underline tabs, matching `AnalyticsTabNav` — a chain is a read *of* the
 * cycles list, not a filter sitting under the filter bar a pill bar would
 * suggest here. These two views used to be separate pages; the chain count
 * that used to sit in the Chains page's own header badge now lives on the
 * tab instead, so it's visible before you click.
 */
export function EmptyReturnCyclesTabNav({ active, onChange, chainsCount }: EmptyReturnCyclesTabNavProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const tabs: TabDef[] = [
    { key: 'cycles', label: 'Cycles', icon: <Repeat /> },
    { key: 'chains', label: 'Chains', icon: <Link2 />, count: chainsCount || undefined },
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
      aria-label="Empty return cycle views"
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
            id={`cycles-tab-${tab.key}`}
            data-tab-key={tab.key}
            aria-selected={isActive}
            aria-controls={`cycles-panel-${tab.key}`}
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
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
