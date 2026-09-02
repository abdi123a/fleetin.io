import { useState } from 'react';

import { Badge, Button } from '@/design-system';
import { Check, Download, Eye, Trash2, Upload } from '@/design-system/icons';
import { cn } from '@/utils';

import { documentCatalogFor, documentValidity, daysUntilExpiry, type DocumentTypeSpec } from '../catalog';
import type { DisplayDocument, DocumentOwnerType } from '../api/documentsService';
import { DocumentCaptureDialog, type DocumentCapture } from './DocumentCaptureDialog';

/**
 * The papers this record owes, and which of them it has.
 *
 * One row per catalog entry, always — an empty row is the point of the list.
 * Four near-identical copies of this used to live in the transporter wizard,
 * the shipper wizard, the vehicle sheet and the driver sheet, each drifting
 * from the others; this is the one, and the catalog it renders is closed
 * (`documentCatalogFor`), so a page cannot quietly ask for a fifth document.
 *
 * A filed row says the two things a filed paper is: whose name is on it and
 * when it stops counting. The expiry is the reason the whole feature exists,
 * so it is the loudest thing on the row once it is close — a business licence
 * with three weeks left reads as a warning, an expired one as a fault, and one
 * with a year on it says nothing at all.
 *
 * ## Off-catalog papers
 *
 * A record can hold documents the catalog no longer lists — an "Access Card"
 * filed before the list was closed. Those are listed after the required rows
 * rather than hidden: they were somebody's evidence of something, and a list
 * that silently drops them is a list that lies about what is on file.
 */
export function DocumentChecklist({
  ownerType,
  documents,
  subject,
  busy = false,
  error,
  onUpload,
  onRemove,
  onView,
  onDownload,
  readOnly = false,
}: {
  ownerType: DocumentOwnerType;
  documents: DisplayDocument[];
  /** What these papers belong to — shown in the capture dialog. */
  subject?: string;
  busy?: boolean;
  error?: string | null;
  onUpload: (spec: DocumentTypeSpec, capture: DocumentCapture) => void;
  onRemove?: (documentId: string) => void;
  onView?: (document: DisplayDocument) => void;
  onDownload?: (document: DisplayDocument) => void;
  /** A portal account reading somebody else's dossier. */
  readOnly?: boolean;
}) {
  const [capturing, setCapturing] = useState<DocumentTypeSpec | null>(null);

  const catalog = documentCatalogFor(ownerType);
  const extras = documents.filter((doc) => !catalog.some((spec) => spec.label === doc.category));

  return (
    <div className="space-y-1.5">
      {catalog.map((spec) => {
        const existing = documents.find((doc) => doc.category === spec.label);
        return (
          <DocumentRow
            key={spec.label}
            label={spec.label}
            required={spec.required}
            document={existing}
            readOnly={readOnly}
            onUpload={() => setCapturing(spec)}
            onRemove={onRemove}
            onView={onView}
            onDownload={onDownload}
          />
        );
      })}

      {extras.map((doc) => (
        <DocumentRow
          key={doc.id}
          label={doc.category}
          required={false}
          document={doc}
          readOnly={readOnly}
          onRemove={onRemove}
          onView={onView}
          onDownload={onDownload}
        />
      ))}

      <DocumentCaptureDialog
        open={Boolean(capturing)}
        spec={capturing}
        subject={subject}
        busy={busy}
        error={error}
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

function DocumentRow({
  label,
  required,
  document,
  readOnly,
  onUpload,
  onRemove,
  onView,
  onDownload,
}: {
  label: string;
  required: boolean;
  document?: DisplayDocument;
  readOnly: boolean;
  onUpload?: () => void;
  onRemove?: (documentId: string) => void;
  onView?: (document: DisplayDocument) => void;
  onDownload?: (document: DisplayDocument) => void;
}) {
  const validity = documentValidity(document?.expiryDate);
  const lapsed = validity === 'expired';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
        !document
          ? 'border-border/70 bg-card hover:border-primary/40'
          : lapsed
            ? 'border-destructive/40 bg-destructive-subtle/30'
            : 'border-success/30 bg-success-subtle/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          !document
            ? 'border-border-strong text-transparent'
            : lapsed
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border-success bg-success text-success-foreground',
        )}
      >
        <Check className="h-3 w-3 stroke-[3]" />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate text-xs font-bold text-foreground">{label}</span>
        {document ? (
          <>
            {/* The dates, not the filename. Which scan it is matters once, at
                upload; how long it is good for matters every time after. */}
            <span className="truncate text-2xs text-muted-foreground">
              {document.issuer ? `${document.issuer} · ` : ''}
              {document.issueDate ? `${document.issueDate} → ` : ''}
              {document.expiryDate ?? 'no expiry recorded'}
            </span>
            <ExpiryBadge expiryDate={document.expiryDate} />
          </>
        ) : (
          <Badge intent={required ? 'warning' : 'default'} size="sm">
            {required ? 'Required' : 'Optional'}
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {document ? (
          <>
            {onView && (
              <button
                type="button"
                onClick={() => onView(document)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
                title="View document"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(document)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
                title="Download document"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && !readOnly && (
              <button
                type="button"
                onClick={() => onRemove(document.id)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                title="Remove document"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          !readOnly &&
          onUpload && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              leadingIcon={<Upload className="h-3 w-3" />}
              onClick={onUpload}
            >
              Upload
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * How long this paper has left, in the only three states worth a mark.
 *
 * Silent while it is comfortably valid: a badge on every row in a compliant
 * dossier is a badge nobody reads, and the row already carries the date.
 */
function ExpiryBadge({ expiryDate }: { expiryDate?: string }) {
  const validity = documentValidity(expiryDate);
  if (validity === 'valid') return null;
  if (validity === 'undated') {
    return (
      <Badge intent="warning" size="sm">
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
      {days <= 1 ? 'Expires tomorrow' : `${days} days left`}
    </Badge>
  );
}
