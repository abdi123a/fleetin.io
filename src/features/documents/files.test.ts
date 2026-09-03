import { describe, expect, it } from 'vitest';

import { describeContents, foldersOf, listFiles, pathTo, searchFiles } from './files';
import type { DocumentRecord } from './api/documentsService';
import type { DriveFolderRecord } from './api/driveFoldersService';

function folder(id: string, name: string, parentId: string | null = null, createdAt = '2026-01-01T00:00:00.000Z'): DriveFolderRecord {
  return { id, name, parentId, createdById: 'u1', createdAt, updatedAt: createdAt };
}

function file(id: string, ownerId: string, name: string, over: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    ownerType: 'FOLDER',
    ownerId,
    category: 'File',
    name,
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    status: 'Pending Review',
    uploadedAt: '2026-02-01T00:00:00.000Z',
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

const FOLDERS = [
  folder('contracts', 'Contracts'),
  folder('y2026', '2026', 'contracts'),
  folder('tenders', 'Tenders'),
];

const FILES = [
  file('f1', 'contracts', 'Master agreement.pdf', { uploadedAt: '2026-03-01T00:00:00.000Z', fileSizeBytes: 500 }),
  file('f2', 'y2026', 'Addendum A.pdf', { uploadedAt: '2026-04-01T00:00:00.000Z' }),
  file('f3', 'y2026', 'Addendum B.pdf', { uploadedAt: '2026-05-01T00:00:00.000Z' }),
  file('f4', 'y2026', 'Addendum C.pdf', { uploadedAt: '2026-06-01T00:00:00.000Z' }),
  file('f5', 'y2026', 'Addendum D.pdf', { uploadedAt: '2026-07-01T00:00:00.000Z' }),
];

describe('foldersOf', () => {
  /* One request holds every folder in the system, and the browser shows one
     owner's. Getting this wrong puts a haulier's contracts on the Files tab
     for anyone to browse, which is exactly the thing owners exist to stop. */
  const OWNED = [
    ...FOLDERS,
    { ...folder('dita-legal', 'Legal'), ownerType: 'PARTNER' as const, ownerId: 'p1' },
    { ...folder('horn-legal', 'Legal'), ownerType: 'SHIPPER' as const, ownerId: 's1' },
  ];

  it('keeps a company out of the Files tab, and the Files tab out of a company', () => {
    expect(foldersOf(OWNED, null).map((f) => f.id)).toEqual(['contracts', 'y2026', 'tenders']);
    expect(foldersOf(OWNED, { ownerType: 'PARTNER', ownerId: 'p1' }).map((f) => f.id)).toEqual([
      'dita-legal',
    ]);
  });

  it('does not confuse a partner with a shipper of the same id', () => {
    const shipperP1 = { ...folder('x', 'X'), ownerType: 'SHIPPER' as const, ownerId: 'p1' };
    expect(foldersOf([...OWNED, shipperP1], { ownerType: 'PARTNER', ownerId: 'p1' })).toHaveLength(1);
  });

  it("a company's folders are their own root, whatever the whole book looks like", () => {
    const listing = listFiles([], foldersOf(OWNED, { ownerType: 'PARTNER', ownerId: 'p1' }), FILES);
    expect(listing.folders.map((entry) => entry.label)).toEqual(['Legal']);
    expect(listing.trail).toEqual([{ label: 'Files', id: null }]);
  });
});

describe('listFiles', () => {
  it('opens on the root folders only, with no loose files', () => {
    const listing = listFiles([], FOLDERS, FILES);
    expect(listing.folder).toBeNull();
    expect(listing.trail).toEqual([{ label: 'Files', id: null }]);
    expect(listing.folders.map((entry) => entry.label)).toEqual(['Contracts', 'Tenders']);
    expect(listing.files).toEqual([]);
  });

  it('counts the whole subtree on a folder, not just the folder', () => {
    const contracts = listFiles([], FOLDERS, FILES).folders[0]!;
    expect(contracts.tally).toEqual({ folders: 1, files: 5, bytes: 900 });
    expect(contracts.sublabel).toBe('1 folder · 5 files');
  });

  it('counts every folder at the root, including the ones being listed', () => {
    expect(listFiles([], FOLDERS, FILES).tally).toEqual({ folders: 3, files: 5, bytes: 900 });
  });

  it('walks into a folder and lists its files newest first', () => {
    const listing = listFiles(['contracts', 'y2026'], FOLDERS, FILES);
    expect(listing.folder?.id).toBe('y2026');
    expect(listing.trail.map((step) => step.label)).toEqual(['Files', 'Contracts', '2026']);
    expect(listing.files.map((doc) => doc.name)).toEqual([
      'Addendum D.pdf',
      'Addendum C.pdf',
      'Addendum B.pdf',
      'Addendum A.pdf',
    ]);
  });

  it('fans out at most three of the newest files as the folder\'s papers', () => {
    const y2026 = listFiles(['contracts'], FOLDERS, FILES).folders[0]!;
    expect(y2026.papers.map((paper) => paper.category)).toEqual([
      'Addendum D.pdf',
      'Addendum C.pdf',
      'Addendum B.pdf',
    ]);
    expect(y2026.papers.every((paper) => paper.state === 'valid')).toBe(true);
  });

  it('reports the latest thing that happened anywhere inside, for newest-first', () => {
    const contracts = listFiles([], FOLDERS, FILES).folders[0]!;
    expect(contracts.touchedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('lands at the root when the path leads to a folder that is gone', () => {
    const listing = listFiles(['contracts', 'deleted'], FOLDERS, FILES);
    expect(listing.folder).toBeNull();
    expect(listing.trail).toHaveLength(1);
  });

  it('surfaces an orphaned folder at the root rather than losing it', () => {
    const orphan = folder('lost', 'Lost', 'nobody');
    const listing = listFiles([], [...FOLDERS, orphan], []);
    expect(listing.folders.map((entry) => entry.label)).toContain('Lost');
  });
});

describe('describeContents', () => {
  it('says which halves are there', () => {
    expect(describeContents({ folders: 0, files: 0, bytes: 0 })).toBe('Empty');
    expect(describeContents({ folders: 2, files: 0, bytes: 0 })).toBe('2 folders');
    expect(describeContents({ folders: 0, files: 1, bytes: 0 })).toBe('1 file');
  });
});

describe('pathTo', () => {
  it('walks from the root down to the folder', () => {
    expect(pathTo('y2026', FOLDERS)).toEqual(['contracts', 'y2026']);
    expect(pathTo('missing', FOLDERS)).toEqual([]);
  });
});

describe('searchFiles', () => {
  it('finds nothing for an empty term', () => {
    expect(searchFiles('  ', FOLDERS, FILES)).toEqual({ folders: [], files: [] });
  });

  it('matches folders and files by name, each with the way back to it', () => {
    const { folders, files } = searchFiles('addendum a', FOLDERS, FILES);
    expect(folders).toEqual([]);
    expect(files).toHaveLength(1);
    expect(files[0]!.document.name).toBe('Addendum A.pdf');
    expect(files[0]!.where).toBe('Files · Contracts · 2026');
    expect(files[0]!.path).toEqual(['contracts', 'y2026']);
  });

  it('says where a matched folder lives, not where it is', () => {
    const { folders } = searchFiles('2026', FOLDERS, FILES);
    expect(folders.map((entry) => entry.label)).toEqual(['2026']);
    expect(folders[0]!.where).toBe('Files · Contracts');
    expect(folders[0]!.path).toEqual(['contracts', 'y2026']);
  });
});
