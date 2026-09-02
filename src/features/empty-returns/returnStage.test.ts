import { describe, expect, it } from 'vitest';
import { emptyReturnStageOf } from './returnStage';

/**
 * When may a booking card offer "Book return"?
 *
 * Only on `waiting_match`. The rule the user set on 2026-09-02: a container
 * that is still full cannot be booked a ride home, because there is nothing to
 * send back yet — it may be Delivered, it may be Unstuffing, and in both cases
 * the box is either still on the truck or still being emptied.
 *
 * The gate is `emptyReadyAt`, a recorded moment, not an inference from the
 * status label. These tests exist so it stays that way: a later change that
 * keys the button off a list of statuses instead would read fine and fail here.
 */

type Booking = Parameters<typeof emptyReturnStageOf>[0];

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    status: 'Empty Ready',
    containerNumber: 'CMAU5023686',
    emptyReadyAt: '2026-09-01T08:00:00.000Z',
    emptyReturnException: null,
    ...overrides,
  } as Booking;
}

describe('emptyReturnStageOf', () => {
  describe('a box that is still full offers nothing', () => {
    /* The rungs the user named. Each is a real state where the container has
       arrived but has not been recorded as stripped. */
    it.each(['Arrived', 'Unloading', 'POD Submitted'])(
      '%s without emptyReadyAt is awaiting_empty, never waiting_match',
      (status) => {
        const stage = emptyReturnStageOf(booking({ status, emptyReadyAt: null }), undefined);
        expect(stage).toBe('awaiting_empty');
      },
    );

    it('does not apply at all before the load is delivered', () => {
      /* En Route, Loading, Pending — the question is not yet askable, so the
         card draws no return row rather than an empty one. */
      expect(
        emptyReturnStageOf(booking({ status: 'En Route', emptyReadyAt: null }), undefined),
      ).toBeUndefined();
    });

    it('ignores a stray emptyReadyAt on an undelivered booking', () => {
      /* The delivered gate is checked before the stripped one, so bad data
         cannot open the action early either. */
      expect(emptyReturnStageOf(booking({ status: 'Loading' }), undefined)).toBeUndefined();
    });
  });

  describe('the mark survives the whole journey home', () => {
    /**
     * `Empty Picked Up` is the rung this file exists for.
     *
     * It was missing from the frontend's `DELIVERED_STATUSES` while the backend
     * had it, so a container whose return had already been arranged lost its
     * mark the moment a truck actually collected it, and got it back only once
     * the box was logged home. The one stretch where "how is this going back"
     * is a live question answered with nothing.
     */
    it.each(['Empty Ready', 'Empty Picked Up'])(
      'a standalone return still reads as standalone on %s',
      (status) => {
        expect(
          emptyReturnStageOf(
            booking({ status, emptyReturnException: 'STANDALONE_RETURN_REQUIRED' }),
            undefined,
          ),
        ).toBe('standalone');
      },
    );

    it.each(['Empty Ready', 'Empty Picked Up'])(
      'a matched return still reads as matched on %s',
      (status) => {
        expect(emptyReturnStageOf(booking({ status }), { returnedAt: null })).toBe('matched');
      },
    );

    it('names every status the backend calls delivered', () => {
      /* Parity with `empty-return-status.util.ts`. The two lists are separate
         copies in separate codebases; this is what notices when they drift. */
      const delivered = [
        'Arrived',
        'Unloading',
        'POD Submitted',
        'Empty Ready',
        'Empty Picked Up',
        'Completed',
      ];
      for (const status of delivered) {
        expect(emptyReturnStageOf(booking({ status }), undefined)).toBeDefined();
      }
    });
  });

  describe('once the box is recorded as stripped', () => {
    it('waiting_match — nothing arranged, so the card asks somebody to act', () => {
      expect(emptyReturnStageOf(booking(), undefined)).toBe('waiting_match');
    });

    it('matched — a cycle exists and the box is not home yet', () => {
      expect(emptyReturnStageOf(booking(), { returnedAt: null })).toBe('matched');
    });

    it('standalone — matching stopped, it goes back on its own', () => {
      expect(
        emptyReturnStageOf(
          booking({ emptyReturnException: 'STANDALONE_RETURN_REQUIRED' }),
          undefined,
        ),
      ).toBe('standalone');
    });

    it('returned — the box is home', () => {
      expect(
        emptyReturnStageOf(booking(), { returnedAt: '2026-09-02T10:00:00.000Z' }),
      ).toBe('returned');
    });

    it('a cycle outranks the standalone flag', () => {
      /* Both set means the box was flagged for a solo return and then paired
         anyway. The pairing is the later and truer fact. */
      expect(
        emptyReturnStageOf(booking({ emptyReturnException: 'STANDALONE_RETURN_REQUIRED' }), {
          returnedAt: null,
        }),
      ).toBe('matched');
    });
  });

  it('a load with no container never owes a return', () => {
    /* Bulk and machinery are tipped, not stripped. This used to read
       "Awaiting match" on tipper loads, inventing an obligation. */
    expect(
      emptyReturnStageOf(booking({ containerNumber: null, status: 'Completed' }), undefined),
    ).toBeUndefined();
  });
});
