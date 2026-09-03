import { useMemo, useState, useRef } from 'react';

import { Button, Input, StatisticCard, useConfirm } from '@/design-system';
import { Folder, FolderPlus, Search, ShieldCheck } from '@/design-system/icons';
import { TablePager, usePagedRows } from '@/components';
import { FilterMenu } from '@/components/common';
import { RecordRaise } from '@/features/workspace';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { toDisplayDocument, type DisplayDocument } from '@/features/documents/api/documentsService';
import {
  useDeleteDocument,
  useDocumentBook,
  useDocuments,
  useUploadDocument,
  useVerifyDocument,
} from '@/features/documents/api/queries';
import { DocumentBrowser, type DocumentView } from '@/features/documents/components/DocumentBrowser';
import { DocumentDetailsSheet } from '@/features/documents/components/DocumentDetailsSheet';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import type { DocumentCapture } from '@/features/documents/components/DocumentCaptureDialog';
import { newestFirst, type DocumentTypeSpec } from '@/features/documents/catalog';
import {
  listDrive,
  searchDrive,
  type DriveCompany,
  type DriveFolder,
  type DriveLeaf,
  type DriveSegment,
} from '@/features/documents/drive';
import type { ComplianceTally } from '@/features/documents/compliance';
import { useDrivers } from '@/features/drivers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { useShippers } from '@/features/shippers/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';

import { foldersOf, listFiles, type FileFolder } from '@/features/documents/files';
import { useCreateDriveFolder, useDriveFolders, useFileBook } from '@/features/documents/api/queries';

import { DriveTabs, type DriveSection } from './DriveTabs';
import { FilesBrowser } from './FilesBrowser';
import { FolderNameDialog } from './FolderNameDialog';
import { DriveTrail } from './DriveTrail';
import { FolderGrid, FolderState, toneOf, useFolderColumns, type FolderItem } from './FolderTiles';

/**
 * Every compliance paper the company holds, in folders.
 *
 * This was a flat register of 264 rows. It answered one question well ("what
 * lapses this month") and the more common one not at all: *show me everything
 * we hold on this haulier*. A flat list answers that only by being filtered,
 * which means knowing what to type before you are allowed to look.
 *
 * The tree is shaped the way the paperwork is actually owned — see `drive.ts`.
 * A company opens onto Company / Vehicles / Drivers; a truck onto its grey card
 * and its insurance; a driver onto his licence. Filing happens in the folder
 * the paper belongs to, through the same `DocumentChecklist` the vehicle sheet
 * and the onboarding wizards use, so a grey card filed from the drive is asked
 * for in the same words, with the same two dates, as one filed from the truck.
 *
 * ## Folders carry their faults
 *
 * The one thing a tree costs is the overview: a lapsed policy on truck nineteen
 * is three clicks from the root and invisible from it. So every folder is
 * tallied over everything beneath it and reports what is wrong inside — at the
 * root, at the company, at the section, and finally on the truck. You can
 * always see where to go next without opening anything.
 */
/**
 * How the drive can be ordered.
 *
 * Every comparator falls back to the label, so a page of folders that all owe
 * nothing is alphabetical rather than arbitrary — otherwise "sorted by most
 * missing" reshuffles a clean drive on every render for no reason a reader
 * could name.
 *
 * Only what a folder actually carries: `ComplianceTally` has no dates on it,
 * so there is no "expiring soonest" here — that would need the documents
 * themselves, and a control that sorts by a number the card does not show is
 * a control nobody can check.
 */
type DriveSortKey = 'attention' | 'missing' | 'expired' | 'name';

/**
 * Which half of the book to show.
 *
 * The drive holds both sides of every job — the carrier that moved it and the
 * shipper that owned it — and they are stored together because compliance is
 * one question. But they are read apart: chasing an expiring insurance is a
 * transporter errand, and checking a customer's papers is a commercial one, and
 * mixing 10 transporters into 8 shippers means scanning past half the tiles
 * whichever of the two you came for.
 *
 * A filter rather than two tabs: the tabs above already split Compliance from
 * Files, and a second row of them would make the reader parse two switchers
 * before reaching a folder.
 */
const DRIVE_KINDS = [
  { value: 'all', label: 'Everyone' },
  { value: 'PARTNER', label: 'Transporters' },
  { value: 'SHIPPER', label: 'Shippers' },
] as const;
type DriveKindKey = (typeof DRIVE_KINDS)[number]['value'];

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

