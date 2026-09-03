import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/utils';

export interface ViewTab<K extends string> {
  key: K;
  label: string;
  /** Four words of similar length are hard to re-find; the shape is what the
      eye returns to. Same reasoning as `DataTable`'s column headings. */
  icon?: ComponentType<{ className?: string }>;
}

export interface ViewTabsProps<K extends string> {
  tabs: ViewTab<K>[];
  value: K;
  onChange: (next: K) => void;
  /** The page's own action, pushed to the far end of the same band. */
  actions?: ReactNode;
  /** Accessible name for the strip. */
  label: string;
  className?: string;
}

/**
 * Which view of this page you are looking at, as a tab strip.
 *
 * A strip rather than a segmented pill, because a view is not a *setting* on
 * the page — it is which page you are looking at. Both surfaces that needed
 * one had ended up with a small pill floating alone on its own line under the
 * title, beside nothing, which reads as a stray control rather than as
 * navigation; putting the page's action at the far end turns that line into a
 * band with weight at both ends.
 *
 * Shared rather than copied. The Shipments switcher already carried a comment
 * saying it existed so "every switch in the app reads as one control
 * language" — which is only true if there is one of them.
 */
export function ViewTabs<K extends string>({
  tabs, value, onChange, actions, label, className,
}: ViewTabsProps<K>) {
  return (
    <div
      /* `items-end`, so the tabs reach the rule their underline has to meet.
         The action is lifted off it by its own `pb-1.5` below — sitting a
         pill directly on a hairline reads as an accident.

         `flex-wrap-reverse`, the same answer `FilterBar` uses and for the same
         reason: when the action and the tabs cannot share a line, the action
         takes a line of its own ABOVE and the tabs stay on the bottom one,
         still touching the rule their underline belongs to. Without it the
         action is `shrink-0` and wins, so the tablist scrolls instead — which
         on a phone hid the second tab behind a scrollbar nobody would think to
         drag. Wrapping beats guessing a breakpoint: the band reflows at
         whatever width its own contents actually stop fitting. */
      className={cn(
        'flex min-w-0 flex-wrap-reverse items-end gap-x-1 gap-y-2 border-b border-border',
        className,
      )}
    >
      <div role="tablist" aria-label={label} className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {tabs.map(({ key, label: text, icon: Icon }) => {
          const live = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={live}
              onClick={() => onChange(key)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors duration-fast',
                live ? 'text-primary-bold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon ? <Icon className="size-4" /> : null}
              {text}
              {live ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </button>
          );
        })}
      </div>

      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 pb-1.5 pl-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
