import type { ReactNode } from 'react';

import { COMPANY } from '@/config/company';
import { useBankAccounts } from '@/features/bank-accounts';
import { useLetterhead, useSystemSettings } from '@/features/settings';

/**
 * The parts every printed document shares.
 *
 * The invoice and the payment voucher had each grown their own copy of the
 * header and footer, reading `COMPANY` directly. They agreed only because
 * somebody kept them in step by hand — and neither could show a signature or a
 * stamp at all, so an emailed PDF arrived with an empty ruled box where the
 * paper copy had ink. Both now render these three components, configured under
 * Settings → Documents.
 */

/**
 * Where an invoice tells the client to send money.
 *
 * Three sources, in descending order of how much anyone has actually verified
 * them: the account chosen under Settings → Documents, then whichever account
 * Finance marks primary, and only if there are none at all the placeholder in
 * `config/company.ts`. That last one exists so a document is never blank, and
 * it is the reason the settings screen carries a warning: an invoice with the
 * wrong account number sends a client's money to a stranger.
 */
export function useRemittanceAccount() {
  const { documents } = useSystemSettings();
  const { data: accounts = [] } = useBankAccounts();

  const active = accounts.filter((account) => account.isActive);
  const chosen =
    active.find((account) => account.id === documents.defaultRemittanceAccountId) ??
    active.find((account) => account.isPrimary);

  if (chosen) {
    return {
      bankName: chosen.bankName,
      accountHolder: chosen.accountHolder,
      accountNumber: chosen.accountNumber,
      swiftCode: chosen.swiftCode ?? chosen.iban ?? '',
    };
  }

  return {
    bankName: COMPANY.bank.name,
    accountHolder: COMPANY.bank.accountName,
    accountNumber: COMPANY.bank.accountNumber,
    swiftCode: COMPANY.bank.swift,
  };
}

/**
 * Letterhead: the logo, and nothing else.
 *
 * It used to print a tagline and a four-line address beside the mark. Those
 * are seeded placeholders — "Rue de Venise, Heron", "Djibouti Port free zone"
 * — not Fleetin's real details, and a client-facing document that states an
 * address nobody verified is worse than one that states none: an invoice is a
 * legal instrument, and wrong particulars on it are wrong in a way a reader
 * will act on.
 *
 * The mark carries the name, and the footer carries the contact and
 * registration lines the operator actually configured. When real particulars
 * are entered under Settings → Documents they belong there, in one place,
 * rather than being duplicated at the top of every sheet.
 */
export function DocumentLetterhead() {
  const letterhead = useLetterhead();

  return (
    <img
      src={letterhead.logoSrc}
      alt={letterhead.tradingName}
      style={{ height: `${letterhead.logoHeightMm}mm` }}
      className="w-auto object-contain"
    />
  );
}

/**
 * Footer: mark, legal name, registration and contact lines.
 *
 * `note` is the small print under the rule. The invoice's disclaimer and the
 * voucher's terms are different sentences, so each passes its own.
 */