const DRIVE_SORTS: Record<
  DriveSortKey,
  { label: string; compare: (a: DriveSortable, b: DriveSortable) => number }
> = {
  attention: {
    label: 'Needs attention',
    compare: (a, b) => b.tally.attention - a.tally.attention || byLabel(a, b),
  },
  missing: {
    label: 'Most missing',
    compare: (a, b) => b.tally.missing - a.tally.missing || byLabel(a, b),
  },
  expired: {
    label: 'Most expired',
    compare: (a, b) => b.tally.expired - a.tally.expired || byLabel(a, b),
  },
  name: { label: 'Name (A–Z)', compare: byLabel },
};

/** The half of a folder or a search hit that sorting reads. */
interface DriveSortable {
  label: string;
  tally: ComplianceTally;
}

/**
 * One tile on a company's level — derived, or somebody's own.
 *
 * Both kinds sit in the same grid because both are folders belonging to this
 * company: Vehicles is here because the trucks are, Contracts is here because
 * somebody put it here. They sort and page as one list — a company with two
 * dozen folders of its own should not get a separate pager for them — so the
 * union carries the two fields the comparator reads, and a made folder owes
 * nothing, which is what puts it below anything owing work.
 */
type CompanyTile =
  | { own: false; key: string; label: string; tally: ComplianceTally; folder: DriveFolder }
  | { own: true; key: string; label: string; tally: ComplianceTally; folder: FileFolder };

const NOTHING_OWED: ComplianceTally = {
  required: 0,
  valid: 0,
  expiring: 0,
  expired: 0,
  missing: 0,
  attention: 0,
};

