import { describe, expect, it } from 'vitest';

import {
  EXPIRING_WINDOW_DAYS,
  byUrgency,
  complianceFindings,
  documentState,
  tallyFindings,
} from './compliance';
import type { DocumentRecord } from './api/documentsService';

const NOW = new Date('2026-09-01T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function doc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'd1',
    ownerType: 'VEHICLE',
    ownerId: 'v1',
    category: 'Insurance',
    name: 'policy.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 10,
    status: 'Verified',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    uploadedById: 'u1',
    issueDate: null,
    expiryDate: null,
    issuer: null,
    verifiedById: null,
    verifiedAt: null,
    rejectionReason: null,
    version: 1,
    downloadCount: 0,
    ...over,
  };
}

describe('documentState', () => {
  it('calls a paper nobody has uploaded missing', () => {
    expect(documentState([], NOW)).toBe('missing');
  });

  it('reads the date, not only the stamp', () => {
    /* The `Expired` stamp is written by a sweep. Between a policy lapsing and
       that sweep running, the date is the only thing that knows — and that gap
       is exactly when somebody is still dispatching the truck. */
    expect(documentState([doc({ expiryDate: new Date(NOW - DAY).toISOString() })], NOW)).toBe(
      'expired',
    );
  });

  it('reads the stamp, not only the date', () => {
    expect(
      documentState([doc({ status: 'Expired', expiryDate: new Date(NOW + 400 * DAY).toISOString() })], NOW),
    ).toBe('expired');
  });

  it('warns inside the window and not outside it', () => {
    const inside = new Date(NOW + (EXPIRING_WINDOW_DAYS - 1) * DAY).toISOString();
    const outside = new Date(NOW + (EXPIRING_WINDOW_DAYS + 1) * DAY).toISOString();
    expect(documentState([doc({ expiryDate: inside })], NOW)).toBe('expiring');
    expect(documentState([doc({ expiryDate: outside })], NOW)).toBe('valid');
  });

  it('takes the newest copy, so a renewal is not read as a lapse', () => {
    /* A renewed certificate is uploaded beside the one it replaces, not over
       it. Reading the oldest would report every renewed policy as expired. */
    const lapsed = doc({ id: 'old', expiryDate: new Date(NOW - 100 * DAY).toISOString() });
    const renewed = doc({ id: 'new', expiryDate: new Date(NOW + 300 * DAY).toISOString() });
    expect(documentState([lapsed, renewed], NOW)).toBe('valid');
    expect(documentState([renewed, lapsed], NOW)).toBe('valid');
  });

  it('does not treat a document under review as a gap', () => {
    /* Somebody has produced it. Counting it as missing sends an operator to
       chase a haulier who already did what was asked. */
    expect(documentState([doc({ status: 'Pending Review' })], NOW)).toBe('valid');
  });
});

describe('complianceFindings', () => {
  const owners = [
    { ownerType: 'VEHICLE' as const, ownerId: 'v1', ownerLabel: 'DT-2238-DJ' },
    { ownerType: 'DRIVER' as const, ownerId: 'dr1', ownerLabel: 'Kamil Abdallah Guedi' },
  ];

  it('asks for every required paper the catalogue names, per owner', () => {
    /* A vehicle owes two, a driver owes one — so an empty book is three gaps,
       not two rows of "no documents". */
    const findings = complianceFindings(owners, [], NOW);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.state === 'missing')).toBe(true);
    expect(findings.map((f) => f.category)).toEqual(['Grey Card', 'Insurance', 'Driver License']);
  });

  it('never counts a paper against the wrong owner', () => {
    const findings = complianceFindings(
      owners,
      [doc({ ownerType: 'DRIVER', ownerId: 'dr1', category: 'Insurance' })],
      NOW,
    );
    expect(findings.find((f) => f.ownerId === 'v1' && f.category === 'Insurance')?.state).toBe(
      'missing',
    );
  });

  it('ignores papers outside the catalogue', () => {
    /* Drivers carry an access card in the seeded book. It is not required, so
       holding one cannot make a driver look compliant. */
    const findings = complianceFindings(
      [owners[1]!],
      [doc({ ownerType: 'DRIVER', ownerId: 'dr1', category: 'Access Card' })],
      NOW,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.state).toBe('missing');
  });

  it('tallies the four states and what needs attention', () => {
    const findings = complianceFindings(
      owners,
      [
        doc({ ownerId: 'v1', category: 'Grey Card', expiryDate: new Date(NOW + 400 * DAY).toISOString() }),
        doc({ ownerId: 'v1', category: 'Insurance', expiryDate: new Date(NOW + 5 * DAY).toISOString() }),
      ],
      NOW,
    );
    expect(tallyFindings(findings)).toEqual({
      required: 3,
      valid: 1,
      expiring: 1,
      expired: 0,
      missing: 1,
      attention: 2,
    });
  });

  it('works the chase list most urgent first', () => {
    const findings = complianceFindings(
      owners,
      [
        doc({ ownerId: 'v1', category: 'Grey Card', expiryDate: new Date(NOW - DAY).toISOString() }),
        doc({ ownerId: 'v1', category: 'Insurance', expiryDate: new Date(NOW + 3 * DAY).toISOString() }),
      ],
      NOW,
    );
    const order = [...findings].sort(byUrgency).map((f) => f.state);
    expect(order).toEqual(['missing', 'expired', 'expiring']);
  });
});
