import { Outlet, useLocation } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { ROUTES } from '@/config/routes';
import { cn } from '@/utils';

/**
 * The layout route the Workspace screens share.
 *
 * It owns one thing no single screen can without duplicating: the module
 * title. Deliberately *not* a tab strip — the sidebar lists the screens, and
 * repeating them under the page title is the same navigation twice. Empty
 * Container made that call first and it holds here for the same reason.
 *
 * It used to own a "Raise a task" button too, on every screen — see the note
 * where the header is rendered.
 */
const VIEW_LABEL: Record<string, string> = {
  /* One entry, because there is now one tasks screen. Which view is open and
     whose work it shows are said by the tab strip and the scope control on
     the page itself — repeating either here would be the same word twice. */
  [ROUTES.workspaceTasks]: 'Tasks',
  [ROUTES.workspaceMessages]: 'Slack',
};

export function WorkspaceModuleChrome() {
  const location = useLocation();

  const label = VIEW_LABEL[location.pathname]
    ?? (location.pathname.startsWith('/workspace/task/') ? 'Task' : undefined)
    ?? (location.pathname.startsWith('/workspace/messages') ? 'Slack' : undefined);

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
      {/*
       * No action in the masthead.
       *
       * "Raise a task" sat here on EVERY Workspace screen, which put a create
       * button above a task you were already reading, above a channel, and
       * above the recurring rules — three places where the answer to "what do
       * I do here" is not "make another task". The button belongs on the
       * screen that lists tasks, and it is there; the board also raises
       * straight into a column, and every record page has its own Raise.
       */}
      <PageHeader title="Workspace" description={label} />

      {isMessages ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      ) : (
        <Outlet />
      )}

    </div>
  );
}

export default WorkspaceModuleChrome;
