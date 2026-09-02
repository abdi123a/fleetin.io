import { contentDisposition } from './content-disposition.util';

/** What Node's `setHeader` accepts: Latin-1, no control characters. */
const nodeWouldAccept = (value: string) => /^[\t\x20-\x7e\x80-\xff]*$/.test(value);

describe('contentDisposition', () => {
  /**
   * The one that took the endpoint down. macOS writes U+202F NARROW NO-BREAK
   * SPACE before AM/PM, so every screenshot uploaded as a proof of delivery
   * answered `GET /documents/:id/download` with a 500 — which is what the
   * viewer surfaced as "Preview unavailable".
   */
  it('survives a macOS screenshot filename', () => {
    const name = 'Screenshot 2026-08-31 at 2.33.38 PM.png';
    const header = contentDisposition(name);

    expect(nodeWouldAccept(header)).toBe(true);
    expect(header).toContain('filename="Screenshot 2026-08-31 at 2.33.38_PM.png"');
    /* The real name still travels, percent-encoded — that is the parameter
       every current browser actually reads. */
    expect(header).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toBe(name);
  });

  it.each([
    'Facture — Février 2026.pdf',
    'شهادة التأمين.pdf',
    'Attestation d’assurance.pdf',
    'naïve café.png',
  ])('survives %s', (name) => {
    const header = contentDisposition(name);
    expect(nodeWouldAccept(header)).toBe(true);
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toBe(name);
  });

  /* A quote would close the quoted-string early and let the rest of the name
     be read as header parameters. */
  it('neutralises quotes and backslashes in the fallback', () => {
    const header = contentDisposition('we"ird\\name.pdf');
    expect(header).toContain(`filename="we'ird'name.pdf"`);
    expect(nodeWouldAccept(header)).toBe(true);
  });

  it('leaves a plain ASCII name alone in the fallback', () => {
    expect(contentDisposition('invoice-2026-09.pdf')).toContain('filename="invoice-2026-09.pdf"');
  });

  it('defaults to attachment and can be asked for inline', () => {
    expect(contentDisposition('a.pdf').startsWith('attachment;')).toBe(true);
    expect(contentDisposition('a.pdf', 'inline').startsWith('inline;')).toBe(true);
  });
});
