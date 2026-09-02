import { useState } from 'react';

import {
  Badge,
  Button,
  CloseButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/design-system';
import { Check, ChevronDown, Download, FileText, X } from '@/design-system/icons';
import { Avatar, Spinner } from '@/design-system';
import { useDocumentDownloads } from '../api/queries';
import { Input } from '@/design-system';
import { usePermissions } from '@/hooks';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils';

import type { DisplayDocument } from '../api/documentsService';
import { documentValidity, daysUntilExpiry } from '../catalog';
import { useDocumentPreview } from './useDocumentPreview';

/**
 * One document's own record — what it is, when it was filed, what happened to
 * it since.
 *
 * The folder answers "have we got it"; this answers everything else, and until
 * now nothing did. A grey card was a green row and a date: you could not see
 * who issued it, how big the scan was, when it was uploaded, whether anybody
 * had checked it, or why it had been rejected — all of which the record already
 * held and none of which had a screen.
 *
 * Two tabs for two different questions, the way a file browser does it.
 * **Details** is the document's properties. **Activity** is what has happened
 * to it, built only from timestamps that were actually recorded — a filed date,
 * a verification, a rejection. There is no invented "viewed by" history: the
 * backend counts downloads and nothing else, so that is what it says.
 */
export function DocumentDetailsSheet({
  document,
  ownerLabel,
  superseded = [],
  onClose,
  onDownload,
  onView,
  onVerify,
  verifying = false,
}: {
  document: DisplayDocument | null;
  /** Where it lives — "MS-1221-DJ", "Massida Logistics". */
  ownerLabel?: string;
  /** The copies this one replaced, newest first. */
  superseded?: DisplayDocument[];
  onClose: () => void;
  onDownload: (document: DisplayDocument) => void;
  /** Opens one of the earlier copies. */
  onView?: (document: DisplayDocument) => void;
  /** Approve or reject. Omit on a surface where review is not the job. */
  onVerify?: (status: 'Verified' | 'Rejected', rejectionReason?: string) => void;
  verifying?: boolean;
}) {
  const [tab, setTab] = useState<'details' | 'activity'>('details');

  return (
    <Sheet open={Boolean(document)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" hideCloseButton className="flex h-full flex-col p-0">
        <SheetTitle className="sr-only">{document?.name ?? 'Document'}</SheetTitle>
        <SheetDescription className="sr-only">
          File information and activity for this document.
        </SheetDescription>

        {document && (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 bg-card p-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold tracking-tight text-foreground">
                    {document.category}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={document.name}>
                    {document.name}
                  </p>
                </div>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            <div className="flex shrink-0 border-b border-border/70">
              {(['details', 'activity'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    'flex-1 border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition-colors',
                    tab === key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'details' ? (
                <Details
                  document={document}
                  ownerLabel={ownerLabel}
                  superseded={superseded}
                  onView={onView}
                  onDownload={onDownload}
                />
              ) : (
                <Activity document={document} />
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-border/70 p-3">
              {onVerify && document.status === 'Pending Review' && (
                <ReviewControls document={document} busy={verifying} onVerify={onVerify} />
              )}
              <Button
                type="button"
                className="w-full"
                size="sm"
                variant={onVerify && document.status === 'Pending Review' ? 'outline' : 'primary'}
                leadingIcon={<Download className="size-4" />}
                onClick={() => onDownload(document)}
              >
                Download
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The review step, which had no control until now.
 *
 * Every upload lands as `Pending Review` — the backend has always had
 * `PATCH /documents/:id/verify` and nothing in the app ever called it, so the
 * only "Verified" papers in the system were ones a seed script wrote that way
 * and anything an operator filed sat unreviewed forever.
 *
 * It lives here, at the foot of the file's own record, because reviewing is
 * looking: the panel above it is the scan, the dates and who filed it, which is
 * the whole of what a reviewer is deciding on.
 *
 * A rejection must say why. The backend refuses one without a reason, and
 * rightly — somebody has to re-file the paper, and "rejected" alone tells them
 * nothing about what to fix.
 */
function ReviewControls({
  document,
  busy,
  onVerify,
}: {
  document: DisplayDocument;
  busy: boolean;
  onVerify: (status: 'Verified' | 'Rejected', rejectionReason?: string) => void;
}) {
  const { can } = usePermissions();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  if (!can('documents.verify')) return null;

  if (rejecting) {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive-subtle/30 p-2.5">
        <Input
          autoFocus
          value={reason}
          placeholder="What is wrong with it?"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && reason.trim()) onVerify('Rejected', reason.trim());
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setReason('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={busy || !reason.trim()}
            onClick={() => onVerify('Rejected', reason.trim())}
          >
            {busy ? 'Saving…' : 'Reject'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy}
        leadingIcon={<X className="size-3.5" />}
        onClick={() => setRejecting(true)}
      >
        Reject
      </Button>
      <Button
        type="button"
        size="sm"
        className="flex-1"
        disabled={busy}
        leadingIcon={<Check className="size-3.5" />}
        onClick={() => onVerify('Verified')}
      >
        {busy ? 'Saving…' : `Approve ${document.category === '' ? '' : ''}`.trim() || 'Approve'}
      </Button>
    </div>
  );
}

function Details({
  document,
  ownerLabel,
  superseded = [],
  onView,
  onDownload,
}: {
  document: DisplayDocument;
  ownerLabel?: string;
  superseded?: DisplayDocument[];
  onView?: (document: DisplayDocument) => void;
  onDownload: (document: DisplayDocument) => void;
}) {
  const validity = documentValidity(document.expiryDate);
  const mime = document.mimeType ?? '';
  const previewable = mime.startsWith('image/');
  const { url } = useDocumentPreview(document.id, previewable);

  return (
    <div className="space-y-4">
      {/* The paper first. The panel is opened from a tile that was already
          showing it, so losing sight of it here would be a step backwards. */}
      {url && (
        <img
          src={url}
          alt={document.name}
          className="max-h-52 w-full rounded-lg border border-border/60 object-contain"
        />
      )}

      {/* The one line worth stating loudly: whether it still counts. */}
      <div
        className={cn(
          'rounded-lg border p-3',
          validity === 'expired'
            ? 'border-destructive/40 bg-destructive-subtle/40'
            : validity === 'expiring'
              ? 'border-warning/40 bg-warning-subtle/50'
              : 'border-success/30 bg-success-subtle/40',
        )}
      >
        <p className="text-xs font-bold text-foreground">
          {validity === 'expired'
            ? 'Expired'
            : validity === 'expiring'
              ? `Expires in ${daysUntilExpiry(document.expiryDate as string)} days`
              : validity === 'undated'
                ? 'No expiry recorded'
                : 'In force'}
        </p>
        {document.expiryDate && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Valid until {document.expiryDate}
          </p>
        )}
      </div>

      <dl className="space-y-0">
        <Fact label="Registered" value={document.issueDate} />
        <Fact label="Expires" value={document.expiryDate} />
        <Fact label="Issued by" value={document.issuer} />
        <Fact label="Type" value={describeType(mime, document.name)} />
        <Fact label="Size" value={document.fileSize} />
        <Fact label="Location" value={ownerLabel} />
        <Fact
          label="Filed"
          value={
            document.uploadedByName
              ? `${document.uploadDate} · ${document.uploadedByName}`
              : document.uploadDate
          }
        />
        <Fact
          label="Review"
          value={
            <Badge
              intent={
                document.status === 'Verified'
                  ? 'success'
                  : document.status === 'Rejected'
                    ? 'destructive'
                    : 'warning'
              }
              variant="subtle"
              size="sm"
            >
              {document.status}
            </Badge>
          }
        />
        <Fact label="Version" value={document.version ? `v${document.version}` : undefined} />
      </dl>

      {document.rejectionReason && (
        <p className="rounded-lg border border-destructive/30 bg-destructive-subtle/40 p-3 text-[11px] text-destructive-subtle-foreground">
          {document.rejectionReason}
        </p>
      )}

      {/* ── WHAT THIS ONE REPLACED ──
       *
       * A renewed certificate is filed beside the one it replaces, never over
       * it: the old policy is the evidence for the period it covered, and a
       * compliance file that overwrites its own history cannot answer "were we
       * insured last March". The folder shows the copy in force; the ones
       * behind it live here, openable, with the period each ran to. */}
      {superseded.length > 0 && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Earlier copies
          </p>
          {superseded.map((old) => (
            <div
              key={old.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-foreground" title={old.name}>
                  {old.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {old.expiryDate ? `Ran to ${old.expiryDate}` : `Filed ${old.uploadDate}`}
                </span>
              </span>
              {onView && (
                <button
                  type="button"
                  onClick={() => onView(old)}
                  title="Open this copy"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
                >
                  <FileText className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDownload(old)}
                title="Download this copy"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
              >
                <Download className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What has happened to this document, and who did it.
 *
 * Built only from stamps the record carries — filed, checked, rejected — with
 * the person's name on each. A file browser's activity feed is usually a lie of
 * omission in the other direction, inventing "opened by" and "shared with"
 * entries nothing recorded; this shows three events at most and no more than
 * the backend actually knows.
 *
 * The names come resolved from the server (`withPeople`), not looked up here: a
 * panel that fetched the whole staff directory to print two names would make
 * opening one document a request for every account in the company.
 *
 * An account that has since been deleted leaves its stamp without a name. That
 * reads as "Filed · 09 Sep 2025" rather than as a uuid, because a name nobody
 * can read is worse than none — it looks like data.
 */
function Activity({ document }: { document: DisplayDocument }) {
  const events: { key: string; label: string; who?: string; at?: string; tone: 'neutral' | 'good' | 'bad' }[] = [
    {
      key: 'filed',
      label: 'Filed',
      who: document.uploadedByName,
      at: document.uploadedAt,
      tone: 'neutral',
    },
  ];

  if (document.status === 'Verified') {
    events.push({
      key: 'verified',
      label: 'Verified',
      who: document.verifiedByName,
      at: document.verifiedAt,
      tone: 'good',
    });
  }
  if (document.status === 'Rejected') {
    events.push({
      key: 'rejected',
      label: 'Rejected',
      who: document.verifiedByName,
      at: document.verifiedAt,
      tone: 'bad',
    });
  }

  return (
    <>
      <ol className="space-y-0">
        {events.map((event, index) => (
          <li key={event.key} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  'mt-1 size-2.5 shrink-0 rounded-full',
                  event.tone === 'good'
                    ? 'bg-success'
                    : event.tone === 'bad'
                      ? 'bg-destructive'
                      : 'bg-primary',
                )}
              />
              {index < events.length - 1 && <span className="w-px flex-1 bg-border" />}
            </span>
            <span className="min-w-0 pb-5">
              <span className="block text-xs font-bold text-foreground">
                {event.label}
                {event.who ? <span className="font-medium text-muted-foreground"> by {event.who}</span> : null}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {event.at ? formatDate(event.at, 'dateTime') : document.uploadDate}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {document.downloadCount !== undefined && document.downloadCount > 0 && (
        <DownloadLog documentId={document.id} counted={document.downloadCount} />
      )}

      {document.rejectionReason && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive-subtle/40 p-3 text-[11px] text-destructive-subtle-foreground">
          {document.rejectionReason}
        </p>
      )}
    </>
  );
}

/**
 * Who has taken a copy — folded away until somebody asks.
 *
 * "Downloaded 7 times" was the whole of it, which for a haulier's trading
 * licence or a driver's ID is the least interesting version of the question:
 * the useful one is *who*. The log behind this is new
 * (`DocumentDownload`), so on an older document the count is larger than the
 * number of named entries — those downloads happened when nothing recorded who
 * made them, and the line says so rather than quietly showing a short list
 * under a big number.
 *
 * Closed by default and fetched on open: an access log per file, loaded for
 * every document in a folder, is a request each to answer a question nobody
 * asked.
 */
function DownloadLog({ documentId, counted }: { documentId: string; counted: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useDocumentDownloads(documentId, open);

  const unlogged = data ? Math.max(0, counted - data.total) : 0;

  return (
    <div className="mt-1 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span>
          Downloaded {counted} time{counted === 1 ? '' : 's'}
        </span>
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {isLoading && (
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Spinner className="size-3" /> Loading…
            </span>
          )}

          {data?.items.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <Avatar
                src={entry.avatarUrl ?? undefined}
                name={entry.name ?? 'Unknown'}
                size="xs"
                shape="circle"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {entry.name ?? 'A deleted account'}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatDate(entry.at, 'dateTime')}
              </span>
            </div>
          ))}

          {data && data.items.length === 0 && unlogged === 0 && (
            <p className="text-[11px] text-muted-foreground">Nobody has opened it yet.</p>
          )}

          {unlogged > 0 && (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {unlogged} earlier download{unlogged === 1 ? '' : 's'} {unlogged === 1 ? 'was' : 'were'}{' '}
              counted before Fleetin recorded who made them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** "PDF", "JPEG image" — the mime type in words, falling back to the extension. */
function describeType(mime: string, name: string): string | undefined {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return `${mime.slice(6).toUpperCase()} image`;
  const ext = name.includes('.') ? name.split('.').pop() : undefined;
  return ext ? ext.toUpperCase() : undefined;
}
