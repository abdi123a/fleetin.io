import { useMemo, useRef, useState } from 'react';

import { Button, Input, StatisticCard, useConfirm } from '@/design-system';
import {
  Check,
  Download,
  Eye,
  FileText,
  Files,
  Folder,
  FolderPlus,
  HardDrive,
  Pencil,
  Search,
  Trash2,
  Upload,
} from '@/design-system/icons';
import { EmptyState, FilterMenu, TablePager, usePagedRows } from '@/components';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { usePermissions } from '@/hooks/usePermissions';
import { toDisplayDocument, type DocumentRecord } from '@/features/documents/api/documentsService';
import {
  useCreateDriveFolder,
  useDeleteDriveFolder,
  useDeleteFile,
  useDriveFolders,
  useFileBook,
  useRenameDriveFolder,
  useUploadFiles,
} from '@/features/documents/api/queries';
import {
  DocumentPreview,
  IconAction,
  ViewToggle,
  type DocumentView,
} from '@/features/documents/components/DocumentBrowser';
import {
  foldersOf,
  listFiles,
  searchFiles,
  type FileFolder,
  type FilesOwner,
} from '@/features/documents/files';
import { formatFileSize } from '@/utils/format';
import { cn } from '@/utils';

import { DriveTrail } from './DriveTrail';
import { FolderGrid, type FolderItem } from './FolderTiles';
import { FolderNameDialog } from './FolderNameDialog';

/**
 * Folders people made, and whatever they put in them.
 *
 * The compliance drive is derived and closed: a folder exists because a truck
 * does, and holds the papers the catalogue asks for. Nothing in it can hold a
 * signed contract, a tender, a photograph of a damaged box — which is most of
 * what people turned up wanting to file. This is the open half: folders exist
 * because somebody made them, nested as deep as they like, holding files the
 * catalogue has no opinion on. Nothing here is required, expires, or is
 * reviewed.
 *
 * ## Two places, one browser
 *
 * The same tree hangs in two places, and the only difference is its root:
 *
 * - the **Files tab** (`owner` null) — a free tree belonging to nobody in
 *   particular, for whatever does not belong to one company;
 * - a **company's own Files folder** on the compliance drive (`owner` set) —
 *   which is where a contract with a haulier actually wants to live, because
 *   that is where you are standing when you think of it.
 *
 * One component rather than two, so a folder behaves identically wherever it
 * is: `foldersOf` narrows the book to the owner and the walk stays
 * owner-blind. The host supplies the steps that come before this tree in the
 * trail, so an embedded browser reads "Fleetin Drive › Dita Transit › Files"
 * rather than starting again from nothing.
 *
 * ## One pager over folders and files together
 *
 * Folders sort ahead of files and the pager runs over both, the way a file
 * browser has always paged: page one is folders, and a folder of four hundred
 * photographs does not become four hundred rows.
 */

/** How the listing can be ordered. Every comparator falls back to the name. */
type FileSortKey = 'recent' | 'name' | 'size';

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);

const FILE_SORTS: Record<FileSortKey, { label: string; compare: (a: Entry, b: Entry) => number }> = {
  recent: { label: 'Newest first', compare: (a, b) => b.time.localeCompare(a.time) || byName(a, b) },
  name: { label: 'Name (A–Z)', compare: byName },
  size: { label: 'Largest', compare: (a, b) => b.bytes - a.bytes || byName(a, b) },
};

/**
 * One thing in the listing — a folder or a file.
 *
 * A union rather than two lists, so the sort and the pager run once over
 * everything on the level. The three sort keys are lifted onto it because a
 * folder's "when" is the last thing that happened anywhere inside it and a
 * file's is when it was filed; comparing those needs them named the same.
 */
type Entry =
  | {
      kind: 'folder';
      key: string;
      name: string;
      time: string;
      bytes: number;
      folder: FileFolder;
      /** Where opening it leads — its own ancestry, so a search hit lands right. */
      path: string[];
      /** "Files · Contracts", on a search hit only. */
      where?: string;
    }
  | {
      kind: 'file';
      key: string;
      name: string;
      time: string;
      bytes: number;
      file: DocumentRecord;
      where?: string;
    };

