import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/design-system';
import { Plus } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { RaiseTaskDialog } from '@/features/workspace';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/utils';

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
  /* One entry, because there is now one tasks screen. Which view is open and
     whose work it shows are said by the tab strip and the scope control on
     the page itself — repeating either here would be the same word twice. */
  [ROUTES.workspaceTasks]: 'Tasks',
  [ROUTES.workspaceAutomation]: 'Recurring & Templates',
  [ROUTES.workspaceMessages]: 'Messages',
};

export function WorkspaceModuleChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [raising, setRaising] = useState(false);

  const label = VIEW_LABEL[location.pathname]
    ?? (location.pathname.startsWith('/workspace/task/') ? 'Task' : undefined)
    ?? (location.pathname.startsWith('/workspace/messages') ? 'Messages' : undefined);

  /*
   * Messages is a full-height, self-scrolling screen — three panes that each
   * scroll on their own. Every other view is a document that grows down the
   * page. One chrome, two shapes: the alternative is a second layout route
   * for one screen.
   */
  const isMessages = location.pathname.startsWith('/workspace/messages');

  return (
    <div
      className={cn(
        'mx-auto flex w-full min-w-0 max-w-[1600px] flex-col px-4 pt-1 sm:px-6',
        isMessages ? 'h-[calc(100vh-var(--fl-header-height)-2rem)] gap-3 pb-3' : 'gap-5 pb-12',
      )}
    >
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

      {isMessages ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      ) : (
        <Outlet />
      )}

      <RaiseTaskDialog
        open={raising}
        onOpenChange={setRaising}
        onCreated={(reference) => navigate(buildPath(ROUTES.workspaceTaskDetail, { reference }))}
      />
    </div>
  );
}

export default WorkspaceModuleChrome;
