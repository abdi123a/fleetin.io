import { useMemo, useRef, useState } from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Input,
  StatisticCard,
  useConfirm,
} from '@/design-system';
import {
  Download,
  Eye,
  FileText,
  Files,
  Folder,
  FolderPlus,
  HardDrive,
  MoreVertical,
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
import { describeContents, listFiles, searchFiles, type FileFolder } from '@/features/documents/files';
import { formatFileSize } from '@/utils/format';
import { cn } from '@/utils';

import { DriveTabs, type DriveSection } from './DriveTabs';
import { DriveTrail } from './DriveTrail';
import { FolderGrid, type FolderItem } from './FolderTiles';
import { FolderNameDialog } from './FolderNameDialog';

/**
 * The Files section of Fleetin Drive — the half of the drive people make.
 *
 * The compliance half is derived and closed: a folder exists because a truck
 * does, and holds the papers the catalogue asks for. Nothing in it can hold a
 * signed contract, a tender, a photograph of a damaged box — which is most of
 * what people turned up wanting to file. So this half is open: folders exist
 * because somebody made them, nested as deep as they like, holding files the
 * catalogue has no opinion on. Nothing here is required, expires, or is
 * reviewed.
 *
 * Browsed exactly like the other half — same trail, same folder tiles, same
 * search — because a reader crossing between the two tabs should not have to
 * learn a second file browser. What differs is what a folder reports: over
 * there it is what is wrong inside, here it is what is inside.
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

export function FilesDrive({ onSection }: { onSection: (next: DriveSection) => void }) {
  const { data: folders = [] } = useDriveFolders();
  const { data: files = [] } = useFileBook();
  const { can } = usePermissions();

  const mayFile = can('documents.upload');
  const mayDelete = can('documents.delete');

  const [path, setPath] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<FileSortKey>('recent');
  const [view, setView] = useState<DocumentView>('grid');
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; id: string; name: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<DocumentToView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    resetKey: `${searchTerm}|${sort}|${path.join('/')}`,
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

  const removeFolder = async (folder: FileFolder) => {
    const inside = describeContents(folder.tally);
    const ok = await confirm({
      title: `Delete ${folder.label}?`,
      description:
        folder.tally.files > 0 || folder.tally.folders > 0
          ? `Everything inside goes with it — ${inside.toLowerCase()}, permanently.`
          : 'The folder is removed permanently.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    dropFolder.mutate(folder.id, {
      onSuccess: () => {
        /* Standing in what was just deleted: step out rather than sit on a
           trail that leads nowhere. */
        if (path.includes(folder.id)) setPath(path.slice(0, path.indexOf(folder.id)));
      },
      onError: (caught) => setNotice(explain(caught, 'The folder could not be deleted.')),
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
  }));

  return (
    <div className="space-y-5">
      <DriveTabs
        value="files"
        onChange={onSection}
        actions={
          mayFile ? (
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
          ) : undefined
        }
      />

      <FileTallyTiles
        folders={listing.tally.folders}
        files={listing.tally.files}
        bytes={listing.tally.bytes}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DriveTrail
          steps={listing.trail.map((step) => ({ key: step.id ?? 'root', label: step.label }))}
          onStep={(index) =>
            setPath(
              listing.trail
                .slice(1, index + 1)
                .map((step) => step.id as string),
            )
          }
        />

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search every folder…"
            leadingIcon={<Search className="size-4" />}
            isClearable
            onClear={() => setSearchTerm('')}
            className="w-full sm:w-72"
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
          {/* The folder you are standing in, and the two things you can do to
              it. Not on the tile: the tile's click is spoken for by opening. */}
          {here && !searching && (mayFile || mayDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label={`${here.name} actions`} variant="outline" size="sm">
                  <MoreVertical />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {mayFile && (
                  <DropdownMenuItem
                    onSelect={() => ask({ mode: 'rename', id: here.id, name: here.name })}
                  >
                    <Pencil className="size-4" />
                    Rename
                  </DropdownMenuItem>
                )}
                {mayDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      const entry = folderOf(here.id, listing.tally, here.name);
                      void removeFolder(entry);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {notice && <p className="text-[11px] font-medium text-destructive">{notice}</p>}

      {paged.rows.length === 0 ? (
        <EmptyState
          icon={searching ? Search : Folder}
          title={
            searching
              ? `Nothing in Files matches “${searchTerm.trim()}”`
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
              { name, parentId: here?.id ?? null },
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
function FileCard({
  file,
  where,
  onView,
  onRemove,
}: {
  file: DocumentRecord;
  where?: string;
  onView: (document: DocumentToView) => void;
  onRemove?: () => void;
}) {
  const display = toDisplayDocument(file);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs transition-colors hover:border-primary/50">
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
}: {
  file: DocumentRecord;
  where?: string;
  onView: (document: DocumentToView) => void;
  onRemove?: () => void;
}) {
  const display = toDisplayDocument(file);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-muted/30 sm:grid-cols-[minmax(0,2fr)_8rem_7rem_5rem_auto]">
      <button
        type="button"
        onClick={() => onView(display)}
        className="flex min-w-0 items-center gap-2 text-left"
      >
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

/**
 * The folder you are standing in, in the shape `removeFolder` reads.
 *
 * The listing describes the folders BELOW this level, so the one you are
 * inside is not among them — but deleting it asks the same question about the
 * same two numbers, and `listing.tally` is exactly those numbers for here.
 */
function folderOf(id: string, tally: FileFolder['tally'], label: string): FileFolder {
  return {
    key: `folder:${id}`,
    id,
    label,
    sublabel: describeContents(tally),
    papers: [],
    tally,
    touchedAt: '',
  };
}

function explain(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return /permission|forbidden|403/i.test(error.message)
    ? 'Your role cannot change the Files section. Ask an administrator for the "documents.upload" permission.'
    : error.message || fallback;
}