export function ComplianceDrive({ onSection }: { onSection: (next: DriveSection) => void }) {
  const { data: documents = [] } = useDocumentBook();
  const { data: shippersPage } = useShippers();
  const { data: partnersPage } = usePartners();
  const { data: vehiclesPage } = useVehicles();
  const { data: driversPage } = useDrivers();

  const [path, setPathState] = useState<DriveSegment[]>([]);
  /**
   * How far into a folder somebody made, below the company level.
   *
   * A second path rather than a segment in the first, because the two trees
   * answer to different modules: `listDrive` derives everything it lists and
   * has no business knowing about folders people typed a name into. Empty
   * means the company's own grid is what is on screen.
   */
  const [folderPath, setFolderPath] = useState<string[]>([]);
  /* Any move in the compliance tree leaves whatever folder was open — the two
     are never both live, and a stale folder path is how you end up inside a
     haulier's contract while the trail says you are looking at a truck. */
  const setPath = (next: DriveSegment[]) => {
    setPathState(next);
    setFolderPath([]);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [naming, setNaming] = useState(false);
  const [sort, setSort] = useState<DriveSortKey>('attention');
  const [kind, setKind] = useState<DriveKindKey>('all');
  /* Held here rather than in the leaf, so walking from one truck to the next
     does not silently put the browser back into grid. */
  const [view, setView] = useState<DocumentView>('grid');

  /** The book, reshaped as companies with their fleets under them. */
  const companies: DriveCompany[] = useMemo(() => {
    const vehicles = vehiclesPage?.items ?? [];
    const drivers = driversPage?.items ?? [];

    const partners = (partnersPage?.items ?? []).map<DriveCompany>((partner) => ({
      id: partner.id,
      name: partner.companyLegalName,
      kind: 'PARTNER',
      reference: partner.reference,
      vehicles: vehicles
        .filter((vehicle) => vehicle.partnerId === partner.id)
        .map((vehicle) => ({
          id: vehicle.id,
          label: vehicle.plateNumber,
          sublabel: [vehicle.truckType, vehicle.make].filter(Boolean).join(' · ') || undefined,
          reference: vehicle.reference,
        })),
      drivers: drivers
        .filter((driver) => driver.partnerId === partner.id)
        .map((driver) => ({
          id: driver.id,
          label: driver.fullName,
          sublabel: driver.phone || undefined,
          reference: driver.reference,
        })),
    }));

    const shippers = (shippersPage?.items ?? []).map<DriveCompany>((shipper) => ({
      id: shipper.id,
      name: shipper.companyLegalName,
      kind: 'SHIPPER',
      reference: shipper.reference,
      vehicles: [],
      drivers: [],
    }));

    /* Transporters first: three of the four papers belong to one, so that is
       the half of the book anybody opening this page is usually after. */
    return [...partners, ...shippers];
  }, [partnersPage, shippersPage, vehiclesPage, driversPage]);

  /* Narrowed BEFORE `listDrive`, not after it — so the tally tiles above count
     the same book the folders below show. Filtering the returned folders would
     have left "9 missing" standing over a grid of shippers that owed two. */
  const scoped = useMemo(
    () => (kind === 'all' ? companies : companies.filter((company) => company.kind === kind)),
    [companies, kind],
  );

  const listing = useMemo(() => listDrive(path, scoped, documents), [path, scoped, documents]);

  const { data: driveFolders = [] } = useDriveFolders();
  const { data: driveFiles = [] } = useFileBook();
  const createFolder = useCreateDriveFolder();
  const mayFile = usePermissions().can('documents.upload');

  /**
   * The company being looked at, when one is — and only at ITS level.
   *
   * Folders somebody made belong to the company, not to its trucks: they show
   * on the level that opens onto Company / Vehicles / Drivers, and nowhere
   * deeper. `owner` is what says which company, for listing and for creating.
   */
  const owner = useMemo(() => {
    const first = path[0];
    if (path.length !== 1 || !first || first.kind !== 'company') return null;
    const company = scoped.find((entry) => entry.id === first.id);
    return company ? { ownerType: company.kind, ownerId: company.id, label: company.name } : null;
  }, [path, scoped]);

  /** This company's own folders, off the same book the Files tab reads. */
  const ownFolders = useMemo(
    () => (owner ? foldersOf(driveFolders, owner) : []),
    [owner, driveFolders],
  );
  const ownRoots = useMemo(
    () => (owner ? listFiles([], ownFolders, driveFiles).folders : []),
    [owner, ownFolders, driveFiles],
  );
  const matches = useMemo(
    () => searchDrive(searchTerm, scoped, documents),
    [searchTerm, scoped, documents],
  );
  /* Sorted by what is wrong with it rather than by what it is called.
     This is a compliance surface — the tiles above count Missing, Expired and
     Expiring — so the folder owing work belongs at the top, and name is there
     for when you already know which one you are after.

     The same order is applied to search results: a reader who has chosen "most
     missing" and then types a name has not stopped caring about the order. */
  const compare = DRIVE_SORTS[sort].compare;
  const folders = useMemo<CompanyTile[]>(() => {
    const derived = listing.folders.map<CompanyTile>((folder) => ({
      own: false,
      key: folder.key,
      label: folder.label,
      tally: folder.tally,
      folder,
    }));
    const made = ownRoots.map<CompanyTile>((folder) => ({
      own: true,
      key: folder.key,
      label: folder.label,
      tally: NOTHING_OWED,
      folder,
    }));
    return [...derived, ...made].sort(compare);
  }, [listing.folders, ownRoots, compare]);
  const sortedMatches = useMemo(() => [...matches].sort(compare), [matches, compare]);

  const searching = searchTerm.trim().length > 0;

  /* One page of folders at a time.
   *
   * 12, because the grid is two, three or four across depending on the width
   * and twelve is the smallest useful number that fills a whole last row at
   * every one of them — a page ending in a single orphan tile reads as a
   * loading failure.
   *
   * The pager runs over whichever grid is on screen, so searching a large
   * drive does not hand back the scroll this was added to remove. Changing the
   * folder, the search or the sort returns to page one: page 4 of the old list
   * is a different set of folders in the new one, and landing there looks like
   * the filter did nothing. */
  /**
   * A page that fills whole rows.
   *
   * The size used to be a flat 12, chosen when the grid was believed to be
   * "two, three or four across". It is not — it is `auto-fill` over a 210px
   * track, so a wide window with the sidebar shut lays out five, six or seven,
   * and 12 tiles then ended a page mid-row: three empty cells on screen while
   * six more folders sat on page 2. That reads as the grid having run out
   * rather than the pager having cut it.
   *
   * So the chosen size is rounded UP to a whole number of rows at whatever the
   * grid is currently doing — never down, or picking a size would show fewer
   * folders than it names. `columns` is measured, so this re-settles when the
   * window resizes or the sidebar collapses.
   */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columns = useFolderColumns(gridRef);
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const pageSize = Math.max(columns, Math.ceil(rowsPerPage / columns) * columns);
  /* Two pagers rather than one over a union: the folder grid and the search
     grid hold different shapes, and collapsing them would cost each branch the
     type that tells it which fields it has. They share a page size; `paged` is
     only for the readout, whose fields are the same either way. */
  const pagedFolders = usePagedRows(folders, {
    pageSize,
    resetKey: `${sort}|${JSON.stringify(path)}`,
  });
  const pagedMatches = usePagedRows(sortedMatches, {
    pageSize,
    resetKey: `${searchTerm}|${sort}`,
  });
  const paged = searching ? pagedMatches : pagedFolders;

  /**
   * Inside a folder somebody made — the same browser the Files tab hosts.
   *
   * Nothing on this level is derived, so none of the compliance furniture
   * applies: the tiles above count papers that are owed and nothing here is
   * owed, and the search looks for trucks and drivers rather than for a
   * contract. The browser brings its own figures, its own search and its own
   * actions; all this level owes it is the way back out, which is why the
   * path is held here and handed down.
   */
  if (owner && folderPath.length > 0) {
    return (
      <div className="space-y-5">
        <DriveTabs value="compliance" onChange={onSection} />
        <FilesBrowser
          key={`${owner.ownerType}:${owner.ownerId}`}
          owner={{ ownerType: owner.ownerType, ownerId: owner.ownerId }}
          path={folderPath}
          onPath={setFolderPath}
          /* The company IS the root of its own folders, so the browser does
             not draw a second one — "Massida Logistics › Contracts", with no
             invented level in between. */
          showRoot={false}
          trailPrefix={listing.trail.map((step, index) => ({
            key: `${step.label}-${index}`,
            label: step.label,
          }))}
          onPrefixStep={(index) => setPath(path.slice(0, index))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DriveTabs value="compliance" onChange={onSection} />

      <TallyTiles tally={listing.tally} />

      {/* Trail on the left, every control on the right. The controls never
          wrap among themselves — a search box on one line with the sort and
          the actions stranded underneath reads as a broken layout. When the
          two halves stop fitting side by side the control group drops to its
          own line whole. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <DriveTrail
          steps={listing.trail.map((step, index) => ({ key: `${step.label}-${index}`, label: step.label }))}
          onStep={(index) => setPath(path.slice(0, index))}
        />

        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search the whole drive…"
            leadingIcon={<Search className="size-4" />}
            isClearable
            onClear={() => setSearchTerm('')}
            /* Shrinks rather than pushing its neighbours onto a second line. */
            className="w-40 min-w-0 md:w-56 lg:w-64"
          />
          <FilterMenu
            groups={[
              {
                /* First, because it decides WHICH folders are on the page;
                   the sort only decides their order. */
                key: 'kind',
                label: 'Show',
                value: kind,
                onChange: (value) => {
                  setKind(value as DriveKindKey);
                  /* Back to the root. The open folder may not survive the
                     filter, and a path pointing at a company that is no longer
                     in the book lists nothing — which reads as the drive having
                     emptied rather than as the filter having changed. */
                  setPath([]);
                },
                options: DRIVE_KINDS.map((entry) => ({ value: entry.value, label: entry.label })),
                defaultValue: 'all',
              },
              {
                key: 'sort',
                label: 'Sort by',
                value: sort,
                onChange: (value) => setSort(value as DriveSortKey),
                options: (Object.keys(DRIVE_SORTS) as DriveSortKey[]).map((key) => ({
                  value: key,
                  label: DRIVE_SORTS[key].label,
                })),
                defaultValue: 'attention',
              },
            ]}
          />

          {/* Only on a company's own level. Below it every folder is derived —
              a truck's papers are the truck's — and above it a folder would
              belong to no one. */}
          {owner && mayFile && (
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<FolderPlus />}
              onClick={() => {
                createFolder.reset();
                setNaming(true);
              }}
            >
              New folder
            </Button>
          )}
        </div>
      </div>

      <div ref={gridRef}>
      {searching ? (
        <FolderGrid
          empty={`Nothing in the drive matches “${searchTerm.trim()}”.`}
          items={pagedMatches.rows.map<FolderItem>((match) => ({
            key: match.key,
            label: match.label,
            sublabel: match.where,
            icon: match.icon,
            tone: toneOf(match.tally),
            papers: match.papers,
            state: <FolderState tally={match.tally} />,
            onOpen: () => {
              setPath(match.path);
              setSearchTerm('');
            },
          }))}
        />
      ) : listing.leaf ? (
        <LeafFolder leaf={listing.leaf} view={view} onViewChange={setView} />
      ) : (
        <FolderGrid
          empty="This folder is empty."
          items={pagedFolders.rows.map<FolderItem>((tile) =>
            tile.own
              ? {
                  key: tile.key,
                  label: tile.folder.label,
                  /* What is inside it. A made folder owes nothing, so the
                     badge that reports what is owed would read "empty"
                     forever — it reports the contents instead. */
                  sublabel: tile.folder.sublabel,
                  icon: 'folder',
                  tone: 'clean',
                  papers: tile.folder.papers,
                  onOpen: () => setFolderPath([tile.folder.id]),
                }
              : {
                  key: tile.key,
                  label: tile.folder.label,
                  sublabel: tile.folder.sublabel,
                  icon: tile.folder.icon,
                  company: tile.folder.company,
                  tone: toneOf(tile.folder.tally),
                  papers: tile.folder.papers,
                  state: <FolderState tally={tile.folder.tally} />,
                  onOpen: () => setPath([...path, tile.folder.segment]),
                },
          )}
        />
      )}
      </div>

      {/* Only where there is a grid to page. A leaf folder is one owner's
          papers and `LeafFolder` handles its own listing; a drive that fits on
          one page says so by not drawing a pager at all. */}
      {!listing.leaf && paged.pageCount > 1 && (
        <TablePager
          paged={paged}
          noun="folders"
          /* The snapped size is what a page actually holds, so that is what
             the readout has to count with; the options remain the round
             numbers a reader picks between. */
          pageSize={pageSize}
          onPageSizeChange={setRowsPerPage}
          pageSizeOptions={[12, 24, 48]}
        />
      )}

      <FolderNameDialog
        open={naming}
        title={owner ? `New folder in ${owner.label}` : 'New folder'}
        confirmLabel="Create"
        busy={createFolder.isPending}
        error={
          createFolder.error instanceof Error
            ? createFolder.error.message
            : createFolder.error
              ? 'The folder could not be created.'
              : null
        }
        onCancel={() => {
          setNaming(false);
          createFolder.reset();
        }}
        onSubmit={(name) => {
          if (!owner) return;
          createFolder.mutate(
            { name, parentId: null, ownerType: owner.ownerType, ownerId: owner.ownerId },
            { onSuccess: () => setNaming(false) },
          );
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The figures above the listing — scoped to the folder you are standing in
 * ------------------------------------------------------------------------- */

function TallyTiles({ tally }: { tally: ComplianceTally }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatisticCard
        title="Missing"
        value={tally.missing}
        variant={tally.missing > 0 ? 'peach' : 'default'}
        icon={<Folder className="h-5 w-5" />}
      />
      <StatisticCard
        title="Expired"
        value={tally.expired}
        variant={tally.expired > 0 ? 'pink' : 'default'}
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <StatisticCard
        title="Expiring"
        value={tally.expiring}
        variant="blue"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <StatisticCard
        title="In Force"
        value={tally.valid}
        variant="teal"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The leaf — the papers themselves
 * ------------------------------------------------------------------------- */

/**
 * A record's own papers, filed and missing.
 *
 * Not a second uploader written for this page: `DocumentChecklist` is what the
 * vehicle sheet, the driver sheet and both onboarding wizards use, so it asks
 * the same three questions here as everywhere else — the scan, the day it was
 * registered, the day it expires — and the insurer on top for a policy.
 */
function LeafFolder({
  leaf,
  view,
  onViewChange,
}: {
  leaf: DriveLeaf;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
}) {
  const { data: raw = [] } = useDocuments(leaf.ownerType, leaf.ownerId);
  const upload = useUploadDocument(leaf.ownerType, leaf.ownerId);
  const remove = useDeleteDocument(leaf.ownerType, leaf.ownerId);
  const verify = useVerifyDocument(leaf.ownerType, leaf.ownerId);
  const { confirm, confirmDialog } = useConfirm();

  /* Two different questions, two different surfaces: `viewing` is the scan
     itself, `inspecting` is the record about it. Conflating them was the bug —
     clicking a picture of a certificate showed a table of dates. */
  const [viewing, setViewing] = useState<DocumentToView | null>(null);
  const [inspecting, setInspecting] = useState<DisplayDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const documents: DisplayDocument[] = raw.map(toDisplayDocument);

  const file = (spec: DocumentTypeSpec, capture: DocumentCapture) => {
    setError(null);
    upload.mutate(
      {
        category: spec.label,
        file: capture.file,
        issueDate: capture.issueDate,
        expiryDate: capture.expiryDate,
        issuer: capture.issuer,
      },
      {
        onError: (caught) =>
          setError(caught instanceof Error ? caught.message : 'The document could not be filed.'),
      },
    );
  };

  /**
   * Deleting means two different things, and the dialog has to say which.
   *
   * A paper the catalogue asks for leaves its empty slot behind — the folder
   * still shows the row, now marked as owed, and a replacement can be filed
   * into it. An EXTRA has no slot behind it, so deleting one takes the row with
   * it and there is no way back short of re-uploading the file. Same bin icon,
   * two outcomes; the difference is worth a sentence.
   */
  const drop = async (document: DisplayDocument, inCatalog: boolean) => {
    const ok = await confirm({
      title: `Delete ${document.category}?`,
      description: inCatalog
        ? `The file is removed permanently. ${leaf.label} will show this paper as owed until a replacement is filed.`
        : `The file is removed permanently, and its row with it — this is not one of the papers Fleetin asks ${leaf.label} for.`,
      confirmLabel: 'Delete',
    });
    if (ok) remove.mutate(document.id);
  };

  const download = (document: DisplayDocument) =>
    void triggerDocumentDownload(document.id, document.name);

  return (
    <div className="space-y-3">
      {/* ── CHASE IT FROM HERE ──
       *
       * An expired insurance certificate is somebody's job to chase, and the
       * folder is where you find out it expired. Sending the reader off to the
       * truck's own page to raise the task is asking them to go and find the
       * record they are already standing in.
       *
       * The task is raised against the OWNER — the truck, the driver, the
       * company — not against the document: those are the four record types
       * Workspace already knows, the chip on the task links back to a page that
       * exists, and "chase Massida's licence" is work about Massida. */}
      <div className="flex items-center justify-end">
        <RecordRaise
          recordType={leaf.ownerType}
          recordId={leaf.ownerId}
          recordRef={leaf.reference}
          label={leaf.label}
          size="sm"
        />
      </div>

      <DocumentBrowser
        ownerType={leaf.ownerType}
        documents={documents}
        subject={leaf.label}
        busy={upload.isPending}
        error={error}
        view={view}
        onViewChange={onViewChange}
        onUpload={file}
        onView={setViewing}
        onInspect={setInspecting}
        onDownload={download}
        onRemove={(document, inCatalog) => void drop(document, inCatalog)}
      />

      <DocumentViewerModal
        open={Boolean(viewing)}
        onOpenChange={(open) => !open && setViewing(null)}
        document={viewing}
      />

      <DocumentDetailsSheet
        document={inspecting}
        ownerLabel={leaf.label}
        /* The copies this one replaced — same category, ranked the way the
           folder ranked them, minus the one on screen. */
        superseded={
          inspecting
            ? documents
                .filter((doc) => doc.category === inspecting.category && doc.id !== inspecting.id)
                .sort(newestFirst)
            : []
        }
        onView={setViewing}
        onClose={() => setInspecting(null)}
        onDownload={download}
        verifying={verify.isPending}
        /* Closes on success: the panel is showing a "Pending Review" record
           that has just stopped being pending, and leaving it open would have
           the reviewer looking at a stale answer to the question they just
           settled. */
        onVerify={(status, rejectionReason) => {
          if (!inspecting) return;
          verify.mutate(
            { id: inspecting.id, status, rejectionReason },
            {
              onSuccess: () => setInspecting(null),
              onError: (caught) =>
                setError(caught instanceof Error ? caught.message : 'The review could not be saved.'),
            },
          );
        }}
      />
      {confirmDialog}
    </div>
  );
}
