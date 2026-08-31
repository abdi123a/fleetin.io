import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { PlanningCalendar, type PlanningEvent, type PlanningEventTone } from '@/components/console';
import { buildPath, ROUTES } from '@/config/routes';

import { taskUrgency } from '../components/taskUrgency';
import { TASK_PRIORITY_LABEL, type TaskStatus, type WorkspaceTask } from '../contracts';

/**
 * A task's STATUS, in the tones the rest of Workspace already wears.
 *
 * This used to grade by urgency — late / soon / planned / done — which gave the
 * calendar a fourth vocabulary nobody had seen anywhere else in the module.
 * A reader who has learned that sky is Open, green is In Progress and amber is
 * Waiting from every badge, card and board column should not have to learn a
 * second scheme to read a grid.
 *
 * `PlanningCalendar` grew three tones for this — `available`, `active`,
 * `waiting` — but they are rungs of the same app-wide `--stage-*` scale it
 * already spoke through `paired` and `returned`, not a private palette.
 *
 * The one exception is OVERDUE, which stays red. A calendar is a view of
 * deadlines, and "which of these is late" is the question it exists to answer;
 * red is also exactly what the due pill on the same task wears in the list, so
 * the exception is still the app's own colour, not a new one.
 */
const STATUS_TONE: Record<TaskStatus, PlanningEventTone> = {
  OPEN: 'available',
  IN_PROGRESS: 'active',
  WAITING: 'waiting',
  COMPLETED: 'returned',
  CANCELLED: 'returned',
};

export function toneFor(task: Pick<WorkspaceTask, 'status' | 'dueAt'>): PlanningEventTone {
  return taskUrgency(task.dueAt, task.status) === 'overdue' ? 'late' : STATUS_TONE[task.status];
}

export interface TaskCalendarProps {
  tasks: WorkspaceTask[];
}

/**
 * Tasks on their due dates.
 *
 * Nearly free: the grid, the week/month switch, the overflow handling and the
 * legend all already exist for Empty Container. This maps tasks onto
 * `PlanningEvent[]` and does nothing else — a second calendar would be a
 * thousand lines to say the same thing differently.
 *
 * A task with no due date simply is not here. That is honest: a calendar is a
 * view of *when*, and work with no when belongs on the list or the board.
 */
export function TaskCalendar({ tasks }: TaskCalendarProps) {
  const navigate = useNavigate();

  const events = useMemo<PlanningEvent[]>(
    () =>
      tasks
        .filter((task) => task.dueAt)
        .map((task) => ({
          id: task.id,
          at: new Date(task.dueAt as string).getTime(),
          title: task.reference,
          subtitle: task.title,
          meta: task.assignee ? task.assignee.firstName : TASK_PRIORITY_LABEL[task.priority],
          tone: toneFor(task),
        })),
    [tasks],
  );


  return (
    <PlanningCalendar
      events={events}
      now={Date.now()}
      /* Month, not the component's default week. The legend counts what is IN
         VIEW, so a week view opened on a Monday reported "Overdue 0" while two
         tasks were late — they were simply in the previous week. A month is
         also the honest unit for a deadline calendar. */
      defaultView="month"
      unitLabel={{ one: 'task', many: 'tasks' }}
      /* The status ladder, in ladder order, plus the one urgency state a
         deadline view cannot drop. Cancelled shares Completed's grey and is
         not listed separately — on a calendar both mean "no longer work". */
      legend={[
        { tone: 'late', label: 'Overdue' },
        { tone: 'available', label: 'Open' },
        { tone: 'active', label: 'In progress' },
        { tone: 'waiting', label: 'Waiting' },
        { tone: 'returned', label: 'Closed' },
      ]}
      onSelectEvent={(event) => {
        const task = tasks.find((t) => t.id === event.id);
        if (task) navigate(buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference }));
      }}
    />
  );
}
