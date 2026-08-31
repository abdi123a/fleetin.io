import { NavLink } from 'react-router-dom';

import { CalendarDays, Columns3, List as ListIcon, Repeat, Users } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { cn } from '@/utils';

export const TASK_VIEWS = ['list', 'board', 'calendar', 'workload'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

const VIEW: Record<TaskView, { label: string; icon: typeof ListIcon }> = {
  list: { label: 'List', icon: ListIcon },
  board: { label: 'Board', icon: Columns3 },
  calendar: { label: 'Calendar', icon: CalendarDays },
  workload: { label: 'Workload', icon: Users },
};

export interface ViewTabsProps {
  value: TaskView;
  onChange: (next: TaskView) => void;
  className?: string;
}

/**
 * The four views, as a tab strip across the top of the screen.
 *
 * A strip rather than the segmented pill this replaced, because a view is not
 * a *setting* on the page — it is which page you are looking at, and the
 * reference tools all say so by putting it above everything else with an
 * underline under the live one. The pill sat beside the search box and read as
 * one more filter control among several.
 *
 * Each tab carries a glyph. Four words of similar length are hard to re-find
 * after looking away; the shape is what the eye actually returns to — the same
 * reason `DataTable`'s column headings carry one.
 *
 * "Recurring & Templates" rides on the end, separated by a rule and pushed to
 * the far side. It is a real destination, but it describes work that does not
 * exist yet, so it is not one of the four ways of looking at work that does.
 */
export function ViewTabs({ value, onChange, className }: ViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Task view"
      className={cn('flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border', className)}
    >
      {TASK_VIEWS.map((key) => {
        const { label, icon: Icon } = VIEW[key];
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
            <Icon className="size-4" aria-hidden />
            {label}
            {live ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
          </button>
        );
      })}

      <NavLink
        to={ROUTES.workspaceAutomation}
        className={({ isActive }) =>
          cn(
            'ml-auto flex shrink-0 items-center gap-1.5 border-l border-border py-2 pl-3 text-sm font-medium transition-colors duration-fast',
            isActive ? 'text-primary-bold' : 'text-muted-foreground hover:text-foreground',
          )
        }
      >
        <Repeat className="size-4" aria-hidden />
        <span className="hidden sm:inline">Recurring &amp; Templates</span>
        <span className="sm:hidden">Recurring</span>
      </NavLink>
    </div>
  );
}
