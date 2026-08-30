import type { ReactNode } from 'react';

import { Select } from '@/design-system';
import { Search, X } from '@/design-system/icons';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * FilterBar
 * ---------------------------------------------------------------------------
 * The one way a list page says "which of these am I looking at".
 *
 * Built for the Empty Container Control Tower and lifted here so Shippers,
 * Partners, Vehicles and Drivers stop each having their own. They had four
 * copies of the same idea and no two looked alike: filled primary pills on one
 * page, outlined chips on another, different heights, different type sizes,
 * and every one of them wrapped in `overflow-x-auto`, so on a phone the filters
 * ran off the right edge and had to be dragged into view. A filter you have to
 * find by dragging is a filter you do not know you have.
 *
 * ## The rules this component exists to hold
 *
 * **Tabs, not pills.** The labels sit on the page's own left margin with a rule
 * under the active one, so they line up with the table headings below by
 * construction rather than by matching paddings against a container.
 *
 * **Colour goes on the count, never the label.** Five differently-coloured
 * words have no hierarchy between them. The number is the part that is news.
 * A zero drops back to grey: an empty band is not news however urgent its name.
 *
 * **Never scrolls.** Below `sm` the tabs become a select carrying the same
 * options in the same order — one control, everything in it, nothing hidden
 * behind a gesture.
 * ------------------------------------------------------------------------- */

export interface FilterTab<K extends string> {
  key: K;
  label: string;
  /** Text class for this tab's count. Omit for a neutral one. */
  tone?: string;
  count: number;
}

export interface FilterBarProps<K extends string> {
  tabs: FilterTab<K>[];
  active: K;
  onSelect: (key: K) => void;
  /** Accessible name for both the tab list and its small-screen select. */
  label: string;
  /** Search box. Omit to leave the right-hand side to `children`. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** `matched of total`, printed inside the field once something is typed. */
    matched?: number;
    total?: number;
    inputRef?: React.Ref<HTMLInputElement>;
  };
  /** Sorts, view switchers — anything that belongs beside the search. */
  children?: ReactNode;
  className?: string;
}

export function FilterBar<K extends string>({
  tabs,
  active,
  onSelect,
  label,
  search,
  children,
  className,
}: FilterBarProps<K>) {
  return (
    /* A CONTAINER query, not a viewport one. This bar sits in the main column
       with a sidebar beside it, so "is the window wide" and "is there room on
       this line" are different questions — the same mismatch that had the
       Control Tower's table scrolling sideways on a 1200px screen. */
    <div className={cn('@container/bar min-w-0 border-b border-border', className)}>
      {/* Side by side only once the bar itself is wide enough. Narrower, a tab
          row and a 256px field want the same line and the search lands on top
          of the last tab; it takes its own row above them instead. Above rather
          than below, so the active tab's underline always meets the hairline.
          The threshold counts the bands: 52rem was measured against four, and a
          fifth (every directory gained one in Aug 2026) broke the row onto two
          lines at every width between 52 and 64rem — the tabs wrapping under
          themselves while the search sat beside them.

          64rem was still too low. Above the breakpoint the controls are
          `shrink-0`, so every pixel the row is short comes out of the tab list,
          and a five-band row beside three controls turned into a ragged column
          of one band per line the moment the sidebar collapsed and the bar
          crossed 64rem. 72rem is the width at which five bands and a full
          control set genuinely fit; below it the bar stacks, which is the
          layout that was working. */}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2',
          tabs.length > 4
            ? '@[72rem]/bar:flex-row @[72rem]/bar:items-end @[72rem]/bar:justify-between @[72rem]/bar:gap-6'
            : '@[52rem]/bar:flex-row @[52rem]/bar:items-end @[52rem]/bar:justify-between @[52rem]/bar:gap-6',
        )}
      >
        <div className="pb-2 @[30rem]/bar:hidden">
          <Select
            value={active}
            aria-label={label}
            onChange={(event) => onSelect(event.target.value as K)}
            className="h-10 font-semibold"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label} ({tab.count})
              </option>
            ))}
          </Select>
        </div>

        {/* `gap-x-5` rather than `6`: with five bands the extra 4px of gutter
            was the difference between one line and two on a 1280px screen. */}
        <div
          role="tablist"
          aria-label={label}
          className="hidden min-w-0 flex-wrap items-end gap-x-5 gap-y-1 @[30rem]/bar:flex"
        >
          {tabs.map((tab) => (
            <FilterTabButton
              key={tab.key}
              label={tab.label}
              count={tab.count}
              tone={tab.tone}
              active={active === tab.key}
              onClick={() => onSelect(tab.key)}
            />
          ))}
        </div>

        {/* One control per row until there is room to share one. Below about
            26rem a sort select and a search field on the same line leave the
            search a stub you cannot read your own query in. */}
        {(search || children) && (
          <div className="order-first flex w-full flex-col items-stretch gap-2 pb-2 @[26rem]/bar:flex-row @[26rem]/bar:flex-wrap @[26rem]/bar:items-center @[52rem]/bar:order-last @[52rem]/bar:w-auto @[52rem]/bar:flex-nowrap @[52rem]/bar:shrink-0">
            {children}
            {search && <SearchField {...search} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One tab: a label, its count, and a rule under it when it is the one you are on.
 *
 * `-mb-px` sits the tab's own border on top of the bar's hairline rather than
 * under it, so the active rule replaces the line instead of doubling it.
 */
function FilterTabButton({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      <span className="text-xs font-semibold">{label}</span>
      <span
        className={cn(
          'font-mono text-xs font-bold tabular-nums',
          count === 0 || !tone ? 'text-muted-foreground' : tone,
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * The search field every list page shares.
 *
 * Typing gets an answer: a search that silently narrows a table below the fold
 * leaves the reader scrolling to find out whether it matched anything at all.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  matched,
  total,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  matched?: number;
  total?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}) {
  const counting = value.trim() !== '' && matched !== undefined && total !== undefined;
  return (
    <div className={cn('relative min-w-0 flex-1 @[52rem]/bar:w-60 @[52rem]/bar:flex-none', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="type-body-sm h-9 w-full rounded-md border border-input bg-surface pl-9 pr-20 text-foreground transition-colors placeholder:text-muted-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary [&::-webkit-search-cancel-button]:appearance-none"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {counting && (
          <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
            {matched}/{total}
          </span>
        )}
        {value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
