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
      .catch(() => {
        if (!cancelled) setPreview({ state: 'unavailable', reason: 'The file could not be loaded.' });
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
        className="w-full space-y-5 overflow-y-auto border-l border-border bg-background p-6 sm:max-w-2xl"
      >
        <SheetTitle className="sr-only">Document Preview</SheetTitle>
        <SheetDescription className="sr-only">The stored file and its details</SheetDescription>

        {/* One close control, sized to be hit easily — the sheet's own small
            corner X is suppressed above rather than sitting beside this one. */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconChip icon={FileText} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-extrabold tracking-tight text-foreground">{doc.name}</h3>
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

          <CloseButton onClick={() => onOpenChange(false)} />
        </div>

        {doc.id && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void triggerDocumentDownload(doc.id, doc.name)}
              leadingIcon={<Download className="h-3.5 w-3.5" />}
              className="h-8 rounded-lg px-4 text-xs font-semibold"
            >
              Download
            </Button>
          </div>
        )}

        {/* The file */}
        <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-sunken">
          {preview.state === 'loading' && <Spinner />}

          {preview.state === 'unavailable' && (
            <div className="flex max-w-xs flex-col items-center gap-2 p-8 text-center">
              <IconChip icon={AlertTriangle} tint="amber" />
              <p className="text-sm font-semibold text-foreground">Preview unavailable</p>
              <p className="text-xs text-muted-foreground">{preview.reason}</p>
            </div>
          )}

          {isImage && (
            <img
              src={(preview as { url: string }).url}
              alt={doc.name}
              className="max-h-[70vh] w-full object-contain"
            />
          )}

          {isPdf && (
            <iframe
              src={(preview as { url: string }).url}
              title={doc.name}
              className="h-[70vh] w-full border-0"
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
