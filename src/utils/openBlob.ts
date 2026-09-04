/**
 * Opens a file the user just asked for, from bytes the app already holds.
 *
 * The bytes are fetched rather than linked because the API authenticates on a
 * bearer header, which a plain `window.open` cannot carry — that is why an
 * earlier set of links landed on the dev server's 404 instead of the file. An
 * object URL with a real `download` name gives the browser both the viewer and
 * the right filename, and it is revoked on a timer so nothing leaks.
 *
 * Lives in `utils/` rather than beside any one feature: it is a browser
 * technique, not a fact about payslips or receipts. HR reached it first and
 * re-exports it under its old name.
 */
export async function openBlobInNewTab(
  fetcher: () => Promise<{ blob: Blob; filename: string | null }>,
  fallbackName: string,
): Promise<void> {
  const { blob, filename } = await fetcher();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.download = filename ?? fallbackName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
