import { beforeEach, describe, expect, it } from 'vitest';

import {
  ID_DIGITS,
  ID_MAX,
  derivedId,
  formatId,
  hashedId,
  idKindOf,
  nextId,
  parseId,
  registerIds,
  resetIdSequences,
} from '@/lib/ids';
import type {
  CostLine,
  FinanceBooking,
  FinanceShipment,
  PayoutHold,
  PodDocument,
} from '@/types/finance';

import {
  DAY_MS,
  HOUR_MS,
  bookingStage,
  canRelease,
  costLineStatus,
  hasCompletePod,
  isEarlyRelease,
  isHeld,
  missingPodDocuments,
  releaseBlocker,
  settlementFor,
  settlementsFor,
  shipmentProvenAt,
  shipmentStage,
  unprovenBookings,
  validationClock,
  wasReleasedEarly,
  withHold,
  withHoldCleared,
  withPodConfirmed,
  withSettlementPaid,
  withShipmentReleased,
} from './index';

/**
 * The payout engine, tested at the tier money actually moves on.
 *
 * Rewritten 2026-08-13 with the restructure. The suite this replaced tested a
 * model where each container was released and paid on its own; every one of
 * those assertions described behaviour the business does not want. The cases
 * below are the rules that replaced them:
 *
 *   1. One unproven container freezes the WHOLE consignment.
 *   2. A transporter appears ONCE per shipment, with every booking they
 *      carried summed — ten containers are one payable row, not ten.
 *   3. Paying settles every one of that party's lines across the shipment
 *      under a single voucher reference.
 *   4. A hold PAUSES the validation counter and never resets it.
 *   5. Held or unreleased money is never reported as payable.
 *   6. References are three letters and five digits, and never collide.
 */

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const T0 = new Date('2026-06-01T00:00:00.000Z').getTime();
const at = (hours: number): string => new Date(T0 + hours * HOUR_MS).toISOString();

const PROOFS: PodDocument[] = [
  {
    kind: 'signed_pdf',
    fileName: 'pod.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    uploadedAt: at(0),
    uploadedBy: 'test',
  },
  {
    kind: 'delivery_photo',
    fileName: 'drop.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2000,
    uploadedAt: at(0),
    uploadedBy: 'test',
  },
];

let costLineSeq = 0;
const cost = (counterpartyId: string, amountDjf: number, type: CostLine['type'] = 'transport'): CostLine => {
  costLineSeq += 1;
  return {
    id: formatId('costLine', costLineSeq),
    type,
    counterpartyId,
    counterpartyName: counterpartyId === 'PTR-001' ? 'Red Sea Express' : 'Horn Transit',
    amountDjf,
  };
};

/** One container, proven unless told otherwise. */
function booking(
  id: string,
  transporterId: string,
  costs: CostLine[],
  options: { proven?: boolean; delivered?: boolean; rate?: number | null } = {},
): FinanceBooking {
  const { proven = true, delivered = true, rate = 44_000 } = options;
  return {
    id,
    shipmentId: 'SHI-00001',
    containerNumber: `MSCU-${id.slice(-4)}`,
    cargoType: 'containerized',
    cargoSummary: '1×40ft',
    origin: 'Djibouti Port',
    destination: 'Addis Ababa',
    transporterId,
    clientRateDjf: rate,
    costLines: costs,
    proof: {
      completedAt: delivered ? at(0) : undefined,
      podSentAt: proven && delivered ? at(1) : undefined,
      podDocuments: proven && delivered ? PROOFS : [],
    },
  };
}

const shipment = (holds: PayoutHold[] = [], releasedAt?: string): FinanceShipment => ({
  id: 'SHI-00001',
  reference: 'BL-449120',
  projectId: 'PRJ-00001',
  clientId: 'SHP-101',
  fundingSourceId: 'CF-2026-AMINA',
  originationChannel: 'fleetin_direct',
  openedAt: at(-48),
  payout: { releasedAt, releasedBy: releasedAt ? 'test' : undefined, holds },
});

const hold = (id: string, raisedAt: string, clearedAt?: string): PayoutHold => ({
  id,
  category: 'damage',
  reason: 'Container arrived dented',
  raisedBy: 'test',
  raisedAt,
  clearedAt,
});

