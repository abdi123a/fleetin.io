import { useCallback, useMemo, useState } from 'react';

import type { DocumentCapture } from './components/DocumentCaptureDialog';
import type { DocumentTypeSpec } from './catalog';
import {
  uploadDocument,
  type DisplayDocument,
  type DocumentOwnerType,
} from './api/documentsService';

/**
 * Papers filed against a record that does not exist yet.
 *
 * Every "create" surface has the same problem: a document is uploaded to an
 * owner id, and a vehicle being registered has no id until it is saved. So the
 * files are held here — with their dates, which is the part the four
 * hand-rolled copies of this kept losing — and written the moment the record
 * comes back with an id.
 *
 * `rows` are shaped as `DisplayDocument` so the staged list and the live list
 * render through the same `DocumentChecklist`, and an operator cannot tell
 * (or need to tell) which one they are looking at.
 */
export interface StagedDocument {
  id: string;
  category: string;
  capture: DocumentCapture;
}

export function useStagedDocuments() {
  const [staged, setStaged] = useState<StagedDocument[]>([]);

  const stage = useCallback((spec: DocumentTypeSpec, capture: DocumentCapture) => {
    setStaged((held) => [
      /* One document per category: re-uploading a grey card replaces the one
         staged a moment ago rather than filing two. */
      ...held.filter((entry) => entry.category !== spec.label),
      { id: `staged-${spec.label}-${capture.file.name}`, category: spec.label, capture },
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setStaged((held) => held.filter((entry) => entry.id !== id));
  }, []);

  const reset = useCallback(() => setStaged([]), []);

  const rows: DisplayDocument[] = useMemo(
    () =>
      staged.map((entry) => ({
        id: entry.id,
        name: entry.capture.file.name,
        category: entry.category,
        uploadDate: 'Not filed yet',
        mimeType: entry.capture.file.type || undefined,
        issueDate: entry.capture.issueDate,
        expiryDate: entry.capture.expiryDate,
        issuer: entry.capture.issuer,
        fileSize: `${(entry.capture.file.size / 1024).toFixed(0)} KB`,
        status: 'Pending Review',
      })),
    [staged],
  );

  /** The capture for one category, for a form that needs its dates. */
  const captureFor = useCallback(
    (category: string) => staged.find((entry) => entry.category === category)?.capture,
    [staged],
  );

  return { staged, rows, stage, remove, reset, captureFor };
}

/** Writes everything staged against the record that has just been created. */
export async function uploadStagedDocuments(
  ownerType: DocumentOwnerType,
  ownerId: string,
  staged: StagedDocument[],
): Promise<void> {
  for (const entry of staged) {
    await uploadDocument({
      ownerType,
      ownerId,
      category: entry.category,
      file: entry.capture.file,
      issueDate: entry.capture.issueDate,
      expiryDate: entry.capture.expiryDate,
      issuer: entry.capture.issuer,
    });
  }
}
