import { useMemo, useState } from 'react';

import { Badge, Button, IconChip } from '@/design-system';
import {
  Check,
  Download,
  Eye,
  FileText,
  Info,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Upload,
} from '@/design-system/icons';
import { cn } from '@/utils';

import {
  documentCatalogFor,
  documentValidity,
  daysUntilExpiry,
  newestFirst,
  type DocumentTypeSpec,
} from '../catalog';
import type { DisplayDocument, DocumentOwnerType } from '../api/documentsService';
import { DocumentCaptureDialog, type DocumentCapture } from './DocumentCaptureDialog';
import { useDocumentPreview } from './useDocumentPreview';

/**
 * The papers inside a folder — as pages you can see, not filenames you have to
 * take on trust.
 *
 * The first cut of this was `DocumentChecklist`: two green rows reading "Grey
 * Card 2027-08-27". Correct, and it told you nothing about the file. The whole
 * reason somebody opens a truck's folder is to LOOK at the certificate — to
 * check the plate on it matches, that the scan is legible, that it is the right
 * document at all — and a row of text cannot be looked at. So the grid draws
 * the file: photographs as themselves, PDFs as their first page.
 *
 * The checklist is still the right control where documents are a *step* — the
 * onboarding wizard, the vehicle sheet's edit mode — because there the question
 * is "what is still owed". Here the question is "what have we got", and those
 * want different answers.
 *
 * ## Two views, because there are two questions
 *
 * Grid answers "is this the right document" — it is a contact sheet. List
 * answers "when does this lapse and how big is it" — dates and sizes line up in
 * columns and can be compared down the page. Google Drive ships both for the
 * same reason; the choice is remembered for the session, not persisted, since
 * it tracks what you are doing rather than who you are.
 *
 * ## A missing paper is a tile too
 *
 * A required document that was never filed gets a dashed slot in the same grid,
 * in the position it would occupy. A folder that shows only what exists cannot
 * show you what does not, and "what does not" is half of compliance.
 */
export type DocumentView = 'grid' | 'list';

