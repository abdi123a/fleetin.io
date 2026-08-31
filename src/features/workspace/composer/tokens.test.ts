import { describe, expect, it } from 'vitest';

import {
  displayRecord, displayUser, materializeBody, mentionedUserIds,
  parseBody, recordHref, serializeBody, serializeRecord, serializeUser,
} from './tokens';

describe('workspace message tokens', () => {
  it('round-trips a body through parse and serialise', () => {
    const body =
      `${serializeUser('u-1', 'Ahmed Farah')} the door on ` +
      `${serializeRecord('VEHICLE', 'MO-2022-DJ', 'VEH-00067')} is broken, see ` +
      `${serializeRecord('SHIPMENT', '260701')} too`;

    expect(serializeBody(parseBody(body))).toBe(body);
  });

  it('keeps plain text either side of a token', () => {
    const segments = parseBody(`before ${serializeUser('u-9', 'Sagal')} after`);
    expect(segments.map((s) => s.kind)).toEqual(['text', 'user', 'text']);
    expect(segments[0]).toEqual({ kind: 'text', text: 'before ' });
    expect(segments[2]).toEqual({ kind: 'text', text: ' after' });
  });

  it('reads a record token into a type and a reference', () => {
    const [segment] = parseBody(serializeRecord('BOOKING', 'BKG-01178', 'MSCU-889-2314'));
    expect(segment).toEqual({
      kind: 'record',
      recordType: 'BOOKING',
      reference: 'BKG-01178',
      parentRef: null,
      label: 'MSCU-889-2314',
    });
  });

  it('carries a booking token\'s parent shipment through the round trip', () => {
    const token = serializeRecord('BOOKING', '609196', 'MSCU5421350', '816996');
    const [segment] = parseBody(token);
    expect(segment).toMatchObject({ reference: '609196', parentRef: '816996' });
    expect(serializeBody(parseBody(token))).toBe(token);
  });

  it('opens a booking on its shipment, not on a route that cannot resolve it', () => {
    expect(recordHref('BOOKING', '609196', { parentRef: '816996', recordId: 'uuid-1' }))
      .toBe('/shipments/816996?openBooking=609196');
  });

  it('falls back to the shipments list when a booking has no parent', () => {
    expect(recordHref('BOOKING', '609196')).toBe('/shipments');
  });

  it('opens a booking by REFERENCE when no uuid is to hand — a message token', () => {
    expect(recordHref('BOOKING', '738962', { parentRef: '305079' }))
      .toBe('/shipments/305079?openBooking=738962');
  });

  it('falls back to the reference when a record token has no label', () => {
    const [segment] = parseBody('@[shipment:260701]');
    expect(segment).toMatchObject({ kind: 'record', recordType: 'SHIPMENT', label: '260701', parentRef: null });
  });

  it('never loses words to an unknown token kind', () => {
    const body = 'look at @[wormhole:42] please';
    expect(serializeBody(parseBody(body))).toBe(body);
  });

  it('collects mentioned user ids without duplicates', () => {
    const body = `${serializeUser('u-1', 'A')} and ${serializeUser('u-2', 'B')} and ${serializeUser('u-1', 'A')}`;
    expect(mentionedUserIds(body)).toEqual(['u-1', 'u-2']);
  });

  it('treats a body with no tokens as one text segment', () => {
    expect(parseBody('just words')).toEqual([{ kind: 'text', text: 'just words' }]);
  });

  it('points a shipment chip at the real shipment route', () => {
    expect(recordHref('SHIPMENT', '260701')).toBe('/shipments/260701');
    expect(recordHref('PARTNER', 'PTR-001')).toBe('/partners/PTR-001');
  });

  it('opens the record itself for types whose detail is a sheet on a list', () => {
    /* A list page is not a destination — on a fleet of 200 trucks it is a
       search request. Each carries the parameter that opens the right row. */
    expect(recordHref('VEHICLE', 'MO-2022-DJ')).toBe('/vehicles?vehicle=MO-2022-DJ');
    expect(recordHref('DRIVER', 'DRV-00077')).toBe('/drivers?driver=DRV-00077');
    expect(recordHref('EMPTY_RETURN_CYCLE', 'CYC-00043'))
      .toBe('/empty-returns/cycles?container=CYC-00043');
  });

  it('keeps a uuid out of the address bar when there is a reference to use', () => {
    /* Both resolve — every one of these pages matches on id OR reference — so
       the link carries the one a person can read and recognise. */
    expect(recordHref('VEHICLE', 'MO-2022-DJ', { recordId: 'uuid-9' }))
      .toBe('/vehicles?vehicle=MO-2022-DJ');
    expect(recordHref('DRIVER', 'DRV-00077', { recordId: 'uuid-9' }))
      .toBe('/drivers?driver=DRV-00077');
  });

  it('still resolves a record that only has a uuid', () => {
    expect(recordHref('VEHICLE', '', { recordId: 'uuid-9' })).toBe('/vehicles?vehicle=uuid-9');
    expect(recordHref('BOOKING', '', { parentRef: '305079', recordId: 'uuid-1' }))
      .toBe('/shipments/305079?openBooking=uuid-1');
  });
});

describe('what the writer sees versus what gets stored', () => {
  it('swaps a readable name back to its token on send', () => {
    const token = serializeUser('u-1', 'Souad Mohamed');
    const map = new Map([[displayUser('Souad Mohamed'), token]]);
    expect(materializeBody('@Souad Mohamed can you check this?', map))
      .toBe(`${token} can you check this?`);
  });

  it('replaces the longer name first, so one name inside another survives', () => {
    const ali = serializeUser('u-1', 'Ali');
    const aliHassan = serializeUser('u-2', 'Ali Hassan');
    const map = new Map([
      [displayUser('Ali'), ali],
      [displayUser('Ali Hassan'), aliHassan],
    ]);
    /* Shortest-first would eat the "@Ali" out of "@Ali Hassan" and strand
       " Hassan" outside the token. */
    expect(materializeBody('@Ali Hassan please brief @Ali', map))
      .toBe(`${aliHassan} please brief ${ali}`);
  });

  it('leaves a name nobody picked as plain text', () => {
    expect(materializeBody('@Nobody Special hello', new Map())).toBe('@Nobody Special hello');
  });

  it('swaps a record reference and the result parses back to a chip', () => {
    const token = serializeRecord('BOOKING', '609196', 'CMAU1010230', '305079');
    const map = new Map([[displayRecord('609196'), token]]);
    const body = materializeBody('free days ran out on #609196', map);
    const segment = parseBody(body).find((s) => s.kind === 'record');
    expect(segment).toMatchObject({ recordType: 'BOOKING', reference: '609196', parentRef: '305079' });
  });

  it('never leaves a uuid in what the writer typed', () => {
    const map = new Map([[displayUser('Souad Mohamed'), serializeUser('d700356e-a0a4-48bf', 'Souad Mohamed')]]);
    const typed = '@Souad Mohamed ';
    expect(typed).not.toMatch(/d700356e/);
    expect(materializeBody(typed, map)).toMatch(/d700356e/);
  });
});
