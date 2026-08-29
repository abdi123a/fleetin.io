import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { absorbBookingRecord, bookingQueryKeys } from './queries';
import type { BookingRecord } from './bookingsService';

/**
 * The card must never fall back to a status the booking has already left.
 *
 * Two faults produced the same symptom — "I have to refresh to see the change".
 *
 * The list is cached under whatever id the page holds: the Shipment Overview
 * page holds the shipment REFERENCE, because that is what its URL carries,
 * while the record coming back from a status write carries the shipment's UUID.
 * A write keyed off that UUID lands in a bucket nothing reads.
 *
 * And choosing "Empty Returned" writes several rungs, one request each. Every
 * one used to invalidate the list, starting a read while the next rung was
 * still being written — writes racing reads, last one home wins.
 */

/** What the page cached the list under: the reference out of the URL. */
const SHIPMENT_REFERENCE = '241719';
/** What the booking record carries. Deliberately not the same string. */
const SHIPMENT_UUID = 'a48756ae-fa33-4695-9f5f-d8e3b2bab55a';
const SHIPMENT = SHIPMENT_REFERENCE;

/** Only the fields these tests actually assert on; the rest of a real record is irrelevant here. */
const booking = (over: Partial<BookingRecord> & { id: string; status: string }) =>
  ({
    shipmentId: SHIPMENT_UUID,
    reference: 'BKG-706043',
    containerNumber: 'CMAU-752197-4',
    driver: { fullName: 'Guelleh Osman Aden' },
    vehicle: { plateNumber: 'GM-1023-DJ' },
    ...over,
  }) as unknown as BookingRecord;

const listOf = (client: QueryClient) =>
  client.getQueryData<BookingRecord[]>(bookingQueryKeys.forShipment(SHIPMENT));

describe('absorbBookingRecord', () => {
  it('leaves the cache on the last rung written, not on a read that started earlier', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.forShipment(SHIPMENT), [
      booking({ id: 'b1', status: 'Empty Ready' }),
    ]);

    // The read the first rung's invalidation used to kick off: slow, and
    // carrying the status as it was before any of this started.
    let staleReadSettled = false;
    const staleRead = client
      .prefetchQuery({
        queryKey: bookingQueryKeys.forShipment(SHIPMENT),
        queryFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return [booking({ id: 'b1', status: 'Empty Ready' })];
        },
      })
      .then(() => {
        staleReadSettled = true;
      });

    for (const status of ['Empty Picked Up', 'Completed']) {
      await absorbBookingRecord(client, booking({ id: 'b1', status }));
    }

    expect(listOf(client)?.[0]?.status).toBe('Completed');

    // And it still says Completed once the slow read has had its chance to land.
    await staleRead;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(staleReadSettled).toBe(true);
    expect(listOf(client)?.[0]?.status).toBe('Completed');
  });

  it('merges, so a status response does not blank the joined driver and vehicle', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.forShipment(SHIPMENT), [
      booking({ id: 'b1', status: 'Empty Ready' }),
    ]);

    // A response that carries the status and nothing else about the crew.
    await absorbBookingRecord(client, {
      id: 'b1',
      shipmentId: SHIPMENT,
      status: 'Completed',
    } as unknown as BookingRecord);

    const row = listOf(client)?.[0];
    expect(row?.status).toBe('Completed');
    expect(row?.driver?.fullName).toBe('Guelleh Osman Aden');
    expect(row?.vehicle?.plateNumber).toBe('GM-1023-DJ');
    expect(row?.containerNumber).toBe('CMAU-752197-4');
  });

  it('leaves the other bookings on the shipment alone', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.forShipment(SHIPMENT), [
      booking({ id: 'b1', status: 'Empty Ready' }),
      booking({ id: 'b2', status: 'Loaded' }),
    ]);

    await absorbBookingRecord(client, booking({ id: 'b1', status: 'Completed' }));

    expect(listOf(client)?.map((row) => row.status)).toEqual(['Completed', 'Loaded']);
  });

  it('reaches the list even though the page cached it under the reference, not the UUID', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.forShipment(SHIPMENT_REFERENCE), [
      booking({ id: 'b1', status: 'Empty Ready' }),
    ]);

    await absorbBookingRecord(client, booking({ id: 'b1', status: 'Completed' }));

    expect(listOf(client)?.[0]?.status).toBe('Completed');
    // And nothing was written into the bucket keyed by the record's own id.
    expect(
      client.getQueryData<BookingRecord[]>(bookingQueryKeys.forShipment(SHIPMENT_UUID)),
    ).toBeUndefined();
  });

  it('leaves another shipment\'s cached list untouched', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.forShipment(SHIPMENT_REFERENCE), [
      booking({ id: 'b1', status: 'Empty Ready' }),
    ]);
    client.setQueryData(bookingQueryKeys.forShipment('241507'), [
      booking({ id: 'other', status: 'Loaded' }),
    ]);

    await absorbBookingRecord(client, booking({ id: 'b1', status: 'Completed' }));

    expect(
      client.getQueryData<BookingRecord[]>(bookingQueryKeys.forShipment('241507'))?.[0]?.status,
    ).toBe('Loaded');
  });

  it('updates the single-booking cache the preview sheet reads', async () => {
    const client = new QueryClient();
    client.setQueryData(bookingQueryKeys.detail('b1'), booking({ id: 'b1', status: 'Empty Ready' }));

    await absorbBookingRecord(client, booking({ id: 'b1', status: 'Completed' }));

    expect(client.getQueryData<BookingRecord>(bookingQueryKeys.detail('b1'))?.status).toBe(
      'Completed',
    );
  });
});