beforeEach(() => {
  costLineSeq = 0;
  resetIdSequences();
});

/* ── 1. One unproven container freezes the consignment ───────────────────── */

describe('release gating', () => {
  it('blocks the whole shipment when a single booking is unproven', () => {
    const bookings = [
      booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)]),
      booking('BKG-00002', 'PTR-001', [cost('PTR-001', 35_000)]),
      booking('BKG-00003', 'PTR-002', [cost('PTR-002', 34_000)], { proven: false }),
    ];
    const ship = shipment();

    expect(unprovenBookings(bookings).map((b) => b.id)).toEqual(['BKG-00003']);
    expect(canRelease(ship, bookings)).toBe(false);
    expect(releaseBlocker(ship, bookings)).toBe('incomplete_pod');
    expect(shipmentStage(ship, bookings)).toBe('awaiting_pod');
    // 19 of 20 proven is still zero money out. That is the point.
    expect(withShipmentReleased(ship, bookings, T0 + DAY_MS, 'test').payout.releasedAt).toBeUndefined();
  });

  it('releases once every booking is proven and nothing is held', () => {
    const bookings = [
      booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)]),
      booking('BKG-00002', 'PTR-002', [cost('PTR-002', 34_000)]),
    ];
    const ship = shipment();

    expect(canRelease(ship, bookings)).toBe(true);
    expect(shipmentStage(ship, bookings)).toBe('ready');
    const released = withShipmentReleased(ship, bookings, T0 + DAY_MS, 'desk');
    expect(released.payout.releasedAt).toBe(at(24));
    expect(released.payout.releasedBy).toBe('desk');
    expect(shipmentStage(released, bookings)).toBe('released');
  });

  it('refuses to release while a hold is open, and allows it the moment one clears', () => {
    const bookings = [booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)])];
    const held = withHold(shipment(), hold('HLD-00001', at(2)));

    expect(isHeld(held.payout)).toBe(true);
    expect(releaseBlocker(held, bookings)).toBe('held');
    expect(canRelease(held, bookings)).toBe(false);

    const cleared = withHoldCleared(held, 'HLD-00001', T0 + 4 * HOUR_MS, 'test');
    expect(isHeld(cleared.payout)).toBe(false);
    expect(canRelease(cleared, bookings)).toBe(true);
  });

  it('reads an early release back off the record without having refused it', () => {
    const bookings = [booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)])];
    const windowMs = 48 * HOUR_MS;
    // Proof landed at hour 1; releasing at hour 3 is 45 hours early — and allowed.
    expect(isEarlyRelease(shipment(), bookings, T0 + 3 * HOUR_MS, windowMs)).toBe(true);
    const released = withShipmentReleased(shipment(), bookings, T0 + 3 * HOUR_MS, 'desk');
    expect(released.payout.releasedAt).toBeDefined();
    expect(wasReleasedEarly(released, bookings, windowMs)).toBe(true);
  });
});

/* ── 2 & 3. One row per transporter, one voucher, N bookings ─────────────── */

