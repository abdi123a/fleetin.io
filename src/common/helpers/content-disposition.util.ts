/**
 * A `Content-Disposition` header that survives the filename people actually use.
 *
 * HTTP header values are Latin-1. Node's `setHeader` does not transliterate —
 * it throws `ERR_INVALID_CHAR`, which Nest turns into a 500. So a single
 * character outside that range in a stored filename takes the whole download
 * down.
 *
 * That is not a rare edge. A macOS screenshot is named
 * `Screenshot 2026-08-31 at 2.33.38 PM.png`, and the space before "PM" is
 * U+202F NARROW NO-BREAK SPACE — so every screenshot uploaded as a proof of
 * delivery answered its own download with a 500, and the viewer that fetches
 * the bytes to preview them showed "Preview unavailable". Found 2026-09-01 on
 * a real upload; the same would happen to any Arabic, French or accented name,
 * which on this corridor is most of them.
 *
 * The answer is RFC 6266: send both parameters. `filename` carries an ASCII
 * fallback for anything old, `filename*` carries the real name percent-encoded
 * as UTF-8, and every current browser prefers the second. Two of this
 * codebase's four download endpoints already did this by hand — this is their
 * version, lifted out so the other two stop being the exceptions.
 */
export function contentDisposition(
  filename: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  /* Quotes and backslashes would end the quoted-string early, so they go too —
     not only the characters Node rejects. */
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, "'");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