export function DocumentFooter() {
  const letterhead = useLetterhead();

  /*
   * Contact lines are free text in settings, so each is sorted by what it
   * looks like rather than by position — an address stays an address when
   * somebody reorders the list.
   */
  const contacts = letterhead.contactLines.map((value) => ({
    value,
    kind: (value.includes('@') ? 'email' : /^[+\d(]/.test(value.trim()) ? 'phone' : 'web') as GlyphKind,
  }));

  /* No margin and no trailing note: the band IS the bottom of the sheet. The
     electronic-signature disclaimer that used to sit under it left a strip of
     white below the only element that closes the page, which read as the
     document having run out rather than ended. */
  return (
    <footer>
      <div className="bg-[var(--invoice-brand)] px-[14mm] py-[5mm] text-white">
        {/*
          Each detail with its own glyph, on one line, evenly spaced.

          The labelled-column version was legible but static — four grey
          headings a reader had to parse before finding the phone number. A
          glyph is recognised without reading, which is the whole job of a
          footer: somebody scanning for the email finds the envelope.

          The circular mark that used to sit at the end is gone. It repeated
          the logo already at the top of the sheet and, inverted onto the band,
          read as a white blob.
        */}
        {/* ONE line, never wrapping. `min-w-0` + `truncate` on the registration
            text is what holds it: the contact details are fixed-width facts and
            the registration string is the only one that can give. */}
        <div className="flex flex-nowrap items-center gap-x-[6mm]">
          {contacts.map((contact) => (
            <span key={contact.value} className="flex shrink-0 items-center gap-[2mm]">
              <FooterGlyph kind={contact.kind} />
              <span className="whitespace-nowrap text-[8pt] font-semibold leading-none text-white">
                {contact.value}
              </span>
            </span>
          ))}

          {letterhead.registrationLines.length > 0 ? (
            <span className="flex min-w-0 items-center gap-[2mm]">
              <FooterGlyph kind="registration" />
              <span className="truncate text-[8pt] leading-none text-white/85">
                {letterhead.registrationLines.join('  ·  ')}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

type GlyphKind = 'phone' | 'email' | 'web' | 'registration';

/**
 * The footer's marks — drawn inline rather than pulled from the icon set,
 * because this sheet prints and a lucide stroke at 3mm loses its shape. These
 * are solid at the size they are actually used.
 */
function FooterGlyph({ kind }: { kind: GlyphKind }) {
  const paths: Record<GlyphKind, ReactNode> = {
    phone: (
      <path
        d="M21.5 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.2 2 2 0 0 1 3.6 1h2a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L6.6 8.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"
        fill="currentColor"
      />
    ),
    email: (
      <>
        <path d="M2.5 5.5h19v13h-19z" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path
          d="m3.5 6.5 8.5 6 8.5-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </>
    ),
    web: (
      <>
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path
          d="M2.5 12h19M12 2.5c2.6 2.8 4 6 4 9.5s-1.4 6.7-4 9.5c-2.6-2.8-4-6-4-9.5s1.4-6.7 4-9.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
      </>
    ),
    registration: (
      <>
        <path d="M4.5 21.5V4a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16.5 4v17.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16.5 9.5h2A1.5 1.5 0 0 1 20 11v10.5M2.5 21.5h19M8.5 7h4M8.5 11h4M8.5 15h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  };

  return (
    /* Brand YELLOW disc, WHITE glyph.
       The glyph was the band's own teal first, which is the house pairing on
       paper but disappears at 3mm — teal on amber is a mid-tone on a mid-tone,
       and the mark read as a plain yellow dot. White carries the shape at this
       size, which is the only thing the glyph has to do. */
    <span
      className="flex size-[5.8mm] shrink-0 items-center justify-center rounded-full bg-[var(--invoice-accent)] text-white"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[3.2mm]">
        {paths[kind]}
      </svg>
    </span>
  );
}

/**
 * The signature block, and the stamp that sits with it.
 *
 * A signatory with no name never prints, whatever the settings select — an
 * unfilled position leaves the document clean rather than printing an empty
 * labelled box. If none of the selected signatories has a name, the block
 * falls back to a single blank rule for a wet signature, which is exactly what
 * the document did before any of this was configurable.
 */
export function DocumentSignatureBlock({ document: docKind }: { document: 'invoice' | 'voucher' }) {
  const { documents, organization } = useSystemSettings();
  const stamp = documents.stamp;
  const stampApplies = stamp.src != null && (docKind === 'invoice' ? stamp.onInvoice : stamp.onVoucher);

  const selected = documents.signatureBlocks[docKind]
    .map((key) => documents.signatories[key])
    .filter((person) => person.name.trim() !== '');

  const blocks = selected.length > 0 ? selected : [{ name: '', role: 'Signature & company stamp', signatureSrc: null }];

  return (
    <div className="flex flex-wrap items-end justify-end gap-[8mm]">
      {blocks.map((person, index) => (
        <div key={`${person.role}-${index}`} className="relative w-full max-w-[70mm]">
          {/* The ink area. Holds the scanned signature, and the stamp when it
              is placed over the signature rather than in the footer. */}
          <div className="relative flex h-[30mm] items-end justify-center">
            {person.signatureSrc ? (
              <img
                src={person.signatureSrc}
                alt=""
                className="max-h-[24mm] w-auto max-w-full object-contain"
              />
            ) : (
              <div className="h-full w-full rounded-[2mm] border-[1.5px] border-dashed border-[var(--invoice-rule)]" />
            )}

            {stampApplies && stamp.placement === 'signature' && index === blocks.length - 1 ? (
              <img
                src={stamp.src as string}
                alt=""
                style={{
                  height: `${stamp.sizeMm}mm`,
                  opacity: stamp.opacityPct / 100,
                }}
                className="pointer-events-none absolute -right-[4mm] bottom-0 w-auto object-contain"
              />
            ) : null}
          </div>

          <div className="mt-[2mm] border-t border-[var(--invoice-ink)] pt-[1.5mm] text-center text-[8pt] font-semibold text-[var(--invoice-muted)]">
            {person.name ? (
              <>
                <span className="block font-bold text-[var(--invoice-ink)]">{person.name}</span>
                {person.role}
              </>
            ) : (
              person.role
            )}
          </div>
          {index === 0 ? (
            <p className="mt-[1mm] text-center text-[8pt] text-[var(--invoice-faint)]">
              For and on behalf of {organization.legalName}
            </p>
          ) : null}
        </div>
      ))}

      {stampApplies && stamp.placement === 'footer' ? (
        <img
          src={stamp.src as string}
          alt=""
          style={{ height: `${stamp.sizeMm}mm`, opacity: stamp.opacityPct / 100 }}
          className="w-auto shrink-0 object-contain"
        />
      ) : null}
    </div>
  );
}

/**
 * A stamp printed centred behind the whole document.
 *
 * Rendered as a positioned overlay inside the sheet, so it sits behind the
 * figures without pushing anything. Only used when placement is `watermark`.
 */
export function DocumentStampWatermark({ document: docKind }: { document: 'invoice' | 'voucher' }) {
  const stamp = useSystemSettings().documents.stamp;
  const applies = stamp.src != null && (docKind === 'invoice' ? stamp.onInvoice : stamp.onVoucher);
  if (!applies || stamp.placement !== 'watermark') return null;

  return (
    <img
      src={stamp.src as string}
      alt=""
      aria-hidden
      style={{ height: `${stamp.sizeMm * 2.4}mm`, opacity: (stamp.opacityPct / 100) * 0.35 }}
      className="pointer-events-none absolute left-1/2 top-1/2 w-auto -translate-x-1/2 -translate-y-1/2 -rotate-12 object-contain"
    />
  );
}