describe('settlements', () => {
  /** Ten containers for one haulier, four for another — the restructure's case. */
  const split = () => [
    ...Array.from({ length: 10 }, (_, index) =>
      booking(formatId('booking', index + 1), 'PTR-001', [cost('PTR-001', 35_000)]),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      booking(formatId('booking', index + 11), 'PTR-002', [cost('PTR-002', 34_000)]),
    ),
  ];

  it('groups ten bookings into ONE row of ten times the amount', () => {
    const bookings = split();
    const settlements = settlementsFor(shipment([], at(24)), bookings);

    expect(settlements).toHaveLength(2);
    const redSea = settlements.find((s) => s.transporterId === 'PTR-001');
    expect(redSea?.bookingsCount).toBe(10);
    expect(redSea?.totalDjf).toBe(350_000);
    expect(redSea?.lines).toHaveLength(10);

    const horn = settlements.find((s) => s.transporterId === 'PTR-002');
    expect(horn?.bookingsCount).toBe(4);
    expect(horn?.totalDjf).toBe(136_000);

    // Fourteen containers, two payments. Never fourteen.
    expect(settlements.reduce((sum, s) => sum + s.bookingsCount, 0)).toBe(14);
  });

  it('collapses several cost types for one party on one booking into a single line', () => {
    const bookings = [
      booking('BKG-00001', 'PTR-001', [
        cost('PTR-001', 35_000, 'transport'),
        cost('PTR-001', 3_800, 'handling'),
      ]),
    ];
    const settlement = settlementFor(shipment([], at(24)), bookings, 'PTR-001');
    // One party, one booking, one line — the roles are inside the amount.
    expect(settlement?.lines).toHaveLength(1);
    expect(settlement?.bookingsCount).toBe(1);
    expect(settlement?.totalDjf).toBe(38_800);
  });

  it('pays every line that party holds across the shipment under one voucher', () => {
    const bookings = split();
    const released = shipment([], at(24));

    const paid = withSettlementPaid(released, bookings, 'PTR-001', {
      paymentId: 'PAY-00001',
      atMs: T0 + 26 * HOUR_MS,
      method: 'bank_transfer',
      paymentRef: 'CAC-99120',
    });

    const stamped = paid.flatMap((b) => b.costLines).filter((line) => line.paymentId === 'PAY-00001');
    expect(stamped).toHaveLength(10);
    expect(stamped.every((line) => line.paidAt === at(26))).toBe(true);
    expect(stamped.every((line) => line.paymentRef === 'CAC-99120')).toBe(true);

    // The other haulier is untouched by the first one's payment.
    const settlements = settlementsFor(released, paid);
    expect(settlements.find((s) => s.transporterId === 'PTR-001')?.status).toBe('paid');
    expect(settlements.find((s) => s.transporterId === 'PTR-001')?.payableDjf).toBe(0);
    expect(settlements.find((s) => s.transporterId === 'PTR-002')?.status).toBe('payable');
    expect(settlements.find((s) => s.transporterId === 'PTR-002')?.payableDjf).toBe(136_000);

    // The whole consignment is settled only when both parties are.
    expect(shipmentStage(released, paid)).toBe('released');
    const all = withSettlementPaid(released, paid, 'PTR-002', {
      paymentId: 'PAY-00002',
      atMs: T0 + 27 * HOUR_MS,
      method: 'bank_transfer',
    });
    expect(shipmentStage(released, all)).toBe('settled');
  });

  it('carries the voucher reference back onto the settlement it paid', () => {
    const bookings = split();
    const released = shipment([], at(24));
    const paid = withSettlementPaid(released, bookings, 'PTR-001', {
      paymentId: 'PAY-00001',
      atMs: T0 + 26 * HOUR_MS,
      method: 'bank_transfer',
    });
    expect(settlementFor(released, paid, 'PTR-001')?.paymentId).toBe('PAY-00001');
  });
});

/* ── 5. Held and unreleased money is never payable ───────────────────────── */

describe('what counts as payable', () => {
  const bookings = () => [booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)])];

  it('reports nothing payable before release', () => {
    const settlement = settlementFor(shipment(), bookings(), 'PTR-001');
    expect(settlement?.totalDjf).toBe(35_000);
    expect(settlement?.payableDjf).toBe(0);
    expect(settlement?.status).toBe('blocked');
  });

  it('reports nothing payable while held, even after release', () => {
    // withHold refuses once money has left, so the held-after-release state has
    // to be built directly — which is itself worth asserting.
    const heldAfterRelease = withHold(shipment([], at(24)), hold('HLD-00001', at(25)));
    expect(heldAfterRelease.payout.holds).toHaveLength(0);

    const held: FinanceShipment = {
      ...shipment([], at(24)),
      payout: { releasedAt: at(24), releasedBy: 'test', holds: [hold('HLD-00001', at(25))] },
    };
    const own = bookings();

    const settlement = settlementFor(held, own, 'PTR-001');
    expect(settlement?.totalDjf).toBe(35_000);
    expect(settlement?.payableDjf).toBe(0);
    expect(settlement?.status).toBe('blocked');
    // And the engine itself refuses to move it — the same array back, untouched.
    expect(
      withSettlementPaid(held, own, 'PTR-001', {
        paymentId: 'PAY-00001',
        atMs: T0 + 26 * HOUR_MS,
        method: 'bank_transfer',
      }),
    ).toBe(own);
  });

  it('marks a cost line blocked, payable or paid from the shipment it hangs off', () => {
    const line = cost('PTR-001', 35_000);
    expect(costLineStatus(shipment().payout, line)).toBe('blocked');
    expect(costLineStatus(shipment([], at(24)).payout, line)).toBe('payable');
    expect(costLineStatus(shipment([], at(24)).payout, { ...line, paidAt: at(26) })).toBe('paid');
  });
});

