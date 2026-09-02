import { useEffect, useState } from 'react';

import { fetchDocumentObjectUrl } from '../api/documentsService';

/**
 * The stored file as something an `<img>` can point at.
 *
 * Documents are served through an authenticated endpoint, so a plain
 * `src="/documents/:id/download"` gets a 401 — the bytes have to be fetched
 * with the token and handed to the page as a blob URL. That is also why the
 * URL has to be revoked: it pins the blob in memory until it is.
 *
 * Only worth doing for something the browser can actually draw. A caller that
 * knows the file is a PDF passes `enabled: false` and draws a paper tile
 * instead — downloading a 4MB scan to render a 96px square is a waste of the
 * one thing a yard on a phone connection does not have.
 */
export function useDocumentPreview(documentId: string | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!documentId || !enabled) {
      setUrl(null);
      setFailed(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);

    fetchDocumentObjectUrl(documentId)
      .then((preview) => {
        if (cancelled) {
          URL.revokeObjectURL(preview.url);
          return;
        }
        objectUrl = preview.url;
        setUrl(preview.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, enabled]);

  return { url, failed };
}
