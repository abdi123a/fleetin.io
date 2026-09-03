import type { DocumentRecord } from './api/documentsService';
import type { DriveFolderRecord } from './api/driveFoldersService';
import { FOLDER_PAPERS, type FolderPaper } from './drive';

/**
 * The Files section of Fleetin Drive — the half of the drive people make.
 *
 * `drive.ts` derives its tree from records: a transporter's folder exists
 * because the transporter does, and holds the four papers the catalogue asks
 * for. That tree cannot hold a signed contract, a tender, a photograph of a
 * damaged box — the things people actually turned up wanting to file. So the
 * drive has a second section, of folders that exist because somebody created
 * them, nested as deep as they like, holding files the catalogue has no
 * opinion on: nothing here is required, expires, or is reviewed.
 *
 * Same shape as the compliance drive on purpose. The page walks a path of
 * ids, every folder reports what is beneath it, and the whole thing is
 * computed here from two flat lists so that opening a folder never waits on
 * the network.
 */

/** What a folder holds, all the way down. */
export interface FileTally {
  folders: number;
  files: number;
  bytes: number;
}

export interface FileFolder {
  key: string;
  id: string;
  label: string;
  /** "3 folders · 12 files" — what is inside, from the outside. */
  sublabel: string;
  /** The newest files inside, for the folder to fan out when it opens. */
  papers: FolderPaper[];
  tally: FileTally;
  /** The latest anything happened inside it — for "newest first". */
  touchedAt: string;
}

export interface FileListing {
  /** One entry per level, root first. `id` is null for the root. */
  trail: { label: string; id: string | null }[];
  /** The folder being stood in; null at the root. */
  folder: DriveFolderRecord | null;
  folders: FileFolder[];
  /** The files directly inside, newest first. Always empty at the root. */
  files: DocumentRecord[];
  /** Everything beneath this level, for the figures above the listing. */
  tally: FileTally;
}

export const FILES_ROOT_LABEL = 'Files';

/**
 * Whose folders these are — a company, or the Files section itself.
 *
 * A folder tree hangs either off the Files tab (owner `null`) or off one
 * company's own folder on the compliance drive. Both are the same tree with
 * the same rules; only the root differs.
 */
export interface FilesOwner {
  ownerType: 'PARTNER' | 'SHIPPER';
  ownerId: string;
}

/**
 * The folders belonging to one owner, and only those.
 *
 * Narrowing the list before `listFiles` rather than teaching it about owners:
 * within one owner's folders every parent is present, and a folder whose
 * parent is missing is already treated as a root — so filtering here gives
 * each owner its own root for free, and the walk stays owner-blind.
 */
export function foldersOf(
  folders: DriveFolderRecord[],
  owner: FilesOwner | null,
): DriveFolderRecord[] {
  return folders.filter((folder) =>
    owner
      ? folder.ownerType === owner.ownerType && folder.ownerId === owner.ownerId
      : !folder.ownerType,
  );
}

interface Index {
  byId: Map<string, DriveFolderRecord>;
  childrenOf: Map<string | null, DriveFolderRecord[]>;
  filesOf: Map<string, DocumentRecord[]>;
  tallies: Map<string, FileTally>;
  touched: Map<string, string>;
}

const newestUpload = (a: DocumentRecord, b: DocumentRecord) => b.uploadedAt.localeCompare(a.uploadedAt);

function indexOf(folders: DriveFolderRecord[], docs: DocumentRecord[]): Index {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenOf = new Map<string | null, DriveFolderRecord[]>();
  for (const folder of folders) {
    /* A folder whose parent is gone is not shown under a parent that does not
       exist; it surfaces at the root rather than vanishing. */
    const parentId = folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(folder);
    childrenOf.set(parentId, siblings);
  }

  const filesOf = new Map<string, DocumentRecord[]>();
  for (const doc of docs) {
    if (doc.ownerType !== 'FOLDER' || !byId.has(doc.ownerId)) continue;
    const held = filesOf.get(doc.ownerId) ?? [];
    held.push(doc);
    filesOf.set(doc.ownerId, held);
  }
  for (const held of filesOf.values()) held.sort(newestUpload);

  return { byId, childrenOf, filesOf, tallies: new Map(), touched: new Map() };
}

function tallyOf(id: string, idx: Index, seen = new Set<string>()): FileTally {
  const known = idx.tallies.get(id);
  if (known) return known;
  /* Guards a cycle the API cannot write but a walk should not spin on. */
  if (seen.has(id)) return { folders: 0, files: 0, bytes: 0 };
  seen.add(id);

  const held = idx.filesOf.get(id) ?? [];
  const tally: FileTally = {
    folders: 0,
    files: held.length,
    bytes: held.reduce((sum, doc) => sum + doc.fileSizeBytes, 0),
  };
  for (const child of idx.childrenOf.get(id) ?? []) {
    const below = tallyOf(child.id, idx, seen);
    tally.folders += 1 + below.folders;
    tally.files += below.files;
    tally.bytes += below.bytes;
  }
  idx.tallies.set(id, tally);
  return tally;
}

function touchedAtOf(folder: DriveFolderRecord, idx: Index, seen = new Set<string>()): string {
  const known = idx.touched.get(folder.id);
  if (known) return known;
  if (seen.has(folder.id)) return folder.createdAt;
  seen.add(folder.id);

  let latest = folder.updatedAt > folder.createdAt ? folder.updatedAt : folder.createdAt;
  const newest = idx.filesOf.get(folder.id)?.[0];
  if (newest && newest.uploadedAt > latest) latest = newest.uploadedAt;
  for (const child of idx.childrenOf.get(folder.id) ?? []) {
    const below = touchedAtOf(child, idx, seen);
    if (below > latest) latest = below;
  }
  idx.touched.set(folder.id, latest);
  return latest;
}

