import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { CheckCircle2, X } from '@/design-system/icons';
import { useEmptyReturnStore, startEmptyReturnClock } from '@/stores/emptyReturn.store';

/**
 * The layout route the five Empty Return views share.
 *
 * It exists for the two things that must happen exactly once for the whole
 * module, and which no individual view can own without duplicating it:
 *
 * The clock. Slack and risk are read off `store.now`, so a 30s tick has to be
 * running or every deadline on screen quietly freezes. Views mount and unmount
 * as the operator moves between tabs; the layout does not, so the interval
 * lives here and each view stops caring.
 *
 * The toast. Seven actions across Cycles and Matching — marking an empty ready,
 * creating a cycle, confirming the checklist, dispatching, advancing a
 * milestone — report back through `store.toast`. Rendering it per view would
 * stack two fixed elements the moment a view navigates while a message is up,
 * so there is one renderer, at the module's root.
 *
 * Deliberately not here: the page title and the tab strip. Each view carries
 * its own `PageHeader`, which keeps one `<h1>` per page and lets a view be
 * mounted standalone.
 */
export function EmptyReturnModuleChrome() {
  const toast = useEmptyReturnStore((state) => state.toast);
  const dismissToast = useEmptyReturnStore((state) => state.dismissToast);

  useEffect(() => startEmptyReturnClock(), []);

  return (
    <>
      <Outlet />

      {toast !== null && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-5 z-toast flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
        >
          <div className="flex max-w-md items-start gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-card">
            {/* Every message this store emits is a confirmation of an action the
                operator just took, so the mark is always the same one. */}
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="type-body-sm text-foreground">{toast}</p>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default EmptyReturnModuleChrome;
