import { downloadDocument } from '@/features/documents/api/documentsService';

/**
 * Document download helper.
 *
 * Lives apart from `DocumentViewerModal.tsx` so that file exports components
 * only — mixing the two breaks React Fast Refresh for the modal.
 *
 * Downloads the real, previously-uploaded file through the backend's
 * StorageService-backed endpoint. `id` must be a real Document row id — a
 * document without one (not yet migrated off local/mock state) has nothing
 * to fetch, so this no-ops rather than fabricating a stand-in PDF.
 */
export async function triggerDocumentDownload(id: string | undefined, fileName: string) {
  if (!id) {
    console.warn(`[documentDownload] "${fileName}" has no backend document id — nothing to download.`);
    return;
  }
  await downloadDocument(id, fileName);
}
