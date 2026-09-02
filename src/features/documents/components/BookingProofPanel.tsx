import { useState } from 'react';

import { Badge, useConfirm } from '@/design-system';
import { Download, FileText, Plus, Trash2 } from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { cn } from '@/utils';

import { toDisplayDocument, type DisplayDocument } from '../api/documentsService';
import { useDeleteDocument, useDocuments, useUploadDocuments } from '../api/queries';
import {
  PROOF_OF_DELIVERY_REQUIREMENT,
  PROOF_OF_RETURN_REQUIREMENT,
  type ProofRequirement,
} from '../proofRequirement';
import { useDocumentPreview } from './useDocumentPreview';

/**
 * The evidence behind a booking, where the booking is read.
 *
 * The proofs are captured in the dialog that records the moment — the only
 * point at which somebody is holding the paper — but they have to be
 * *findable* afterwards, or capturing them was a filing exercise with no
 * reader. This is the reader.
 *
 * ## It shows the pictures, not the filenames
 *
 * A proof of delivery is a photograph. The first cut of this listed rows of
 * `Screenshot 2026-08-31 at 1.42.57 PM.png` — three lines of a name a camera
 * invented, differing in the seconds field, above a file whose contents were
 * the entire point. Nobody recognises a delivery note by its filename; they
 * recognise it on sight. So the tiles are the images themselves, and the name
 * moves to the tooltip where a name belongs.
 *
 * PDFs cannot be drawn without downloading and rendering them, which is a real
 * cost on a yard connection, so they get a paper tile and their name in full.
 *
 * ## More pages can be added
 *
 * A driver comes back with the gate pass an hour after the note was scanned,
 * and the alternative to adding it here is reversing the status to get the
 * capture dialog back — rewriting a timestamp in order to file a photograph.
 *
 * Nothing is shown for a proof the job has not reached yet: an empty "Proof of
 * return" panel on a container still being unstuffed is a question nobody has
 * been asked.
 */
