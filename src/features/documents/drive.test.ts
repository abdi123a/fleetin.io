import { describe, expect, it } from 'vitest';

import { listDrive, searchDrive, type DriveCompany } from './drive';
import type { DocumentRecord } from './api/documentsService';

const NOW = new Date('2026-09-01T00:00:00.000Z').getTime();

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
    expiryDate: '2027-01-01T00:00:00.000Z',
    issuer: null,
    verifiedById: null,
    verifiedAt: null,
    rejectionReason: null,
    version: 1,
    downloadCount: 0,
    ...over,
  };
}

const HAULIER: DriveCompany = {
  id: 'p1',
  name: 'Massida Logistics',
  kind: 'PARTNER',
  vehicles: [{ id: 'v1', label: 'MS-1221-DJ' }],
  drivers: [{ id: 'dr1', label: 'Ahmed Robleh' }],
};

const CLIENT: DriveCompany = {
  id: 's1',
  name: 'Horn Trading',
  kind: 'SHIPPER',
  vehicles: [],
  drivers: [],
};

const COMPANIES = [HAULIER, CLIENT];

describe('listDrive', () => {
  it('opens on every company, transporters and shippers alike', () => {
    const { folders, leaf, trail } = listDrive([], COMPANIES, [], NOW);
    expect(trail).toEqual([{ label: 'Fleetin Drive', segment: null }]);
    expect(leaf).toBeNull();
    expect(folders.map((f) => f.label)).toEqual(['Massida Logistics', 'Horn Trading']);
  });

  it('counts the whole subtree on a company folder, not just the company', () => {
    // 1 licence + 1 truck × 2 + 1 driver × 1 = 4 required, none held.
    const haulier = listDrive([], COMPANIES, [], NOW).folders[0]!;
    expect(haulier.tally.required).toBe(4);
    expect(haulier.tally.missing).toBe(4);
  });

  it('a transporter opens onto its three sections', () => {
    const { folders } = listDrive([{ kind: 'company', id: 'p1' }], COMPANIES, [], NOW);
    expect(folders.map((f) => f.label)).toEqual(['Company', 'Vehicles', 'Drivers']);
    /* The section tallies partition the company's own tally — every required
       paper is counted once, under exactly one section. */
    expect(folders.reduce((sum, f) => sum + f.tally.required, 0)).toBe(4);
  });

  it('a shipper is a leaf — it has no fleet to file under', () => {
    const { folders, leaf } = listDrive([{ kind: 'company', id: 's1' }], COMPANIES, [], NOW);
    expect(folders).toEqual([]);
    expect(leaf).toEqual({
      ownerType: 'SHIPPER',
      ownerId: 's1',
      label: 'Horn Trading',
      reference: 'Horn Trading',
    });
  });

  it('walks company → vehicles → one truck, and lands on it', () => {
    const path = [
      { kind: 'company', id: 'p1' },
      { kind: 'section', id: 'vehicles' },
      { kind: 'record', ownerType: 'VEHICLE', id: 'v1' },
    ] as const;
    const { leaf, trail, tally } = listDrive(path, COMPANIES, [doc()], NOW);
    expect(leaf).toEqual({
      ownerType: 'VEHICLE',
      ownerId: 'v1',
      label: 'MS-1221-DJ',
      /* No `VEH-#####` on this fixture, so the leaf falls back to the plate —
         a raised task still has something to link to. */
      reference: 'MS-1221-DJ',
    });
    expect(trail.map((step) => step.label)).toEqual([
      'Fleetin Drive',
      'Massida Logistics',
      'Vehicles',
      'MS-1221-DJ',
    ]);
    /* The truck holds its insurance and owes its grey card. */
    expect(tally).toMatchObject({ required: 2, valid: 1, missing: 1 });
  });

  it('a path into a company that no longer exists lists nothing rather than throwing', () => {
    const { folders, leaf } = listDrive([{ kind: 'company', id: 'gone' }], COMPANIES, [], NOW);
    expect(folders).toEqual([]);
    expect(leaf).toBeNull();
  });
});

describe('searchDrive', () => {
  it('finds a truck without knowing which haulier owns it', () => {
    const matches = searchDrive('1221', COMPANIES, [], NOW);
    expect(matches).toHaveLength(1);
    const match = matches[0]!;
    expect(match.label).toBe('MS-1221-DJ');
    expect(match.where).toBe('Massida Logistics · Vehicles');
    /* The path it hands back is the way to it, so the hit is navigable. */
    expect(listDrive(match.path, COMPANIES, [], NOW).leaf?.ownerId).toBe('v1');
  });

  it('matches drivers and companies too, and nothing on an empty term', () => {
    expect(searchDrive('ahmed', COMPANIES, [], NOW).map((m) => m.label)).toEqual(['Ahmed Robleh']);
    expect(searchDrive('horn', COMPANIES, [], NOW).map((m) => m.label)).toEqual(['Horn Trading']);
    expect(searchDrive('   ', COMPANIES, [], NOW)).toEqual([]);
  });
});
