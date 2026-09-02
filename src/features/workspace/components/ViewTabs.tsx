import { Button } from '@/design-system';
import { Columns3, List as ListIcon, Plus, Users } from '@/design-system/icons';
import { cn } from '@/utils';

export const TASK_VIEWS = ['list', 'board', 'workload'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

const VIEW: Record<TaskView, { label: string; icon: typeof ListIcon }> = {
  list: { label: 'List', icon: ListIcon },
  board: { label: 'Board', icon: Columns3 },
  workload: { label: 'Workload', icon: Users },
};

export interface ViewTabsProps {
  value: TaskView;
  onChange: (next: TaskView) => void;
  /** Raise lives here now, not in the module masthead — see the note below. */
  onRaise?: () => void;
  className?: string;
}

/**
 * The three views, as a tab strip across the top of the screen.
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
 */
export function ViewTabs({ value, onChange, onRaise, className }: ViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Task view"
      className={cn('flex min-w-0 items-center gap-1 border-b border-border', className)}
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

      {/* Raise sits on the screen that lists tasks, not in the module masthead
          where it appeared above a task you were already reading, above a
          channel, above the rules. */}
      {onRaise ? (
        <Button size="sm" shape="pill" className="ml-auto shrink-0" onClick={onRaise} leadingIcon={<Plus className="h-4 w-4" />}>
          Raise a task
        </Button>
      ) : null}
    </div>
  );
}
