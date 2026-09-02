import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  CloseButton,
  IconChip,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Spinner,
} from '@/design-system';
import { FileText, Download, AlertTriangle } from '@/design-system/icons';
import { fetchDocumentObjectUrl } from '@/features/documents/api/documentsService';
import { ApiError } from '@/services/api.client';
import { triggerDocumentDownload } from './documentDownload';

/**
 * The stored file, shown.
 *
 * This used to render a "document preview" that was drawn entirely in markup:
 * a Certificate of Compliance naming an issuing authority, a fixed SHA256
 * hash, a "Digital Stamp Verified" badge and a page count — none of which came
 * from the file, and all of which appeared identically over every document in
 * the system. Opening a proof of delivery showed that certificate rather than
 * the signed sheet somebody had actually uploaded.
 *
 * It now fetches the real bytes and displays them: images inline, PDFs in a
 * frame. Anything the browser cannot render says so and offers the download,
 * which is honest about the one thing that matters here — whether the file you
 * are looking at is the file on record.
 */

export interface DocumentToView {
  id?: string;
  name: string;
  category?: string;
  uploadDate?: string;
  expiryDate?: string;
  fileSize?: string;
  status?: string;
  version?: number;
}

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentToView | null;
}

type Preview =
  | { state: 'loading' }
  | { state: 'ready'; url: string; mimeType: string }
  | { state: 'unavailable'; reason: string };

export function DocumentViewerModal({ open, onOpenChange, document: doc }: DocumentViewerModalProps) {
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });
  const documentId = doc?.id;

  useEffect(() => {
    if (!open || !documentId) {
      setPreview(
        open && !documentId
          ? { state: 'unavailable', reason: 'This record has no stored file to show.' }
          : { state: 'loading' },
      );
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setPreview({ state: 'loading' });

    fetchDocumentObjectUrl(documentId)
      .then(({ url, mimeType }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreview({ state: 'ready', url, mimeType });
      })
      .catch((error: unknown) => {
        /* Say WHAT went wrong. This used to swallow the error and print "The
           file could not be loaded." over every failure alike, so a 500 from
           the server, a file missing from storage and a dropped connection
           were indistinguishable from the panel — and the one that was
           actually happening (a filename Node refused to put in a header) went
           undiagnosed until somebody read the server log. `ApiError` carries
           the status and the server's own message; both belong on screen. */
        if (cancelled) return;
        const reason =
          error instanceof ApiError
            ? `${error.message} (HTTP ${error.status})`
            : error instanceof Error && error.message
              ? error.message
              : 'The file could not be loaded.';
        setPreview({ state: 'unavailable', reason });
      });

    /* The object URL holds the blob in memory until it is revoked. */
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, documentId]);

  if (!doc) return null;

  const isImage = preview.state === 'ready' && preview.mimeType.startsWith('image/');
  const isPdf = preview.state === 'ready' && preview.mimeType === 'application/pdf';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The panel provides its own, larger close control below.
        hideCloseButton
        /* A column, not a scroll: the header is fixed and the FILE gets every
           pixel underneath it. The old layout was `space-y-5` on a scrolling
           block with a 420px-minimum frame in the middle of it, so a
           photograph sat in a small box with a field of grey above and below
           it — the one thing the panel exists to show, given the least room in
           it. */
        className="flex w-full flex-col gap-0 border-l border-border bg-background p-0 sm:max-w-2xl"
      >
        <SheetTitle className="sr-only">Document Preview</SheetTitle>
        <SheetDescription className="sr-only">The stored file and its details</SheetDescription>

        {/* One close control, sized to be hit easily — the sheet's own small
            corner X is suppressed above rather than sitting beside this one. */}
        {/* Download rides in the header beside Close. It had a band of its own
            below, which spent a whole row of a panel on one button. */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <IconChip icon={FileText} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-extrabold tracking-tight text-foreground" title={doc.name}>
                  {doc.name}
                </h3>
                {doc.status && (
                  <Badge intent={doc.status === 'Verified' ? 'success' : 'warning'} size="sm">
                    {doc.status}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {[doc.category, doc.fileSize, doc.uploadDate && `Uploaded ${doc.uploadDate}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {doc.id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void triggerDocumentDownload(doc.id, doc.name)}
                leadingIcon={<Download className="h-3.5 w-3.5" />}
                className="h-8 rounded-lg px-3 text-xs font-semibold"
              >
                Download
              </Button>
            )}
            <CloseButton onClick={() => onOpenChange(false)} />
          </div>
        </div>

        {/* The file, given the rest of the panel. */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-sunken p-4">
          {preview.state === 'loading' && <Spinner />}

          {preview.state === 'unavailable' && (
            <div className="flex max-w-xs flex-col items-center gap-2 p-8 text-center">
              <IconChip icon={AlertTriangle} tint="amber" />
              <p className="text-sm font-semibold text-foreground">Preview unavailable</p>
              <p className="text-xs text-muted-foreground">{preview.reason}</p>
            </div>
          )}

          {isImage && (
            /* Sized to the image, capped by the panel. `w-full` forced a
               narrow scan up to the full width and turned a crisp 900px photo
               into a blurred one; this shows it at its own size until the panel
               is the smaller of the two. */
            <img
              src={(preview as { url: string }).url}
              alt={doc.name}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xs"
            />
          )}

          {isPdf && (
            <iframe
              src={(preview as { url: string }).url}
              title={doc.name}
              className="h-full min-h-[60vh] w-full rounded-md border-0 bg-card"
            />
          )}

          {preview.state === 'ready' && !isImage && !isPdf && (
            <div className="flex max-w-xs flex-col items-center gap-2 p-8 text-center">
              <IconChip icon={FileText} />
              <p className="text-sm font-semibold text-foreground">No in-browser preview</p>
              <p className="text-xs text-muted-foreground">
                {doc.name} can be downloaded and opened in its own application.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