export function FilesBrowser({
  owner = null,
  trailPrefix = [],
  onPrefixStep,
  path: hostPath,
  onPath,
  showRoot = true,
}: {
  /** Whose folders to show. Null is the Files tab's own free tree. */
  owner?: FilesOwner | null;
  /** The steps that come before this tree — the host's own trail. */
  trailPrefix?: { key: string; label: string }[];
  /** Asked to go back to `trailPrefix[index]`. */
  onPrefixStep?: (index: number) => void;
  /**
   * Which folder is open, when the host owns that.
   *
   * The Files tab lets this component keep its own place. A company's drive
   * cannot: the level ABOVE the first folder is the company's own grid, which
   * this component does not draw, so walking out of the last folder has to
   * hand control back — `onPath([])` is that handover.
   */
  path?: string[];
  onPath?: (next: string[]) => void;
  /**
   * Draw this tree's own root as a trail step.
   *
   * False where the host's last step already IS the root — a company's folders
   * hang directly off the company, and "Dita Transit › Files › Contracts"
   * names a folder called Files that does not exist.
   */
  showRoot?: boolean;
}) {
  const { data: book = [] } = useDriveFolders();
  const { data: files = [] } = useFileBook();
  const { can } = usePermissions();

  /* One request holds every folder in the system; this browser shows one
     owner's. Narrowed here rather than in `listFiles`, so the walk below has
     no idea owners exist — see `foldersOf`. */
  const folders = useMemo(() => foldersOf(book, owner), [book, owner]);

  const mayFile = can('documents.upload');
  const mayDelete = can('documents.delete');

  const [ownPath, setOwnPath] = useState<string[]>([]);
  const path = hostPath ?? ownPath;
  const setPath = onPath ?? setOwnPath;
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<FileSortKey>('recent');
  const [view, setView] = useState<DocumentView>('grid');
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; id: string; name: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<DocumentToView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * What is ticked, so several things can be renamed, downloaded or cleared
   * out without opening each one.
   *
   * Two sets rather than one list of tagged ids: every action here applies to
   * one kind or the other — a folder has no bytes to download, a file has no
   * subtree to warn about — and keeping them apart means no handler has to
   * re-derive which is which.
   */
  const [pickedFolders, setPickedFolders] = useState<ReadonlySet<string>>(new Set());
  const [pickedFiles, setPickedFiles] = useState<ReadonlySet<string>>(new Set());
  const pickedCount = pickedFolders.size + pickedFiles.size;

  const clearPicked = () => {
    setPickedFolders(new Set());
    setPickedFiles(new Set());
  };

  const togglePicked = (
    set: (next: ReadonlySet<string>) => void,
    current: ReadonlySet<string>,
    id: string,
  ) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    set(next);
  };

  const createFolder = useCreateDriveFolder();
  const renameFolder = useRenameDriveFolder();
  const dropFolder = useDeleteDriveFolder();
  const dropFile = useDeleteFile();
  const { confirm, confirmDialog } = useConfirm();

  const listing = useMemo(() => listFiles(path, folders, files), [path, folders, files]);
  const matches = useMemo(() => searchFiles(searchTerm, folders, files), [searchTerm, folders, files]);
  const searching = searchTerm.trim().length > 0;

  const here = listing.folder;
  const fileCount = searching ? matches.files.length : listing.files.length;
  const upload = useUploadFiles(here?.id);
  const picker = useRef<HTMLInputElement>(null);

  /* The level as one list, folders ahead of files — see `Entry`. */
  const entries = useMemo<Entry[]>(() => {
    const asFolder = (folder: FileFolder, path: string[], where?: string): Entry => ({
      kind: 'folder',
      key: folder.key,
      name: folder.label,
      time: folder.touchedAt,
      bytes: folder.tally.bytes,
      folder,
      path,
      where,
    });
    const asFile = (file: DocumentRecord, where?: string): Entry => ({
      kind: 'file',
      key: `file:${file.id}`,
      name: file.name,
      time: file.uploadedAt,
      bytes: file.fileSizeBytes,
      file,
      where,
    });

    if (searching) {
      return [
        ...matches.folders.map((match) => asFolder(match, match.path, match.where)),
        ...matches.files.map((match) => asFile(match.document, match.where)),
      ];
    }
    return [
      ...listing.folders.map((folder) => asFolder(folder, [...path, folder.id])),
      ...listing.files.map((file) => asFile(file)),
    ];
  }, [searching, matches, listing, path]);

  const compare = FILE_SORTS[sort].compare;
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.kind === b.kind ? compare(a, b) : a.kind === 'folder' ? -1 : 1,
      ),
    [entries, compare],
  );

  /* 12, for the reason the compliance grid uses 12: it fills a whole last row
     at every width the tiles wrap to. Changing folder, search or sort returns
     to page one — page 4 of the old list is a different set of things. */
  const [pageSize, setPageSize] = useState(12);
  const paged = usePagedRows(sorted, {
    pageSize,
    resetKey: `${owner?.ownerId ?? 'files'}|${searchTerm}|${sort}|${path.join('/')}`,
  });

  const pagedFolders = paged.rows.filter((entry): entry is Extract<Entry, { kind: 'folder' }> =>
    entry.kind === 'folder',
  );
  const pagedFiles = paged.rows.filter((entry): entry is Extract<Entry, { kind: 'file' }> =>
    entry.kind === 'file',
  );

  const open = (next: string[]) => {
    setPath(next);
    setSearchTerm('');
    /* A tick means "this one, here". Carrying it into another folder would
       leave a selection the reader can no longer see acting on Delete. */
    clearPicked();
  };

  /* Opened on a clean slate: a refused create ("a folder named X already
     exists here") must not still be on screen when a rename is asked for. */
  const ask = (next: NonNullable<typeof naming>) => {
    createFolder.reset();
    renameFolder.reset();
    setNaming(next);
  };

  const send = (chosen: FileList | null) => {
    if (!chosen?.length || !here) return;
    setNotice(null);
    upload.mutate(Array.from(chosen), {
      onError: (caught) => setNotice(explain(caught, 'The files could not be filed.')),
    });
  };

  const removeFile = async (file: DocumentRecord) => {
    const ok = await confirm({
      title: `Delete ${file.name}?`,
      description: 'The file is removed permanently. Nothing keeps a copy.',
      confirmLabel: 'Delete',
    });
    if (ok) {
      dropFile.mutate(file.id, {
        onError: (caught) => setNotice(explain(caught, 'The file could not be deleted.')),
      });
    }
  };

  /**
   * The ticked folders and files, resolved back to records.
   *
   * From the CURRENT listing, not from the whole book: a tick only ever refers
   * to something on screen, and resolving against everything would let a stale
   * id survive a refetch that removed it.
   */
  const picked = useMemo(() => {
    /* A search hit wraps its record (`{ document, where }`) while a listing
       holds the record itself — unwrapped here so every handler below sees one
       shape and never has to know which mode produced it. */
    const folders = searching ? matches.folders : listing.folders;
    const files = searching ? matches.files.map((hit) => hit.document) : listing.files;
    return {
      folders: folders.filter((folder) => pickedFolders.has(folder.id)),
      files: files.filter((file) => pickedFiles.has(file.id)),
    };
  }, [searching, matches, listing, pickedFolders, pickedFiles]);

  /**
   * Delete everything ticked, in one confirm.
   *
   * The count and what is inside are both named, because a folder's subtree
   * goes with it and the tiles do not say how deep that is once several are
   * selected. Files first, then folders: a file inside a folder being deleted
   * in the same batch is already gone by the time the folder goes, and the
   * server refusing a stale id would leave the batch half-applied.
   */
  async function removePicked() {
    const inside = picked.folders.reduce(
      (sum, folder) => sum + folder.tally.files + folder.tally.folders,
      0,
    );
    const ok = await confirm({
      title: `Delete ${describeSelection(picked.folders.length, picked.files.length)}?`,
      description: inside
        ? `${inside} more item${inside === 1 ? '' : 's'} inside the selected folder${
            picked.folders.length === 1 ? '' : 's'
          } go with them, permanently.`
        : 'They are removed permanently. Nothing keeps a copy.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setNotice(null);
    for (const file of picked.files) {
      dropFile.mutate(file.id, {
        onError: (caught) => setNotice(explain(caught, 'Some files could not be deleted.')),
      });
    }
    for (const folder of picked.folders) {
      dropFolder.mutate(folder.id, {
        onError: (caught) => setNotice(explain(caught, 'Some folders could not be deleted.')),
      });
    }
    /* Standing in something that was just deleted: step out rather than sit on
       a trail that leads nowhere. */
    const gone = picked.folders.find((folder) => path.includes(folder.id));
    if (gone) setPath(path.slice(0, path.indexOf(gone.id)));
    clearPicked();
  }

  /** Download every ticked file. Folders have no bytes, so they are skipped. */
  function downloadPicked() {
    for (const file of picked.files) void triggerDocumentDownload(file.id, file.name);
  }

  /* This tree's own steps. Without a root of its own the first step is the
     first folder, and the index maths below has to skip past the root that is
     not drawn. */
  const ownTrail = listing.trail;
  const skipped = showRoot ? 0 : 1;
  const own = ownTrail
    .slice(skipped)
    .map((step) => ({ key: step.id ?? 'root', label: step.label }));

  const folderItems: FolderItem[] = pagedFolders.map((entry) => ({
    key: entry.key,
    label: entry.folder.label,
    /* What is inside, from the outside — or where it lives, when the answer
       to "which of these did I mean" is the folder it sits in. */
    sublabel: entry.where ?? entry.folder.sublabel,
    icon: 'folder',
    tone: 'clean',
    papers: entry.folder.papers,
    state:
      entry.folder.tally.bytes > 0 ? (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatFileSize(entry.folder.tally.bytes)}
        </span>
      ) : undefined,
    onOpen: () => open(entry.path),
    selected: pickedFolders.has(entry.folder.id),
    onSelect: mayFile || mayDelete
      ? () => togglePicked(setPickedFolders, pickedFolders, entry.folder.id)
      : undefined,
  }));

  return (
    <div className="space-y-5">
      <FileTallyTiles
        folders={listing.tally.folders}
        files={listing.tally.files}
        bytes={listing.tally.bytes}
      />

      {/* Trail on the left, every control on the right. The controls do NOT
          wrap among themselves — a search box on one line with the sort and
          the actions stranded under it reads as a broken layout. When the two
          halves no longer fit side by side the whole control group drops to
          its own line, still one row. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <DriveTrail
          steps={[...trailPrefix, ...own]}
          /* One trail, two owners of it. A step before this tree belongs to the
             host — walking back out of a company's folders is the host's move,
             not this component's. */
          onStep={(index) => {
            if (index < trailPrefix.length) {
              onPrefixStep?.(index);
              return;
            }
            setPath(ownTrail.slice(1, index - trailPrefix.length + skipped + 1).map((s) => s.id!));
          }}
        />

        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search folders…"
            leadingIcon={<Search className="size-4" />}
            isClearable
            onClear={() => setSearchTerm('')}
            /* Shrinks rather than pushing its neighbours onto a second line. */
            className="w-40 min-w-0 md:w-56 lg:w-64"
          />
          <FilterMenu
            label="Sort"
            groups={[
              {
                key: 'sort',
                label: 'Sort by',
                value: sort,
                onChange: (value) => setSort(value as FileSortKey),
                options: (Object.keys(FILE_SORTS) as FileSortKey[]).map((key) => ({
                  value: key,
                  label: FILE_SORTS[key].label,
                })),
                defaultValue: 'recent',
              },
            ]}
          />
          {/*
            No "rename / delete this folder" menu here.

            Standing inside a folder is the wrong place to destroy it: the
            listing on screen is its CONTENTS, so the confirm talks about
            something the reader cannot see while nothing in front of them
            changes — and getting out afterwards meant stepping back up a trail
            that had just stopped existing. Both actions live on the grid one
            level up instead, where the folder is a tile you can point at, and
            where a tick can put several of them in the same move.
          */}
          {/* Beside the trail rather than up in the page band: this browser is
              hosted in two places and only one of them has a band, and a
              control that moves when you change tab is a control you have to
              find twice. */}
          {mayFile && (
            <>
              <Button
                variant="outline"
                size="sm"
                leadingIcon={<FolderPlus />}
                onClick={() => ask({ mode: 'create' })}
              >
                New folder
              </Button>
              {/* Only inside a folder: a file at the root would have nowhere
                  to be filed, and the root holds folders by design. */}
              {here && (
                <Button
                  size="sm"
                  leadingIcon={<Upload />}
                  isLoading={upload.isPending}
                  onClick={() => picker.current?.click()}
                >
                  Upload
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {notice && <p className="text-[11px] font-medium text-destructive">{notice}</p>}

      {paged.rows.length === 0 ? (
        <EmptyState
          icon={searching ? Search : Folder}
          title={
            searching
              ? `Nothing here matches “${searchTerm.trim()}”`
              : here
                ? 'This folder is empty'
                : 'No folders yet'
          }
          size="sm"
          action={
            !searching && mayFile ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<FolderPlus />}
                  onClick={() => ask({ mode: 'create' })}
                >
                  New folder
                </Button>
                {here && (
                  <Button size="sm" leadingIcon={<Upload />} onClick={() => picker.current?.click()}>
                    Upload files
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {/*
            What is ticked, and what can be done with it — one bar rather than a
            menu on every tile.

            It appears only once something is selected, so the browser is not
            permanently carrying a row of disabled buttons. Rename takes exactly
            one folder because there is one name field; Download is offered only
            when a file is in the batch, since a folder has no bytes to send.
          */}
          {pickedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-subtle px-3 py-2">
              <span className="text-sm font-bold text-primary-subtle-foreground">
                {describeSelection(picked.folders.length, picked.files.length)} selected
              </span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {mayFile && picked.folders.length === 1 && picked.files.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    leadingIcon={<Pencil />}
                    onClick={() => {
                      const only = picked.folders[0];
                      if (only) ask({ mode: 'rename', id: only.id, name: only.label });
                    }}
                  >
                    Rename
                  </Button>
                )}

                {picked.files.length > 0 && (
                  <Button size="sm" variant="outline" leadingIcon={<Download />} onClick={downloadPicked}>
                    Download
                  </Button>
                )}

                {mayDelete && (
                  <Button
                    size="sm"
                    variant="outline"
                    leadingIcon={<Trash2 />}
                    onClick={() => void removePicked()}
                    className="border-destructive/40 text-destructive hover:bg-destructive-subtle"
                  >
                    Delete
                  </Button>
                )}

                <Button size="sm" variant="ghost" onClick={clearPicked}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {folderItems.length > 0 && <FolderGrid items={folderItems} empty={null} />}

          {pagedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                {/* What the folder holds, not what this page of it shows — the
                    pager below already says which slice you are looking at. */}
                <span className="text-xs text-muted-foreground">
                  {fileCount} file{fileCount === 1 ? '' : 's'}
                </span>
                <ViewToggle view={view} onChange={setView} />
              </div>

              {view === 'grid' ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))]">
                  {pagedFiles.map((entry) => (
                    <FileCard
                      key={entry.key}
                      file={entry.file}
                      where={entry.where}
                      onView={setViewing}
                      onRemove={mayDelete ? () => void removeFile(entry.file) : undefined}
                      selected={pickedFiles.has(entry.file.id)}
                      onSelect={
                        mayFile || mayDelete
                          ? () => togglePicked(setPickedFiles, pickedFiles, entry.file.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/80">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/70 bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,2fr)_8rem_7rem_5rem_auto]">
                    <span>Name</span>
                    <span className="hidden sm:block">Filed by</span>
                    <span className="hidden sm:block">Filed</span>
                    <span className="hidden sm:block">Size</span>
                    <span className="text-right">Open</span>
                  </div>
                  {pagedFiles.map((entry) => (
                    <FileRow
                      key={entry.key}
                      file={entry.file}
                      where={entry.where}
                      onView={setViewing}
                      onRemove={mayDelete ? () => void removeFile(entry.file) : undefined}
                      selected={pickedFiles.has(entry.file.id)}
                      onSelect={
                        mayFile || mayDelete
                          ? () => togglePicked(setPickedFiles, pickedFiles, entry.file.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dropping files on the listing is what a drive is expected to do, and
          it is the same upload the button runs. Only inside a folder, and only
          for an account that may file — and not while searching, where the
          listing is the whole section and "this folder" means nothing. */}
      {here && mayFile && !searching && <DropTarget busy={upload.isPending} onFiles={send} />}

      {paged.pageCount > 1 && (
        <TablePager
          paged={paged}
          noun="items"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48]}
        />
      )}

      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          send(event.target.files);
          /* Cleared, so filing the same file twice in a row still fires. */
          event.target.value = '';
        }}
      />

      <FolderNameDialog
        open={Boolean(naming)}
        title={naming?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        confirmLabel={naming?.mode === 'rename' ? 'Rename' : 'Create'}
        initialName={naming?.mode === 'rename' ? naming.name : ''}
        busy={createFolder.isPending || renameFolder.isPending}
        error={
          createFolder.error || renameFolder.error
            ? explain(createFolder.error ?? renameFolder.error, 'The folder could not be saved.')
            : null
        }
        onCancel={() => {
          setNaming(null);
          createFolder.reset();
          renameFolder.reset();
        }}
        onSubmit={(name) => {
          if (!naming) return;
          if (naming.mode === 'rename') {
            renameFolder.mutate({ id: naming.id, name }, { onSuccess: () => setNaming(null) });
          } else {
            createFolder.mutate(
              /* The owner rides along only at the root. Inside a folder the
                 server takes it from the parent, which is what stops a folder
                 from being filed under a company it is not inside. */
              here ? { name, parentId: here.id } : { name, parentId: null, ...(owner ?? {}) },
              { onSuccess: () => setNaming(null) },
            );
          }
        }}
      />

      <DocumentViewerModal
        open={Boolean(viewing)}
        onOpenChange={(next) => !next && setViewing(null)}
        document={viewing}
      />
      {confirmDialog}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The figures above the listing — scoped to the folder you are standing in
 * ------------------------------------------------------------------------- */

function FileTallyTiles({
  folders,
  files,
  bytes,
}: {
  folders: number;
  files: number;
  bytes: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatisticCard
        title="Folders"
        value={folders}
        variant="blue"
        icon={<Folder className="h-5 w-5" />}
      />
      <StatisticCard title="Files" value={files} variant="teal" icon={<Files className="h-5 w-5" />} />
      <StatisticCard
        title="Stored"
        value={formatFileSize(bytes, '0 B')}
        icon={<HardDrive className="h-5 w-5" />}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The files themselves
 * ------------------------------------------------------------------------- */

/**
 * A file, drawn.
 *
 * The same card the compliance folders use, minus everything the catalogue
 * put on it: no expiry chip, no review state, no empty slot behind it. What
 * is left is what a file in a folder somebody made actually has — a picture
 * of it, its name, and what you can do with it.
 */
/**
 * "2 folders and 3 files" — what the confirm is about to remove.
 *
 * Spelled out rather than "3 items", because the two are not equally
 * reversible: deleting a file loses one thing, deleting a folder loses
 * everything under it, and a reader answering a dialog deserves to know which
 * kinds are in the batch before the count.
 */
function describeSelection(folders: number, files: number): string {
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  return parts.join(' and ') || 'nothing';
}

function FileCard({
  file,
  where,
  onView,
  onRemove,
  selected,
  onSelect,
}: {
  file: DocumentRecord;
  where?: string;
  onView: (document: DocumentToView) => void;
  onRemove?: () => void;
  /** Ticked into the batch the selection bar acts on. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  const display = toDisplayDocument(file);

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card shadow-2xs transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border/80 hover:border-primary/50',
      )}
    >
      {/* The same tick the folders wear, in the same corner — a grid that
          mixes folders and files has to offer one gesture, not two. */}
      {onSelect ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={Boolean(selected)}
          aria-label={`Select ${file.name}`}
          onClick={onSelect}
          className={cn(
            'absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded border transition',
            'focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            selected
              ? 'border-primary bg-primary text-primary-foreground opacity-100'
              : 'border-border-strong bg-card text-transparent opacity-0 group-hover:opacity-100',
          )}
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onView(display)}
        title={`Open ${file.name}`}
        className="block aspect-[4/3] w-full overflow-hidden border-b border-border/60 bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <DocumentPreview document={display} />
      </button>

      <div className="flex items-center gap-2 px-2.5 py-2">
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-bold text-foreground" title={file.name}>
            {file.name}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {where ?? `${display.fileSize} · ${display.uploadDate}`}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-end gap-0.5 border-t border-border/50 px-1.5 py-1">
        <IconAction icon={Eye} label="Open the file" onClick={() => onView(display)} />
        <IconAction
          icon={Download}
          label="Download"
          onClick={() => void triggerDocumentDownload(file.id, file.name)}
        />
        {onRemove && <IconAction icon={Trash2} label="Delete" onClick={onRemove} danger />}
      </div>
    </div>
  );
}

function FileRow({
  file,
  where,
  onView,
  onRemove,
  selected,
  onSelect,
}: {
  file: DocumentRecord;
  where?: string;
  onView: (document: DocumentToView) => void;
  onRemove?: () => void;
  /** Ticked into the batch the selection bar acts on. */
  selected?: boolean;
  onSelect?: () => void;
}) {
  const display = toDisplayDocument(file);

  return (
    <div
      className={cn(
        'group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/50 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_8rem_7rem_5rem_auto]',
        selected ? 'bg-primary-subtle' : 'hover:bg-muted/30',
      )}
    >
      <button
        type="button"
        onClick={() => onView(display)}
        className="flex min-w-0 items-center gap-2 text-left"
      >
        {/* In a row the tick takes the icon's place on hover rather than
            floating over it — a list has no corner to put it in, and two marks
            side by side in a 12px column is noise. */}
        {onSelect ? (
          <span
            role="checkbox"
            aria-checked={Boolean(selected)}
            aria-label={`Select ${file.name}`}
            tabIndex={0}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect();
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onSelect();
            }}
            className={cn(
              'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border transition',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border-strong bg-card text-transparent opacity-0 group-hover:opacity-100',
            )}
          >
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-foreground">{file.name}</span>
          {where && <span className="block truncate text-[10px] text-muted-foreground">{where}</span>}
        </span>
      </button>
      <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
        {file.uploadedByName ?? '—'}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:block">{display.uploadDate}</span>
      <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
        {display.fileSize}
      </span>
      <span className="flex items-center justify-end gap-0.5">
        <IconAction icon={Eye} label="Open the file" onClick={() => onView(display)} />
        <IconAction
          icon={Download}
          label="Download"
          onClick={() => void triggerDocumentDownload(file.id, file.name)}
        />
        {onRemove && <IconAction icon={Trash2} label="Delete" onClick={onRemove} danger />}
      </span>
    </div>
  );
}

/**
 * Drop files here.
 *
 * A strip under the listing rather than an overlay over it: an overlay that
 * appears on dragenter has to guess when to leave again, and a drive whose
 * whole page flickers grey every time something is dragged past it is worse
 * than a target that is simply always visible and says what it is for.
 */
function DropTarget({ busy, onFiles }: { busy: boolean; onFiles: (files: FileList) => void }) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFiles(event.dataTransfer.files);
      }}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-xs transition-colors',
        over
          ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
          : 'border-border/80 text-muted-foreground',
      )}
    >
      <Upload className="size-4" />
      {busy ? 'Filing…' : 'Drop files here to file them in this folder'}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Bits
 * ------------------------------------------------------------------------- */

function explain(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return /permission|forbidden|403/i.test(error.message)
    ? 'Your role cannot change the Files section. Ask an administrator for the "documents.upload" permission.'
    : error.message || fallback;
}