export function DocumentBrowser({
  ownerType,
  documents,
  subject,
  busy = false,
  error,
  view,
  onViewChange,
  onUpload,
  onView,
  onInspect,
  onDownload,
  onRemove,
  readOnly = false,
}: {
  ownerType: DocumentOwnerType;
  documents: DisplayDocument[];
  subject?: string;
  busy?: boolean;
  error?: string | null;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  onUpload: (spec: DocumentTypeSpec, capture: DocumentCapture) => void;
  /**
   * Opens the FILE — the scan itself, full size.
   *
   * The tile and the eye both do this, because that is what somebody clicking a
   * picture of a document expects to happen. The panel of dates and sizes is a
   * different question and has its own control.
   */
  onView: (document: DisplayDocument) => void;
  /** Opens the record ABOUT the file — who filed it, when, how big. */
  onInspect: (document: DisplayDocument) => void;
  onDownload: (document: DisplayDocument) => void;
  /**
   * `inCatalog` decides what deleting means, and the caller has to say so in
   * the confirmation: a required paper leaves its empty slot behind and can be
   * re-filed, while an extra takes its whole row with it. Two different
   * outcomes from one bin icon is exactly the surprise worth spelling out.
   */
  onRemove: (document: DisplayDocument, inCatalog: boolean) => void;
  readOnly?: boolean;
}) {
  const [capturing, setCapturing] = useState<DocumentTypeSpec | null>(null);

  const catalog = documentCatalogFor(ownerType);

  /**
   * Every slot the folder should hold, filled or not, catalogue order first —
   * then anything on file that the catalogue does not ask for.
   *
   * Extras are real documents somebody filed before the list was closed (a
   * transporter's old grey card, a driver's access card). They are listed
   * rather than hidden — a folder that silently drops files it holds is lying
   * about what is in it — but marked, because they are not part of what this
   * record owes and deleting one is final in a way that deleting a required
   * paper is not.
   */
  const slots = useMemo(() => {
    const known = catalog.map((spec) => {
      /* Every copy of this paper, in force first. A renewal is filed BESIDE the
         certificate it replaces — the old one is still the evidence for the
         period it covered — so a slot holds a stack, not a file. The tile shows
         the one in force and says how many are behind it. */
      const copies = documents.filter((doc) => doc.category === spec.label).sort(newestFirst);
      return { spec, document: copies[0], superseded: copies.slice(1), extra: false };
    });
    const extras = documents
      .filter((doc) => !catalog.some((spec) => spec.label === doc.category))
      .map((doc) => ({ spec: undefined, document: doc, superseded: [] as DisplayDocument[], extra: true }));
    return [...known, ...extras];
  }, [catalog, documents]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {documents.length} file{documents.length === 1 ? '' : 's'}
        </span>
        <ViewToggle view={view} onChange={onViewChange} />
      </div>

      {view === 'grid' ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))]">
          {slots.map(({ spec, document, superseded, extra }) =>
            document ? (
              <DocumentCard
                key={document.id}
                document={document}
                superseded={superseded.length}
                extra={extra}
                onView={() => onView(document)}
                onInspect={() => onInspect(document)}
                onDownload={() => onDownload(document)}
                onRemove={readOnly ? undefined : () => onRemove(document, !extra)}
              />
            ) : (
              <EmptySlot
                key={spec!.label}
                spec={spec!}
                readOnly={readOnly}
                onUpload={() => setCapturing(spec!)}
              />
            ),
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/80">
          <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/70 bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,2fr)_7rem_7rem_5rem_auto]">
            <span>Name</span>
            <span className="hidden sm:block">Registered</span>
            <span className="hidden sm:block">Expires</span>
            <span className="hidden sm:block">Size</span>
            <span className="text-right">State</span>
          </div>
          {slots.map(({ spec, document, superseded, extra }) =>
            document ? (
              <DocumentRow
                key={document.id}
                document={document}
                superseded={superseded.length}
                extra={extra}
                onView={() => onView(document)}
                onInspect={() => onInspect(document)}
                onDownload={() => onDownload(document)}
                onRemove={readOnly ? undefined : () => onRemove(document, !extra)}
              />
            ) : (
              <EmptyRow
                key={spec!.label}
                spec={spec!}
                readOnly={readOnly}
                onUpload={() => setCapturing(spec!)}
              />
            ),
          )}
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}

      <DocumentCaptureDialog
        open={Boolean(capturing)}
        spec={capturing}
        subject={subject}
        busy={busy}
        onCancel={() => setCapturing(null)}
        onSubmit={(capture) => {
          if (!capturing) return;
          onUpload(capturing, capture);
          setCapturing(null);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The view switch
 * ------------------------------------------------------------------------- */

function ViewToggle({ view, onChange }: { view: DocumentView; onChange: (view: DocumentView) => void }) {
  return (
    <div
      role="group"
      aria-label="View"
      className="inline-flex items-center overflow-hidden rounded-full border border-border-strong"
    >
      {(
        [
          { key: 'list' as const, icon: ListIcon, label: 'List view' },
          { key: 'grid' as const, icon: LayoutGrid, label: 'Grid view' },
        ]
      ).map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={view === key}
          onClick={() => onChange(key)}
          className={cn(
            'flex size-8 items-center justify-center transition-colors',
            view === key
              ? 'bg-primary-subtle text-primary-subtle-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Grid
 * ------------------------------------------------------------------------- */

function DocumentCard({
  document,
  superseded = 0,
  extra = false,
  onView,
  onInspect,
  onDownload,
  onRemove,
}: {
  document: DisplayDocument;
  /** How many earlier copies this one replaced. */
  superseded?: number;
  extra?: boolean;
  onView: () => void;
  onInspect: () => void;
  onDownload: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs transition-colors hover:border-primary/50">
      <button
        type="button"
        onClick={onView}
        title={`Open ${document.name}`}
        className="block aspect-[4/3] w-full overflow-hidden border-b border-border/60 bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <DocumentPreview document={document} />
      </button>

      <div className="flex items-center gap-2 px-2.5 py-2">
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-bold text-foreground" title={document.name}>
            {document.category}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">{document.name}</span>
        </span>
        {extra ? <ExtraChip /> : <ExpiryChip expiryDate={document.expiryDate} />}
      </div>

      {superseded > 0 && (
        <button
          type="button"
          onClick={onInspect}
          className="border-t border-border/50 px-2.5 py-1 text-left text-[10px] font-medium text-primary hover:underline"
        >
          {superseded === 1 ? 'Replaced 1 earlier copy' : `Replaced ${superseded} earlier copies`}
        </button>
      )}

      <div className="flex items-center justify-end gap-0.5 border-t border-border/50 px-1.5 py-1">
        <IconAction icon={Eye} label="Open the file" onClick={onView} />
        <IconAction icon={Info} label="File information" onClick={onInspect} />
        <IconAction icon={Download} label="Download" onClick={onDownload} />
        {onRemove && <IconAction icon={Trash2} label="Delete" onClick={onRemove} danger />}
      </div>
    </div>
  );
}

/**
 * The file, drawn.
 *
 * Images go in an `<img>`; PDFs go in an `<object>`, which renders the first
 * page and is the only way to see a scan without downloading it by hand. Both
 * come from the same authenticated blob fetch — the download endpoint needs a
 * token, so a plain `src` would 401.
 *
 * Anything else (or a fetch that failed) falls back to a paper tile rather than
 * to a broken image: a folder that cannot draw one file should still list it.
 */
function DocumentPreview({ document }: { document: DisplayDocument }) {
  const mime = document.mimeType ?? '';
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const { url, failed } = useDocumentPreview(document.id, isImage || isPdf);

  if (url && isImage) {
    return <img src={url} alt={document.name} className="size-full object-cover" />;
  }
  if (url && isPdf) {
    return (
      <object
        data={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        type="application/pdf"
        aria-label={document.name}
        /* Not interactive inside a tile — the card's own click opens the
           details, and a scrollable PDF here would swallow it. */
        className="pointer-events-none size-full"
      >
        <PaperTile />
      </object>
    );
  }
  if (failed || (!isImage && !isPdf)) return <PaperTile />;
  return <div className="size-full animate-pulse bg-muted motion-reduce:animate-none" />;
}

function PaperTile() {
  return (
    <div className="flex size-full items-center justify-center bg-muted/40">
      <FileText className="size-8 text-muted-foreground/60" />
    </div>
  );
}

function EmptySlot({
  spec,
  readOnly,
  onUpload,
}: {
  spec: DocumentTypeSpec;
  readOnly: boolean;
  onUpload: () => void;
}) {
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onUpload}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive-subtle/30 p-4 text-center transition-colors hover:bg-destructive-subtle/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <IconChip icon={Upload} size={36} />
      <span>
        <span className="block text-xs font-bold text-foreground">{spec.label}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {readOnly ? 'Not on file' : 'Never filed — attach it'}
        </span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * List
 * ------------------------------------------------------------------------- */

const ROW = 'grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,2fr)_7rem_7rem_5rem_auto]';

function DocumentRow({
  document,
  superseded = 0,
  extra = false,
  onView,
  onInspect,
  onDownload,
  onRemove,
}: {
  document: DisplayDocument;
  superseded?: number;
  extra?: boolean;
  onView: () => void;
  onInspect: () => void;
  onDownload: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={cn(ROW, 'border-b border-border/50 last:border-b-0 hover:bg-muted/30')}>
      <button
        type="button"
        onClick={onView}
        title={`Open ${document.name}`}
        className="flex min-w-0 items-center gap-2.5 text-left"
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            extra ? 'bg-muted text-muted-foreground' : 'bg-success-subtle text-success',
          )}
        >
          {extra ? <FileText className="size-3.5" /> : <Check className="size-3.5 stroke-[3]" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-foreground">{document.category}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {document.name}
            {superseded > 0 && (
              <span className="text-primary"> · replaced {superseded}</span>
            )}
          </span>
        </span>
      </button>

      <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
        {document.issueDate ?? '—'}
      </span>
      <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
        {document.expiryDate ?? '—'}
      </span>
      <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
        {document.fileSize}
      </span>

      <span className="flex items-center justify-end gap-0.5">
        {extra ? <ExtraChip /> : <ExpiryChip expiryDate={document.expiryDate} />}
        <IconAction icon={Info} label="File information" onClick={onInspect} />
        <IconAction icon={Download} label="Download" onClick={onDownload} />
        {onRemove && <IconAction icon={Trash2} label="Delete" onClick={onRemove} danger />}
      </span>
    </div>
  );
}

function EmptyRow({
  spec,
  readOnly,
  onUpload,
}: {
  spec: DocumentTypeSpec;
  readOnly: boolean;
  onUpload: () => void;
}) {
  return (
    <div className={cn(ROW, 'border-b border-border/50 bg-destructive-subtle/20 last:border-b-0')}>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-destructive/50 text-destructive" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-foreground">{spec.label}</span>
          <span className="block truncate text-[10px] text-muted-foreground">Never filed</span>
        </span>
      </span>
      <span className="hidden sm:block" />
      <span className="hidden sm:block" />
      <span className="hidden sm:block" />
      <span className="flex justify-end">
        {!readOnly && (
          <Button type="button" size="sm" variant="outline" leadingIcon={<Upload className="size-3" />} onClick={onUpload}>
            Attach
          </Button>
        )}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

function IconAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-md p-1.5 text-muted-foreground transition-colors',
        danger ? 'hover:text-destructive' : 'hover:text-primary',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/**
 * A paper on file that the catalogue does not ask for.
 *
 * Filed before the list was closed, and kept: it was somebody's evidence of
 * something. Marked because it is not part of what this record owes — it is not
 * counted in the tally, and deleting it removes the row rather than emptying a
 * slot.
 */
function ExtraChip() {
  return (
    <Badge intent="default" variant="outline" size="sm">
      Extra
    </Badge>
  );
}

/** Quiet while the paper is comfortably valid — the date is already on the row. */
export function ExpiryChip({ expiryDate }: { expiryDate?: string }) {
  const validity = documentValidity(expiryDate);
  if (validity === 'valid') return null;
  if (validity === 'undated') {
    return (
      <Badge intent="warning" variant="subtle" size="sm">
        No expiry
      </Badge>
    );
  }
  if (validity === 'expired') {
    return (
      <Badge intent="destructive" size="sm">
        Expired
      </Badge>
    );
  }
  const days = daysUntilExpiry(expiryDate as string);
  return (
    <Badge intent="warning" size="sm">
      {days <= 1 ? '1 day' : `${days} days`}
    </Badge>
  );
}