export function BookingProofPanel({
  bookingId,
  hasContainer,
  status,
  readOnly = false,
}: {
  bookingId: string;
  /** A bulk load has no box, so it has no return to prove. */
  hasContainer: boolean;
  /** The booking's raw rung — decides which proofs are due yet. */
  status: string;
  readOnly?: boolean;
}) {
  const { data: raw = [] } = useDocuments('BOOKING', bookingId);
  const upload = useUploadDocuments('BOOKING', bookingId);
  const remove = useDeleteDocument('BOOKING', bookingId);
  const { confirm, confirmDialog } = useConfirm();

  const [viewing, setViewing] = useState<DocumentToView | null>(null);
  const [error, setError] = useState('');

  const documents = raw.map(toDisplayDocument);
  const filesFor = (proof: ProofRequirement) =>
    documents.filter((document) => document.category === proof.category);

  /* Due once the rung it evidences has been walked. A proof already on file is
     always shown, whatever the status says — a document that exists is never
     hidden. */
  const panels: ProofRequirement[] = [];
  if (DELIVERED_OR_LATER.includes(status) || filesFor(PROOF_OF_DELIVERY_REQUIREMENT).length > 0) {
    panels.push(PROOF_OF_DELIVERY_REQUIREMENT);
  }
  if ((hasContainer && status === 'Completed') || filesFor(PROOF_OF_RETURN_REQUIREMENT).length > 0) {
    panels.push(PROOF_OF_RETURN_REQUIREMENT);
  }

  if (panels.length === 0) return null;

  const add = (proof: ProofRequirement, files: File[]) => {
    setError('');
    upload.mutate(
      { category: proof.category, files },
      {
        onError: (caught) =>
          setError(caught instanceof Error ? caught.message : 'The file could not be filed.'),
      },
    );
  };

  const drop = async (document: DisplayDocument) => {
    const ok = await confirm({
      title: 'Remove this page?',
      description: `"${document.name}" is part of this booking's evidence. A closed booking keeps its proof either way.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    remove.mutate(document.id, {
      onError: (caught) =>
        setError(caught instanceof Error ? caught.message : 'The file could not be removed.'),
    });
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proof</h3>

      {panels.map((proof) => {
        const files = filesFor(proof);
        return (
          <div key={proof.category} className="rounded-lg border border-border/80 bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">{proof.title}</span>
              {files.length === 0 ? (
                <Badge intent="destructive" variant="subtle" size="sm">
                  Not on file
                </Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {files.length} page{files.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* A contact sheet. `auto-fill` rather than a fixed column count:
                the sheet is one width on a laptop and another in a narrow
                window, and a proof with one page should not leave two empty
                cells behind it. */}
            <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(92px,1fr))]">
              {files.map((document) => (
                <ProofTile
                  key={document.id}
                  document={document}
                  readOnly={readOnly}
                  onOpen={() => setViewing(document)}
                  onRemove={() => void drop(document)}
                />
              ))}

              {!readOnly && (
                <label
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-primary/40 bg-primary/5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10',
                    upload.isPending && 'pointer-events-none opacity-60',
                  )}
                  title={files.length === 0 ? 'Attach the paperwork' : 'Add another page'}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
                    className="hidden"
                    onChange={(event) => {
                      const chosen = Array.from(event.target.files ?? []);
                      if (chosen.length > 0) add(proof, chosen);
                      event.target.value = '';
                    }}
                  />
                  <Plus className="h-4 w-4" />
                  {upload.isPending ? 'Filing…' : files.length === 0 ? 'Attach' : 'Add'}
                </label>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}

      <DocumentViewerModal
        open={Boolean(viewing)}
        onOpenChange={(open) => !open && setViewing(null)}
        document={viewing}
      />
      {confirmDialog}
    </div>
  );
}

/**
 * One page of a proof.
 *
 * The image fills the tile (`object-cover`) rather than being letterboxed
 * inside it: a delivery note photographed in portrait and a gate pass in
 * landscape have to line up as a grid, and the recognisable half of either is
 * the middle. The full page is one click away.
 *
 * The controls sit on the tile and appear on hover, so five pages read as five
 * pictures rather than as five pictures wearing six buttons. They stay
 * reachable by keyboard — `focus-within` opens the same overlay.
 */
function ProofTile({
  document,
  readOnly,
  onOpen,
  onRemove,
}: {
  document: DisplayDocument;
  readOnly: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  /* Only images are worth fetching to draw. A PDF would have to be downloaded
     in full and rendered to produce a 92px square. */
  const isPdf = document.name.toLowerCase().endsWith('.pdf');
  const { url, failed } = useDocumentPreview(document.id, !isPdf);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-surface-sunken">
      <button
        type="button"
        onClick={onOpen}
        title={`${document.name} · ${document.fileSize}`}
        className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        {url && !failed ? (
          <img src={url} alt={document.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="line-clamp-2 break-all text-[9px] leading-tight text-muted-foreground">
              {document.name}
            </span>
          </span>
        )}
      </button>

      {/* The date, always readable, over a scrim rather than in a caption row —
          a caption under every tile doubles the height of the sheet to repeat
          the same day three times. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay/80 to-transparent px-1.5 pb-1 pt-3 text-[9px] font-semibold text-white">
        {document.uploadDate}
      </span>

      <span className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => void triggerDocumentDownload(document.id, document.name)}
          title="Download"
          className="rounded-full bg-card/90 p-1 text-muted-foreground shadow-2xs transition-colors hover:text-primary"
        >
          <Download className="h-3 w-3" />
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            className="rounded-full bg-card/90 p-1 text-muted-foreground shadow-2xs transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The rungs at or past the drop.
 *
 * Mirrors `DELIVERED_STATUSES` on the backend, which decides the same thing for
 * the empty-return pool — a booking is "delivered" from `Arrived` onwards, and
 * from `Arrived` onwards it owes a delivery note.
 */
const DELIVERED_OR_LATER = [
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Empty Ready',
  'Empty Picked Up',
  'Completed',
];
