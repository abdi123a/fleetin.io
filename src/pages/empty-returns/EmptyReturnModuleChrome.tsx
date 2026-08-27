import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { CheckCircle2, Clock, RefreshCw, X } from '@/design-system/icons';
import { Button } from '@/design-system';
import { PageHeader } from '@/components/common/PageHeader';
import { useEmptyContainers } from '@/features/empty-returns';
import { formatClock, startEmptyReturnClock, useEmptyReturnStore } from '@/stores/emptyReturn.store';

import { cn } from '@/utils';

import { ContainerDetailDialog } from './components/ContainerDetailDialog';
import { Mono } from './components/marks';
import { viewForPath } from './components/views';

/**
 * The layout route all five Empty Container views share.
 *
 * It exists for the five things that must happen exactly once for the module,
 * and which no individual view can own without duplicating:
 *
 * **The clock.** Risk and every decision window are read off `store.now`, so a
 * 30s tick has to be running or every deadline on screen quietly freezes. Views
 * mount and unmount as the operator moves between tabs; the layout does not.
 *
 * **The title.** The app's own `PageHeader`, so this module opens exactly like
 * Shipments and Partners do — same 2xl primary title, same description line,
 * same action slot. The subtitle is the current view's own question, because
 * those questions are the product architecture, not decoration, and printing
 * one keeps each screen honest about its job.
 *
 * Deliberately *not* here: a tab strip. The sidebar already lists all five
 * views under Empty Container, and repeating them under the page title is the
 * same navigation twice — it spends a strip of vertical space on every screen
 * and leaves the reader working out which of the two controls is live.
 *
 * **The toast.** Four actions across three views report back through
 * `store.toast`; rendering it per view would stack two fixed elements the
 * moment a view navigated while a message was up.
 *
 * **The container dialog.** Every view opens the same one, driven by
 * `store.openRecordId` — a container detail that differed between the Control
 * Tower and the Calendar would be two products.
 */
export function EmptyReturnModuleChrome() {
  const location = useLocation();
  const view = viewForPath(location.pathname);

  const toast = useEmptyReturnStore((state) => state.toast);
  const dismissToast = useEmptyReturnStore((state) => state.dismissToast);
  const now = useEmptyReturnStore((state) => state.now);

  const { isLoading, refetch } = useEmptyContainers();

  useEffect(() => startEmptyReturnClock(), []);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 px-4 pb-12 pt-1 sm:px-6">
      <PageHeader
        title="Empty Container"
        description={view.question}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <Clock className="size-3.5" aria-hidden />
              <Mono>{formatClock(now)}</Mono>
            </span>
            <Button
              variant="outline"
              size="sm"
              shape="pill"
              onClick={refetch}
              disabled={isLoading}
              leadingIcon={
                <RefreshCw
                  className={cn('h-3.5 w-3.5', isLoading && 'animate-spin motion-reduce:animate-none')}
                />
              }
              className="text-xs"
            >
              Refresh
            </Button>
          </>
        }
      />

      <Outlet />

      <ContainerDetailDialog />

      {toast !== null && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-5 z-toast flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
        >
          <div className="flex max-w-md items-start gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-card">
            {/* Every message this store emits confirms an action the operator
                just took, so the mark is always the same one. */}
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-foreground">{toast}</p>
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
    </div>
  );
}

export default EmptyReturnModuleChrome;
