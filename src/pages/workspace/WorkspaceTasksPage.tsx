import { useSearchParams } from 'react-router-dom';

import { useAuthStore } from '@/stores';
import { TaskList, type RecordType } from '@/features/workspace';

export type TaskScope = 'mine' | 'assigned-by-me' | 'all';

const EMPTY_COPY: Record<TaskScope, string> = {
  mine: 'Nothing is assigned to you.',
  'assigned-by-me': 'You have not handed anything to anybody yet.',
  all: 'No tasks yet. Raise one from here, or from any shipment, vehicle or driver.',
};

/**
 * The three task views, off one list.
 *
 * They differ only in which filter is fixed, so they share a component rather
 * than being three pages that drift apart. The record filter arrives in the
 * query string — that is the link behind every "2 open" badge on a record page.
 */
export function WorkspaceTasksPage({ scope }: { scope: TaskScope }) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [params] = useSearchParams();

  const recordType = params.get('recordType') as RecordType | null;
  const recordId = params.get('recordId');

  return (
    <TaskList
      baseFilters={{
        ...(scope === 'mine' ? { assigneeId: currentUserId } : {}),
        ...(scope === 'assigned-by-me' ? { createdById: currentUserId } : {}),
        ...(recordType ? { recordType } : {}),
        ...(recordId ? { recordId } : {}),
      }}
      emptyCopy={EMPTY_COPY[scope]}
    />
  );
}

export const WorkspaceMyTasksPage = () => <WorkspaceTasksPage scope="mine" />;
export const WorkspaceAssignedByMePage = () => <WorkspaceTasksPage scope="assigned-by-me" />;
export const WorkspaceAllTasksPage = () => <WorkspaceTasksPage scope="all" />;
