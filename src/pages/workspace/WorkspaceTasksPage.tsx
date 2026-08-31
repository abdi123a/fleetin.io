import { useSearchParams } from 'react-router-dom';

import { TaskList, type RecordType } from '@/features/workspace';

/**
 * Tasks — one screen.
 *
 * It used to be three: My Tasks, Assigned by Me and All Tasks, three sidebar
 * rows and three routes for the same list with one filter changed. Whose work
 * you want is `?scope=` on the page now, which composes with the state bands
 * instead of being a separate axis you have to navigate away to change.
 *
 * The record filter still arrives in the query string — that is the link
 * behind every "2 open" badge on a record page.
 */
export function WorkspaceTasksPage() {
  const [params] = useSearchParams();

  const recordType = params.get('recordType') as RecordType | null;
  const recordId = params.get('recordId');
  const scope = params.get('scope');

  return (
    <TaskList
      baseFilters={{
        ...(recordType ? { recordType } : {}),
        ...(recordId ? { recordId } : {}),
      }}
      emptyCopy={
        scope === 'mine'
          ? 'Nothing is assigned to you.'
          : scope === 'raised'
            ? 'You have not raised anything yet.'
            : 'No tasks yet. Raise one from here, or from any shipment, vehicle or driver.'
      }
    />
  );
}

export default WorkspaceTasksPage;
