import { useMemo, useState } from 'react';

import { Check, Download, Trash2, Upload } from '@/design-system/icons';
import type { EmployeeDocument } from '@/features/hr/api/hrService';
import { employeeDocumentFile, openDocumentBlob } from '@/features/hr/api/hrService';
import {
  useDeleteEmployeeDocument,
  useUploadEmployeeDocument,
} from '@/features/hr/api/queries';
import { ActionButton, Panel, Pill } from '@/pages/finance/components/kit';
import { useConfirm } from '@/design-system';
import { cn } from '@/utils';

import { DOCUMENT_CATEGORY_LABEL, expiryLabel, expiryTone, frDate } from '../hrFormat';
import { Field, FormError, ModalShell, inputClass } from './form';

/**
 * The employee's file.
 *
 * Laid out as the same document-type catalog the partner and vehicle screens
 * use — one row per category, ticked when it holds something — rather than a
 * dropzone, so what is *missing* from a file is as visible as what is in it.
 *
 * HR differs from those screens in two ways, and both change the row: a
 * category can hold several documents (warning letters, generated documents),
 * so a row lists what it holds and keeps its upload control; and a document
 * carries issue and expiry dates that drive the expiry dashboard, so the
 * upload goes through a small form instead of a bare file input.
 */

/** The categories an HR file is expected to hold, in the order it is assembled. */
const CATEGORIES = [
  { key: 'CV', expires: false },
  { key: 'ID_CARD', expires: true },
  { key: 'PASSPORT', expires: true },
  { key: 'CONTRACT', expires: false },
  { key: 'DIPLOMA', expires: false },
  { key: 'MEDICAL_CERT', expires: true },
  { key: 'DRIVING_LICENCE', expires: true },
  { key: 'CNSS_CARD', expires: false },
  { key: 'WARNING_LETTER', expires: false },
  { key: 'GENERATED_DOCUMENT', expires: false },
  { key: 'OTHER', expires: false },
] as const;

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.docx';

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function daysUntil(iso: string): number {
  const target = Date.parse(iso);
  return Math.ceil((target - Date.now()) / 86_400_000);
}

/** Streams the file through the API so the permission check and audit run. */
async function openDocument(documentId: string, name: string) {
  await openDocumentBlob(() => employeeDocumentFile(documentId), name);
}

