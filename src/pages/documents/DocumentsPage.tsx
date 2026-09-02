import { useMemo, useState } from 'react';

import { Badge, Input, StatisticCard, useConfirm } from '@/design-system';
import {
  Building2,
  ChevronRight,
  Folder,
  Search,
  ShieldCheck,
  Truck,
  User,
} from '@/design-system/icons';
import { PageHeader } from '@/components';
import { RecordRaise } from '@/features/workspace';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
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
import { useShippers } from '@/features/shippers/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';
import { cn } from '@/utils';

/**
 * Fleetin Drive — every compliance paper the company holds, in folders.
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
export function DocumentsPage() {
  const { data: documents = [] } = useDocumentBook();
  const { data: shippersPage } = useShippers();
  const { data: partnersPage } = usePartners();
  const { data: vehiclesPage } = useVehicles();
  const { data: driversPage } = useDrivers();

  const [path, setPath] = useState<DriveSegment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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

  const listing = useMemo(() => listDrive(path, companies, documents), [path, companies, documents]);
  const matches = useMemo(
    () => searchDrive(searchTerm, companies, documents),
    [searchTerm, companies, documents],
  );
  const searching = searchTerm.trim().length > 0;

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader title="Fleetin Drive" />

      <TallyTiles tally={listing.tally} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Where you are, and every way back. The root is a step like any
            other, so leaving a folder never needs the browser's Back. */}
        <nav className="flex min-w-0 flex-wrap items-center gap-0.5" aria-label="Folder">
          {listing.trail.map((step, index) => {
            const last = index === listing.trail.length - 1;
            return (
              <span key={`${step.label}-${index}`} className="flex min-w-0 items-center gap-0.5">
                {index > 0 && (
                  <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  disabled={last}
                  onClick={() => setPath(path.slice(0, index))}
                  className={cn(
                    'max-w-[16rem] truncate rounded-md px-1.5 py-1 text-sm transition-colors',
                    last
                      ? 'cursor-default font-bold text-foreground'
                      : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {step.label}
                </button>
              </span>
            );
          })}
        </nav>

        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search the whole drive…"
          leadingIcon={<Search className="size-4" />}
          isClearable
          onClear={() => setSearchTerm('')}
          className="w-full sm:w-72"
        />
      </div>

      {searching ? (
        <FolderGrid
          empty={`Nothing in the drive matches “${searchTerm.trim()}”.`}
          items={matches.map((match) => ({
            key: match.key,
            label: match.label,
            sublabel: match.where,
            icon: match.icon,
            tally: match.tally,
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
          items={listing.folders.map((folder) => ({
            key: folder.key,
            label: folder.label,
            sublabel: folder.sublabel,
            icon: folder.icon,
            company: folder.company,
            tally: folder.tally,
            onOpen: () => setPath([...path, folder.segment]),
          }))}
        />
      )}
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
 * Folders
 * ------------------------------------------------------------------------- */

interface FolderItem {
  key: string;
  label: string;
  sublabel?: string;
  icon: DriveFolder['icon'];
  company?: { id: string; name: string };
  tally: ComplianceTally;
  onOpen: () => void;
}

const FOLDER_GLYPH = {
  company: Building2,
  folder: Folder,
  vehicle: Truck,
  driver: User,
} as const;

function FolderGrid({ items, empty }: { items: FolderItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))]">
      {items.map((item) => (
        <FolderTile key={item.key} item={item} />
      ))}
    </div>
  );
}

/**
 * One folder, drawn as a folder.
 *
 * The first cut was a row: a small round mark, a name, a badge on the right. It
 * listed things correctly and read as a table — which is what this page used to
 * be, and the reason it was hard to browse. A folder is a shape people have
 * known for forty years: drawn at size it says "this opens" before a word is
 * read, and a grid of them stops looking like rows of records.
 *
 * ## The shape carries the state
 *
 * A clean folder is quiet grey. One holding an expired or missing paper is red,
 * one expiring is amber. The colour is the worst finding anywhere in the
 * subtree, so a lapsed policy on truck nineteen is a red folder at the root —
 * which is what lets the tree afford to have levels at all.
 */
function FolderTile({ item }: { item: FolderItem }) {
  const Glyph = FOLDER_GLYPH[item.icon];
  const tone: FolderTone =
    item.tally.expired > 0 || item.tally.missing > 0
      ? 'fault'
      : item.tally.expiring > 0
        ? 'warn'
        : 'clean';

  return (
    <button
      type="button"
      onClick={item.onOpen}
      title={item.sublabel ? `${item.label} — ${item.sublabel}` : item.label}
      className="group flex flex-col items-center rounded-lg border border-transparent p-3 text-center transition-colors hover:border-border/80 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* Every tile is the same four bands at the same heights — folder, name,
          detail, state — so a grid of them lines up on all four however long
          the names are and whether or not a folder has anything wrong in it. */}
      <span className="relative block w-[124px] shrink-0">
        <FolderShape tone={tone} />

        {/* The mark sits on the folder's face, which is what makes a company's
            folder recognisable before it is read. It needs a body colour with
            enough weight to hold it — see `--folder-face`. */}
        <span className="absolute inset-x-0 top-[40%] flex justify-center">
          {item.company ? (
            <CompanyMark
              id={item.company.id}
              name={item.company.name}
              size="sm"
              className="size-10 ring-2 ring-card"
            />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-card text-primary-bold ring-2 ring-card">
              <Glyph className="size-5" />
            </span>
          )}
        </span>
      </span>

      <span className="mt-3 block w-full truncate text-sm font-bold leading-tight text-foreground">
        {item.label}
      </span>

      <span className="mt-0.5 block h-4 w-full truncate text-[11px] leading-4 text-muted-foreground">
        {item.sublabel}
      </span>

      <span className="mt-1.5 flex min-h-[20px] flex-wrap items-center justify-center gap-1">
        <FolderState tally={item.tally} />
      </span>
    </button>
  );
}

type FolderTone = 'clean' | 'warn' | 'fault';

/* Tab and face as two shapes, because that is what makes it read as a folder
   rather than as a rounded rectangle with a bite taken out of it: the face
   overlaps the tab, and the two tones give the fold an edge.
 *
 * ## The body is neutral; the tab is the state
 *
 * `--folder-face` is a grey, and that is deliberate — see the token. A grid of
 * brand-coloured folders is a grid of things all asking to be looked at, and
 * the two that hold a lapsed policy are left with nothing to distinguish them.
 * A neutral body spends no attention, so the whole of it goes to the tab: red
 * for a paper missing or lapsed, amber for one about to, and the brand teal on
 * the fold when there is nothing wrong. */
const FOLDER_FILL: Record<FolderTone, { tab: string; face: string }> = {
  clean: { tab: 'fill-folder-fold', face: 'fill-folder-face' },
  /* At 70%. A tab at full strength is a saturated bar on every folder that has
     anything at all outstanding, and on a grid where most folders owe something
     that is a row of alarms with no ranking between them. Muted, it still reads
     instantly against the neutral body without shouting over the count. */
  warn: { tab: 'fill-warning/70', face: 'fill-folder-face' },
  fault: { tab: 'fill-destructive/70', face: 'fill-folder-face' },
};

function FolderShape({ tone }: { tone: FolderTone }) {
  const fill = FOLDER_FILL[tone];
  return (
    <svg viewBox="0 0 64 50" aria-hidden className="block w-full">
      <path
        d="M2 8a6 6 0 0 1 6-6h14.3a6 6 0 0 1 4.4 1.9l3 3.2A2 2 0 0 0 31.2 8H56a6 6 0 0 1 6 6v6H2Z"
        className={fill.tab}
      />
      <rect x="2" y="12" width="60" height="36" rx="6" className={fill.face} />
    </svg>
  );
}

/**
 * What is wrong inside this folder, without opening it.
 *
 * The whole cost of a tree is that a fault three levels down is invisible from
 * the top, so every folder reports its own subtree. Quiet when the folder is
 * clean — a green tick on every row is a row of ticks nobody reads, and the
 * point of the mark is that it is rare.
 */
function FolderState({ tally }: { tally: ComplianceTally }) {
  if (tally.required === 0) {
    return <span className="text-[11px] text-muted-foreground">empty</span>;
  }
  if (tally.attention === 0) {
    return (
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {tally.valid}/{tally.required}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-center gap-1">
      {tally.expired > 0 && (
        <Badge intent="destructive" size="sm">
          {tally.expired} expired
        </Badge>
      )}
      {tally.missing > 0 && (
        <Badge intent="destructive" variant="subtle" size="sm">
          {tally.missing} missing
        </Badge>
      )}
      {tally.expiring > 0 && (
        <Badge intent="warning" size="sm">
          {tally.expiring} expiring
        </Badge>
      )}
    </span>
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

export default DocumentsPage;
