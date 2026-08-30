import { describe, expect, it } from 'vitest';

import { parseBody, serializeBody, serializeRecord, serializeUser, mentionedUserIds, recordHref } from './tokens';

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
      .toBe('/shipments/816996?openBooking=uuid-1');
  });

  it('falls back to the shipments list when a booking has no parent', () => {
    expect(recordHref('BOOKING', '609196')).toBe('/shipments');
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

  it('points types with no detail route at their list page rather than nowhere', () => {
    expect(recordHref('VEHICLE', 'MO-2022-DJ')).toBe('/vehicles');
    expect(recordHref('DRIVER', 'DRV-00077')).toBe('/drivers');
  });
});
