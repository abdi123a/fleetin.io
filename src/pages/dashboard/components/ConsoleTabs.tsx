import { cn } from '@/utils';

/**
 * The console's section bar — the kit's `PillTabs` with one addition.
 *
 * `PillTabs` renders its count in muted grey, which is right when the count is
 * just a row total. Here the count is how many things in that section need a
 * decision, so it has to carry severity: red once a rule in that section is
 * already broken, orange while it is only asking. Everything else — the sunken
 * track, the raised active pill, the type — is the kit's, unchanged, so the bar
 * still reads as part of the same instrument.
 */

export interface ConsoleTab<K extends string> {
  key: K;
  label: string;
  /** Items in this section needing a decision. Zero renders no badge. */
  alerts: number;
  /** True when at least one of those is an actual breach. */
  breached: boolean;
}

export function ConsoleTabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: ConsoleTab<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-card-nested bg-surface-sunken p-1', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] px-5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.alerts > 0 ? (
              <span
                aria-label={`${tab.alerts} needing a decision`}
                className={cn(
                  'inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-extrabold tabular-nums',
                  tab.breached
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-accent-bold text-accent-bold-foreground',
                )}
              >
                {tab.alerts}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
