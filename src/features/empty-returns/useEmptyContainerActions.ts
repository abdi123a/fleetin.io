import { useCallback } from 'react';

import { HOUR_MS } from '@/data/emptyReturnData';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { errorMessage } from '@/utils/error';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';

import {
  useCancelCycle,
  useConfirmStandaloneReturn,
  useCreateCycle,
  usePlanEmptyReturn,
} from './api/queries';

/**
 * The four things an operator can actually do here, and nothing else.
 *
 * The whole product is two paths from one state:
 *
 * ```
 *                        ┌── FIND FULL LOAD ──▶ CONFIRM PAIRING ──▶ PAIRED ✓  (stop)
 *   EMPTY READY ────────┤
 *                        └── PLAN EMPTY RETURN ──▶ CONFIRM RETURN ──▶ CLOSED ✓
 * ```
 *
 * Plus one way back: a pairing that has not started moving can be cancelled.
 *
 * **The workflow stops at the decision.** There is no "prepare operation", no
 * "start execution", no "complete execution" — once a pairing is confirmed the
 * truck is the Shipment module's job and this module has nothing left to say.
 * That restraint is the product, so this hook is deliberately the only place
 * writes happen; a fifth action added anywhere else is a scope leak.
 *
 * Every action reports through the module toast, and every failure reports the
 * server's own message rather than a generic one — a refused pairing usually
 * refuses for a reason the operator can act on ("already claimed by another
 * cycle"), and swallowing that leaves them clicking a button that will never work.
 */
export interface EmptyContainerActions {
  confirmPairing: (record: EmptyReturnRecord, load: FullLoadMission) => Promise<boolean>;
  planReturn: (record: EmptyReturnRecord, plannedReturnAt?: number) => Promise<boolean>;
  confirmReturn: (record: EmptyReturnRecord) => Promise<boolean>;
  cancelPairing: (record: EmptyReturnRecord) => Promise<boolean>;
  /** Any write in flight — for disabling the buttons that would double-fire. */
  isBusy: boolean;
}

/**
 * A sensible default slot for a planned return: four hours out, but never past
 * the deadline it is trying to beat. An operator can move it; this is only the
 * value the picker opens on.
 */
export function defaultPlannedReturn(record: EmptyReturnRecord, now: number): number {
  const soon = now + 4 * HOUR_MS;
  if (!record.deadline) return soon;
  return Math.min(soon, Math.max(now + HOUR_MS / 2, record.deadline - HOUR_MS));
}

export function useEmptyContainerActions(): EmptyContainerActions {
  const notify = useEmptyReturnStore((state) => state.notify);

  const createCycle = useCreateCycle();
  const planReturnMutation = usePlanEmptyReturn();
  const confirmReturnMutation = useConfirmStandaloneReturn();
  const cancelCycleMutation = useCancelCycle();

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      notify(errorMessage(error, fallback));
      return false;
    },
    [notify],
  );

  const confirmPairing = useCallback(
    async (record: EmptyReturnRecord, load: FullLoadMission) => {
      if (!record.bookingId || !load.bookingId) {
        notify('This container is missing its booking link and cannot be paired.');
        return false;
      }
      try {
        await createCycle.mutateAsync({
          bookingId: record.bookingId,
          nextBookingId: load.bookingId,
        });
        notify(
          `Pairing confirmed — ${record.container || record.bookingReference} goes out under ${
            load.container || load.id
          } (${load.shipmentReference ?? load.id}).`,
        );
        return true;
      } catch (error) {
        return fail(error, 'The pairing could not be confirmed.');
      }
    },
    [createCycle, notify, fail],
  );

  const planReturn = useCallback(
    async (record: EmptyReturnRecord, plannedReturnAt?: number) => {
      if (!record.bookingId) {
        notify('This container is missing its booking link and cannot be planned.');
        return false;
      }
      try {
        await planReturnMutation.mutateAsync({
          bookingId: record.bookingId,
          plannedReturnAt: plannedReturnAt ? new Date(plannedReturnAt).toISOString() : undefined,
        });
        notify(
          `Empty return planned for ${record.container || record.bookingReference} — matching has stopped.`,
        );
        return true;
      } catch (error) {
        return fail(error, 'The empty return could not be planned.');
      }
    },
    [planReturnMutation, notify, fail],
  );

  const confirmReturn = useCallback(
    async (record: EmptyReturnRecord) => {
      if (!record.bookingId) {
        notify('This container is missing its booking link and cannot be closed.');
        return false;
      }
      try {
        await confirmReturnMutation.mutateAsync(record.bookingId);
        const late = Boolean(record.deadline && Date.now() > record.deadline);
        notify(
          late
            ? `Empty return confirmed for ${record.container || record.bookingReference} — after the deadline.`
            : `Empty return confirmed for ${record.container || record.bookingReference} — on time.`,
        );
        return true;
      } catch (error) {
        return fail(error, 'The empty return could not be confirmed.');
      }
    },
    [confirmReturnMutation, notify, fail],
  );

  const cancelPairing = useCallback(
    async (record: EmptyReturnRecord) => {
      if (!record.cycleId) {
        notify('This container is not paired, so there is nothing to cancel.');
        return false;
      }
      try {
        await cancelCycleMutation.mutateAsync(record.cycleId);
        notify(
          `Pairing cancelled — ${record.container || record.bookingReference} is back on Empty Ready.`,
        );
        return true;
      } catch (error) {
        return fail(error, 'The pairing could not be cancelled.');
      }
    },
    [cancelCycleMutation, notify, fail],
  );

  return {
    confirmPairing,
    planReturn,
    confirmReturn,
    cancelPairing,
    isBusy:
      createCycle.isPending ||
      planReturnMutation.isPending ||
      confirmReturnMutation.isPending ||
      cancelCycleMutation.isPending,
  };
}
