import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { CircleCheck, X } from '@/design-system/icons';
import { startFinanceClock, useFinanceStore } from '@/stores/finance.store';

/**
 * The layout route the seven finance views share.
 *
 * Exactly two things must happen once for the whole module: the 30-second
 * clock every validation window reads from, and the one toast renderer the
 * store's actions narrate through. Views mount and unmount as the operator
 * moves; this layout does not, so both live here.
 *
 * Deliberately absent: page titles and tab strips. Each view carries its own
 * `PageHeader`, keeping one `<h1>` per page.
 */
export function FinanceModuleChrome() {
  const toast = useFinanceStore((state) => state.toast);
  const dismissToast = useFinanceStore((state) => state.dismissToast);

  useEffect(() => startFinanceClock(), []);

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
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
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

export default FinanceModuleChrome;