export function DocumentVault({
  employeeId,
  documents,
  readOnly,
}: {
  employeeId: string;
  documents: EmployeeDocument[];
  readOnly?: boolean;
}) {
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const remove = useDeleteEmployeeDocument();

  const byCategory = useMemo(() => {
    const map = new Map<string, EmployeeDocument[]>();
    for (const document of documents) {
      const bucket = map.get(document.category);
      if (bucket) bucket.push(document);
      else map.set(document.category, [document]);
    }
    return map;
  }, [documents]);

  const held = CATEGORIES.filter((category) => byCategory.has(category.key)).length;

  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async (documentId: string, fileName: string) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: `"${fileName}" will be permanently removed from this employee's file.`,
    });
    if (ok) remove.mutate(documentId);
  };

  return (
    <>
      {confirmDialog}
      <Panel
        title="Documents"
        subtitle="Stored privately, every download audited"
        action={<Pill tone="neutral">{documents.length} on file</Pill>}
      >
        <div className="space-y-1.5">
          {CATEGORIES.map((category) => {
            const files = byCategory.get(category.key) ?? [];
            const filled = files.length > 0;
            return (
              <div
                key={category.key}
                className={cn(
                  'rounded-card-nested border px-3.5 py-2.5 transition-colors',
                  filled ? 'border-primary/25 bg-primary-subtle/40' : 'border-border bg-card',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      filled
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border-strong text-transparent',
                    )}
                  >
                    <Check className="size-3 stroke-[3]" />
                  </span>

                  <span className="min-w-0 flex-1 text-xs font-bold text-foreground">
                    {DOCUMENT_CATEGORY_LABEL[category.key] ?? category.key}
                  </span>

                  {!filled ? (
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Not on file
                    </span>
                  ) : null}

                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => setUploadFor(category.key)}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary-subtle px-2.5 py-1 text-[11px] font-bold text-primary-subtle-foreground transition-colors hover:bg-primary-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Upload className="size-3" />
                      Upload
                    </button>
                  )}
                </div>

                {filled ? (
                  <ul className="mt-2 space-y-1 border-t border-border-subtle pt-2">
                    {files.map((file) => (
                      <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                          {file.originalName}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                          {fileSize(file.sizeBytes)} · {frDate(file.uploadedAt)}
                        </span>
                        {file.expiryDate ? (
                          <Pill tone={expiryTone(daysUntil(file.expiryDate))}>
                            Expires {frDate(file.expiryDate)} ·{' '}
                            {expiryLabel(daysUntil(file.expiryDate))}
                          </Pill>
                        ) : null}
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title="Open document"
                            onClick={() => void openDocument(file.id, file.originalName)}
                            className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-primary-subtle-foreground"
                          >
                            <Download className="size-3.5" />
                            <span className="sr-only">Open {file.originalName}</span>
                          </button>
                          {readOnly ? null : (
                            <button
                              type="button"
                              title="Delete document"
                              onClick={() => void handleDelete(file.id, file.originalName)}
                              className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                              <span className="sr-only">Delete {file.originalName}</span>
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] font-semibold text-muted-foreground">
          {held} of {CATEGORIES.length} categories on file.
        </p>
      </Panel>

      <UploadModal
        employeeId={employeeId}
        category={uploadFor}
        expires={CATEGORIES.find((entry) => entry.key === uploadFor)?.expires ?? false}
        onClose={() => setUploadFor(null)}
      />
    </>
  );
}

function UploadModal({
  employeeId,
  category,
  expires,
  onClose,
}: {
  employeeId: string;
  category: string | null;
  expires: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const upload = useUploadEmployeeDocument();

  function close() {
    setFile(null);
    setIssueDate('');
    setExpiryDate('');
    setNotes('');
    setLocalError(null);
    upload.reset();
    onClose();
  }

  function submit() {
    if (!file || !category) return;
    upload.mutate(
      {
        employeeId,
        file,
        meta: {
          category,
          issueDate: issueDate || undefined,
          expiryDate: expiryDate || undefined,
          notes: notes.trim() || undefined,
        },
      },
      { onSuccess: close },
    );
  }

  return (
    <ModalShell
      open={category !== null}
      onClose={close}
      icon={Upload}
      title={`Upload — ${category ? (DOCUMENT_CATEGORY_LABEL[category] ?? category) : ''}`}
      subtitle="Stored privately."
      footer={
        <>
          <ActionButton onClick={close}>Cancel</ActionButton>
          <ActionButton
            variant="primary"
            disabled={!file || upload.isPending}
            onClick={submit}
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={localError ?? upload.error} />

        <Field label="Document" required hint="PDF, JPG, PNG or DOCX. 10 MB maximum.">
          <input
            type="file"
            accept={ACCEPTED}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1 file:text-xs file:font-bold file:text-foreground`}
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              // Caught here as well as server-side: a 10 MB upload that is
              // going to be refused should not be sent at all.
              if (picked && picked.size > MAX_BYTES) {
                setLocalError(`${picked.name} is ${fileSize(picked.size)} — the cap is 10 MB.`);
                setFile(null);
                return;
              }
              setLocalError(null);
              setFile(picked);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issue date">
            <input
              type="date"
              className={inputClass}
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </Field>
          <Field
            label="Expiry date"
            hint={expires ? 'This category drives the expiry dashboard.' : undefined}
          >
            <input
              type="date"
              className={inputClass}
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Note">
          <input
            className={inputClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

export default DocumentVault;