/* ── 4. A hold pauses the counter; it never resets it ────────────────────── */

describe('the validation clock', () => {
  const WINDOW = 48 * HOUR_MS;
  const bookings = () => [booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)])];

  it('does not start until every booking is proven', () => {
    const partial = [
      booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)]),
      booking('BKG-00002', 'PTR-001', [cost('PTR-001', 35_000)], { proven: false }),
    ];
    const clock = validationClock(shipment(), partial, T0 + 10 * HOUR_MS, WINDOW);
    expect(clock.started).toBe(false);
    expect(clock.elapsedMs).toBe(0);
    expect(shipmentProvenAt(partial)).toBeUndefined();
  });

  it('runs from the moment the LAST booking was proven', () => {
    const bookingsList = [
      booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)]),
      {
        ...booking('BKG-00002', 'PTR-001', [cost('PTR-001', 35_000)]),
        proof: { completedAt: at(0), podSentAt: at(5), podDocuments: PROOFS },
      },
    ];
    expect(shipmentProvenAt(bookingsList)).toBe(at(5));
    const clock = validationClock(shipment(), bookingsList, T0 + 15 * HOUR_MS, WINDOW);
    expect(clock.started).toBe(true);
    expect(clock.elapsedMs).toBe(10 * HOUR_MS);
  });

  it('pauses where it stands and resumes from there — never from zero', () => {
    // Proof at hour 1. Hold raised at hour 31 (30 hours on the clock),
    // cleared at hour 79 — 48 hours of dispute that must cost nothing.
    const held = shipment([hold('HLD-00001', at(31), at(79))]);
    const clock = validationClock(held, bookings(), T0 + 80 * HOUR_MS, WINDOW);

    // 79 hours gross, 48 of them held: 31 unheld hours from a start at hour 1.
    expect(clock.elapsedMs).toBe(30 * HOUR_MS + HOUR_MS);
    expect(clock.remainingMs).toBe(WINDOW - 31 * HOUR_MS);
    expect(clock.expired).toBe(false);
    // A reset would have put this back to zero and cost the haulier two days.
    expect(clock.elapsedMs).toBeGreaterThan(0);
  });

  it('reports paused while a hold is open and offers no closing projection', () => {
    const held = shipment([hold('HLD-00001', at(10))]);
    const clock = validationClock(held, bookings(), T0 + 20 * HOUR_MS, WINDOW);
    expect(clock.paused).toBe(true);
    expect(clock.closesAt).toBeNull();
    expect(clock.closingSoon).toBe(false);
  });

  it('freezes at the release moment once money has gone', () => {
    const released = shipment([], at(11));
    const clock = validationClock(released, bookings(), T0 + 500 * HOUR_MS, WINDOW);
    expect(clock.elapsedMs).toBe(10 * HOUR_MS);
    expect(clock.closesAt).toBeNull();
  });

  it('expires without ever becoming a refusal', () => {
    const clock = validationClock(shipment(), bookings(), T0 + 60 * HOUR_MS, WINDOW);
    expect(clock.expired).toBe(true);
    expect(clock.remainingMs).toBe(0);
    expect(canRelease(shipment(), bookings())).toBe(true);
  });
});

/* ── Proof of delivery needs BOTH documents ──────────────────────────────── */

