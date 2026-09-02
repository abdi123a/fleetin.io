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
      {/*
       * `flex-wrap-reverse`, and NOT a breakpoint.
       *
       * This used to switch column→row at a measured container width — 52rem
       * for five bands, 40rem for fewer. Every one of those numbers was a
       * guess at how much room a tab row plus the controls need, and the guess
       * was wrong in the ordinary case: with the sidebar open on a 1125px
       * window the bar measures **813px against an 832px threshold** and spent
       * a whole extra row on itself for the sake of nineteen pixels.
       *
       * Wrapping answers the question the breakpoint was estimating — "do
       * these actually fit on one line" — from the real content, at any tab
       * count, with no number to maintain.
       *
       * REVERSE because the active tab's underline has to meet the bar's
       * hairline. Wrapped normally the controls would land beneath the tabs
       * and break that join; reversed, the first line sits at the bottom, so
       * the tabs keep the hairline and the controls take the line above.
       *
       * `items-start`, not `items-end`, and that is not a typo: `wrap-reverse`
       * inverts the cross axis, so `flex-end` resolves to the visual TOP. It
       * left the tab underline floating 13px above the hairline.
       */}
      <div className="flex min-w-0 flex-wrap-reverse items-start justify-between gap-x-6 gap-y-2">
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
            26rem a filter pill and a search field on the same line leave the
            search a stub you cannot read your own query in.

            `pb-2.5` matches the tab row's, so the two sit on one baseline when
            they share a line — they were `pb-2` against `pb-2.5`, which is the
            half-step of misalignment you could see but not name. */}
        {(search || children) && (
          <div className="flex w-full flex-col items-stretch gap-2 pb-2.5 @[26rem]/bar:w-auto @[26rem]/bar:flex-row @[26rem]/bar:flex-wrap @[26rem]/bar:items-center">
            {search && <SearchField {...search} />}
            {children}
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
    /* Full width only while it is alone on its own row. The moment there is
       room to sit beside anything it takes a fixed 13rem: `flex-1` made it
       swallow every spare pixel of the bar, which is a very large box to type
       one shipper's name into. */
    /* 15rem, not 13. At 13rem the box is 208px and the padding below took
       116 of them, leaving 92px of text room for a placeholder that needs
       101 — which is why "Search transporters…" read as "Search transp". */
    <div className={cn('relative min-w-0 flex-1 @[26rem]/bar:w-60 @[26rem]/bar:flex-none', className)}>
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
        className={cn(
          'type-body-sm h-9 w-full rounded-md border border-input bg-surface pl-9 text-foreground transition-colors',
          'placeholder:text-muted-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          '[&::-webkit-search-cancel-button]:appearance-none',
          /* Room on the right ONLY when something is there. `pr-20` was
             unconditional, so an empty field reserved 80px for a match count
             and a clear button that only exist while you are typing — and the
             placeholder was clipped to pay for them. */
          counting ? 'pr-20' : value !== '' ? 'pr-9' : 'pr-3',
        )}
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
