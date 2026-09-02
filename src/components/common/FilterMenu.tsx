import { forwardRef, useMemo, type ButtonHTMLAttributes } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system';
import { ChevronDown, RotateCcw, SlidersHorizontal } from '@/design-system/icons';
import { cn } from '@/utils';

export interface FilterTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** How many choices are away from their default. */
  count?: number;
  /** Whether the surface it opens is currently showing. */
  open?: boolean;
  label?: string;
  className?: string;
}

/**
 * THE filter button. One look, every list in the app.
 *
 * Exported on its own because not every filter surface is a dropdown: the
 * Shipments toolbar opens a twelve-field grid, which is not something to put
 * in a menu. That page had grown its own bordered "Filters" button while the
 * ten surfaces using `FilterMenu` had a teal "Filter By:" pill — the same
 * control with two faces, which is the thing this component was written to
 * stop. Whatever opens, the button is this.
 *
 * Bordered and quiet by default, tinted once something is on. It used to be a
 * filled teal pill, which made the *filter* the loudest object on a page whose
 * subject is the list below it.
 */
export const FilterTrigger = forwardRef<HTMLButtonElement, FilterTriggerProps>(
  function FilterTrigger({ count = 0, open = false, label = 'Filters', className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={count > 0 ? `${label}, ${count} active` : label}
        className={cn(
          'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors duration-fast',
          open || count > 0
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-surface text-muted-foreground hover:text-foreground',
          className,
        )}
        {...rest}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {label}
        {count > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold leading-5 text-primary">
            {count}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 transition-transform duration-fast', open && 'rotate-180')}
        />
      </button>
    );
  },
);

/* ---------------------------------------------------------------------------
 * FilterMenu
 * ---------------------------------------------------------------------------
 * One button that holds every way of narrowing or ordering a list.
 *
 * Before this, each list page put its own loose `<Select>`s into `FilterBar`'s
 * children slot, and no two pages agreed: Shippers had industry *and* sort,
 * Vehicles had type *and* sort, Drivers and Partners had sort alone, the
 * Control Tower had its own, and Shipments had a separate toolbar with
 * transporter, cargo type, sort and a "Mine" toggle laid out differently again.
 * Five pages, five arrangements of the same idea, and on a narrow column they
 * each wrapped in their own way.
 *
 * The controls were also unlabelled in the row: a select reading "Name (A–Z)"
 * does not say whether it sorts or filters until you open it, and two of them
 * side by side read as a pair of unrelated words.
 *
 * ## The rules
 *
 * **One trigger, whatever the page.** The button says the same thing
 * everywhere, so the control is found by memory rather than by scanning. What
 * differs between pages is what is *inside* it, which is the part that should
 * differ.
 *
 * **Every choice is named.** Each group carries its label — "Industry",
 * "Sort by" — so an option is read together with the question it answers.
 *
 * **The badge counts what is not default.** A page opened fresh shows no
 * badge; anything the reader changed is counted, so "why am I not seeing all
 * of them" has an answer on the button itself rather than inside it.
 *
 * **Reset is in the menu, not beside it.** The old "Clear" button sat outside
 * and only appeared once something was active, so the row's width changed as
 * you used it, shifting the controls under the pointer.
 * ------------------------------------------------------------------------- */

export interface FilterMenuOption {
  value: string;
  label: string;
}

export interface FilterMenuGroup {
  key: string;
  /** Names the question this group answers — "Industry", "Sort by". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterMenuOption[];
  /**
   * The value that counts as "not narrowed", for the badge and for Reset.
   * Defaults to the first option, which is the "All …" entry by convention.
   */
  defaultValue?: string;
}

export interface FilterMenuProps {
  groups: FilterMenuGroup[];
  /** Trigger text. Left alone unless a page has a genuinely different noun. */
  label?: string;
  /**
   * Also run by Reset, for the filters a page owns outside this menu — its
   * search box, its status tabs, a risk band clicked on a tile above. Without
   * it those pages keep a second "Clear" button beside the trigger and the row
   * has two ways to undo, which is the inconsistency this component exists to
   * remove.
   */
  onReset?: () => void;
  /** Whether those outside filters are currently narrowing anything. */
  resetActive?: boolean;
  className?: string;
}

const defaultOf = (group: FilterMenuGroup): string =>
  group.defaultValue ?? group.options[0]?.value ?? '';

export function FilterMenu({
  groups,
  label = 'Filters',
  onReset,
  resetActive = false,
  className,
}: FilterMenuProps) {
  const changed = useMemo(
    () => groups.filter((group) => group.value !== defaultOf(group)),
    [groups],
  );

  const canReset = changed.length > 0 || resetActive;
  const reset = () => {
    for (const group of changed) group.onChange(defaultOf(group));
    onReset?.();
  };

  if (groups.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger count={changed.length} label={label} className={className} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, index) => (
          <div key={group.key}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="type-label text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={group.value} onValueChange={group.onChange}>
              {group.options.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}

        {canReset && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={reset}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