describe('proof of delivery', () => {
  it('refuses a signature with no photo, and a photo with no signature', () => {
    const bare = booking('BKG-00001', 'PTR-001', [cost('PTR-001', 35_000)], { proven: false });
    const [signature, photo] = PROOFS as [PodDocument, PodDocument];

    // An incomplete set is refused by returning the booking untouched, so the
    // proof it refused has to be inspected on its own.
    const signatureOnly = withPodConfirmed(bare, T0 + HOUR_MS, [signature]);
    expect(signatureOnly).toBe(bare);
    expect(missingPodDocuments({ ...bare.proof, podDocuments: [signature] })).toEqual([
      'delivery_photo',
    ]);

    const photoOnly = withPodConfirmed(bare, T0 + HOUR_MS, [photo]);
    expect(photoOnly).toBe(bare);
    expect(missingPodDocuments({ ...bare.proof, podDocuments: [photo] })).toEqual(['signed_pdf']);

    const both = withPodConfirmed(bare, T0 + HOUR_MS, PROOFS);
    expect(both.proof.podSentAt).toBe(at(1));
    expect(hasCompletePod(both.proof)).toBe(true);
  });

  it('derives a booking stage from its timestamps alone', () => {
    const moving = booking('BKG-00001', 'PTR-001', [], { delivered: false, proven: false });
    const dropped = booking('BKG-00002', 'PTR-001', [], { proven: false });
    const done = booking('BKG-00003', 'PTR-001', []);
    expect(bookingStage(moving.proof)).toBe('in_transit');
    expect(bookingStage(dropped.proof)).toBe('awaiting_pod');
    expect(bookingStage(done.proof)).toBe('proven');
  });
});

/* ── 6. References ───────────────────────────────────────────────────────── */

describe('the id scheme', () => {
  it('is always three letters and five digits', () => {
    expect(formatId('shipment', 412)).toBe('SHI-00412');
    expect(formatId('booking', 1)).toBe('BKG-00001');
    expect(formatId('invoice', 99_999)).toBe('INV-99999');
    expect(formatId('payment', 7)).toBe('PAY-00007');
    expect(formatId('project', 3)).toBe('PRJ-00003');
  });

  it('throws past the ceiling rather than wrapping onto a live record', () => {
    expect(() => formatId('payment', ID_MAX + 1)).toThrow();
    expect(() => formatId('payment', 0)).toThrow();
    expect(ID_DIGITS).toBe(5);
  });

  it('never hands out a reference already in the data', () => {
    registerIds(['INV-00004', 'INV-00009', 'INV-00002']);
    expect(nextId('invoice')).toBe('INV-00010');
    expect(nextId('invoice')).toBe('INV-00011');
    // Counters are per kind — a busy invoice sequence does not skip payments.
    expect(nextId('payment')).toBe('PAY-00001');
  });

  it('names the kind behind a reference, including ones it does not mint', () => {
    expect(idKindOf('SHI-00412')).toBe('Shipment');
    expect(idKindOf('BKG-00412')).toBe('Booking');
    expect(idKindOf('PAY-00001')).toBe('Payment');
    // SHP is a shipper and SHI is a shipment — the near-collision must resolve.
    expect(idKindOf('SHP-101')).toBe('Shipper');
    expect(idKindOf('PTR-001')).toBe('Transporter');
    expect(idKindOf('MSCU-889')).toBeNull();
  });

  it('parses only the scheme, and treats third-party numbers as foreign', () => {
    expect(parseId('SHI-00412')).toEqual({ prefix: 'SHI', kind: 'shipment', sequence: 412 });
    // Not ours to renumber: container numbers, licences, contract references.
    expect(parseId('MSCU-889-2314')).toBeNull();
    expect(parseId('DL-DJ-44821')).toBeNull();
    expect(parseId('CT-2026-AMN-04')).toBeNull();
  });

  it('migrates a legacy reference to the same new one every time', () => {
    expect(derivedId('mission', 'MSN-2026-8801')).toBe('MSN-08801');
    expect(derivedId('mission', 'MSN-2026-8801')).toBe('MSN-08801');
    expect(derivedId('emptyReturn', 'ER-101')).toBe('ERT-00101');
    expect(derivedId('fullLoad', 'MSN-08807')).toBe('FLM-08807');
  });

  it('hashes text-only references above the hand-numbered band', () => {
    const first = hashedId('location', 'Obock Transit Yard');
    expect(first).toBe(hashedId('location', 'Obock Transit Yard'));
    expect(first).not.toBe(hashedId('location', 'Tadjoura Yard'));
    // Never collides with a seeded LOC-00001..LOC-00005.
    expect(parseId(first)?.sequence).toBeGreaterThanOrEqual(10_000);
  });
});
