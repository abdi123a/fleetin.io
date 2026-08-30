import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/design-system';
import { Plus } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { RaiseTaskDialog } from '@/features/workspace';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * The layout route the four Workspace views share.
 *
 * It owns the two things no single view can without duplicating: the module
 * title, and the one "Raise" entry point. Deliberately *not* a tab strip — the
 * sidebar already lists Inbox and the three task views, and repeating them
 * under the page title is the same navigation twice. Empty Container made that
 * call first and it holds here for the same reason.
 */
const VIEW_LABEL: Record<string, string> = {
  [ROUTES.workspaceInbox]: 'Inbox',
  [ROUTES.workspaceMyTasks]: 'My Tasks',
  [ROUTES.workspaceAssignedByMe]: 'Assigned by Me',
  [ROUTES.workspaceAllTasks]: 'All Tasks',
};

export function WorkspaceModuleChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [raising, setRaising] = useState(false);

  const label = VIEW_LABEL[location.pathname]
    ?? (location.pathname.startsWith('/workspace/task/') ? 'Task' : undefined);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 px-4 pb-12 pt-1 sm:px-6">
      <PageHeader
        title="Workspace"
        description={label}
        actions={
          can('workspace.create') ? (
            <Button size="sm" shape="pill" onClick={() => setRaising(true)} leadingIcon={<Plus className="h-4 w-4" />}>
              Raise a task
            </Button>
          ) : undefined
        }
      />

      <Outlet />

      <RaiseTaskDialog
        open={raising}
        onOpenChange={setRaising}
        onCreated={(reference) => navigate(buildPath(ROUTES.workspaceTaskDetail, { reference }))}
      />
    </div>
  );
}

export default WorkspaceModuleChrome;