function sumTallies(tallies: FileTally[]): FileTally {
  return tallies.reduce(
    (sum, tally) => ({
      folders: sum.folders + tally.folders,
      files: sum.files + tally.files,
      bytes: sum.bytes + tally.bytes,
    }),
    { folders: 0, files: 0, bytes: 0 },
  );
}

/** The tally of a folder plus itself — what "deleting this" would take. */
function subtreeOf(id: string, idx: Index): FileTally {
  const below = tallyOf(id, idx);
  return { ...below, folders: below.folders + 1 };
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "3 folders · 12 files", or whichever half is there — or "Empty". */
export function describeContents(tally: FileTally): string {
  const parts: string[] = [];
  if (tally.folders > 0) parts.push(countLabel(tally.folders, 'folder'));
  if (tally.files > 0) parts.push(countLabel(tally.files, 'file'));
  return parts.length ? parts.join(' · ') : 'Empty';
}

function entryOf(folder: DriveFolderRecord, idx: Index): FileFolder {
  const tally = tallyOf(folder.id, idx);
  return {
    key: `folder:${folder.id}`,
    id: folder.id,
    label: folder.name,
    sublabel: describeContents(tally),
    /* The newest files it holds directly. A folder of folders fans out
       nothing, which is the truth: its papers are a level down. */
    papers: (idx.filesOf.get(folder.id) ?? []).slice(0, FOLDER_PAPERS).map((doc) => ({
      category: doc.name,
      state: 'valid',
      ownerLabel: folder.name,
    })),
    tally,
    touchedAt: touchedAtOf(folder, idx),
  };
}

/** The folders from the root down to `id`, or null if the chain is broken. */
function chainTo(id: string, idx: Index): DriveFolderRecord[] | null {
  const chain: DriveFolderRecord[] = [];
  let cursor: string | null = id;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    const folder = idx.byId.get(cursor);
    if (!folder) return null;
    chain.unshift(folder);
    cursor = folder.parentId && idx.byId.has(folder.parentId) ? folder.parentId : null;
  }
  return chain;
}

/**
 * What to show at `path` — the ids of the folders opened, root first.
 *
 * A path that no longer leads anywhere (the folder was deleted from another
 * tab) lands at the root rather than on an empty screen with a trail into
 * nothing.
 */
export function listFiles(
  path: readonly string[],
  folders: DriveFolderRecord[],
  docs: DocumentRecord[],
): FileListing {
  const idx = indexOf(folders, docs);
  const trail: FileListing['trail'] = [{ label: FILES_ROOT_LABEL, id: null }];

  const current = path.length ? idx.byId.get(path[path.length - 1] as string) : undefined;
  if (path.length && !current) {
    return listFiles([], folders, docs);
  }

  if (!current) {
    const children = idx.childrenOf.get(null) ?? [];
    return {
      trail,
      folder: null,
      folders: children.map((folder) => entryOf(folder, idx)),
      files: [],
      tally: sumTallies(children.map((folder) => subtreeOf(folder.id, idx))),
    };
  }

  /* The trail is the folder's real ancestry, whatever the path said: a folder
     reached through search is still shown where it lives. */
  const chain = chainTo(current.id, idx);
  if (!chain) return listFiles([], folders, docs);
  for (const folder of chain) trail.push({ label: folder.name, id: folder.id });

  return {
    trail,
    folder: current,
    folders: (idx.childrenOf.get(current.id) ?? []).map((folder) => entryOf(folder, idx)),
    files: idx.filesOf.get(current.id) ?? [],
    tally: tallyOf(current.id, idx),
  };
}

/** The ids from the root down to a folder — what `listFiles` walks. */
export function pathTo(id: string, folders: DriveFolderRecord[]): string[] {
  const chain = chainTo(id, indexOf(folders, []));
  return chain ? chain.map((folder) => folder.id) : [];
}

export interface FileFolderMatch extends FileFolder {
  path: string[];
  /** "Files · Contracts" — where it lives. */
  where: string;
}

export interface FileMatch {
  key: string;
  document: DocumentRecord;
  path: string[];
  where: string;
}

/**
 * Every folder and file whose name matches, with the way back to it.
 *
 * Searching the folder you are standing in would mean already knowing which
 * folder somebody filed the tender under — which is what the search is for.
 */
export function searchFiles(
  term: string,
  folders: DriveFolderRecord[],
  docs: DocumentRecord[],
): { folders: FileFolderMatch[]; files: FileMatch[] } {
  const needle = term.trim().toLowerCase();
  if (!needle) return { folders: [], files: [] };

  const idx = indexOf(folders, docs);
  const hit = (value: string) => value.toLowerCase().includes(needle);

  const whereOf = (chain: DriveFolderRecord[]) =>
    [FILES_ROOT_LABEL, ...chain.map((folder) => folder.name)].join(' · ');

  const folderMatches: FileFolderMatch[] = [];
  const fileMatches: FileMatch[] = [];

  for (const folder of folders) {
    const chain = chainTo(folder.id, idx);
    if (!chain) continue;
    const path = chain.map((entry) => entry.id);

    if (hit(folder.name)) {
      folderMatches.push({ ...entryOf(folder, idx), path, where: whereOf(chain.slice(0, -1)) });
    }

    for (const doc of idx.filesOf.get(folder.id) ?? []) {
      if (!hit(doc.name)) continue;
      fileMatches.push({ key: `file:${doc.id}`, document: doc, path, where: whereOf(chain) });
    }
  }

  return { folders: folderMatches, files: fileMatches };
}
