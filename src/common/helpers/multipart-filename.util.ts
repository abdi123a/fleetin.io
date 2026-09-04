/**
 * The filename a multipart upload actually meant.
 *
 * Busboy (under Multer) decodes multipart field values as latin1, which is
 * lossless at the byte level but wrong for every non-ASCII name. Re-encoding
 * those bytes and decoding them as UTF-8 recovers the original. A name that is
 * genuinely latin1 will not survive that round trip — the re-decode produces
 * U+FFFD — so the original is kept in that case rather than replacing a
 * readable name with question marks.
 *
 * Shared rather than copied: a macOS screenshot carries U+202F before its
 * AM/PM, and a receipt photographed on a French or Arabic phone is named in
 * neither ASCII nor latin1. Every upload surface has the same problem, and one
 * of them getting it right is not the same as it being right.
 */
export function decodeMulterFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
