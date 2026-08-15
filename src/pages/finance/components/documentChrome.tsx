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

/** Letterhead: logo, legal name, address block. */
export function DocumentLetterhead() {
  const letterhead = useLetterhead();

  return (
    <div className="flex items-start gap-4">
      <img
        src={letterhead.logoSrc}
        alt={letterhead.tradingName}
        style={{ height: `${letterhead.logoHeightMm}mm` }}
        className="w-auto object-contain"
      />
      <div className="text-[9pt] leading-[1.5]">
        <p className="text-[11pt] font-extrabold tracking-tight text-[var(--invoice-ink)]">
          {letterhead.legalName}
        </p>
        {letterhead.tagline ? <p className="text-[var(--invoice-muted)]">{letterhead.tagline}</p> : null}
        {letterhead.addressLines.map((line) => (
          <p key={line} className="text-[var(--invoice-muted)]">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Footer: mark, legal name, registration and contact lines.
 *
 * `note` is the small print under the rule. The invoice's disclaimer and the
 * voucher's terms are different sentences, so each passes its own.
 */
/**
 * The round mark that opens each footer item.
 *
 * Inline SVG rather than the app's icon registry: this footer prints, and the
 * HR renderer draws the identical discs server-side from its own inline paths.
 * Two implementations of one mark is how the two document sets drift apart.
 */
function FooterDisc({ glyph }: { glyph: 'mail' | 'globe' | 'phone' | 'whatsapp' }) {
  const paths: Record<typeof glyph, JSX.Element> = {
    mail: (
      <>
        <path d="M2 5.5h20v13H2z" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
        <path d="m3 6.5 9 6 9-6" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    globe: (
      <>
        <circle cx={12} cy={12} r={9.5} fill="none" stroke="#fff" strokeWidth={2.2} />
        <path d="M2.5 12h19M12 2.5a15 15 0 0 1 0 19 15 15 0 0 1 0-19Z" fill="none" stroke="#fff" strokeWidth={2.2} />
      </>
    ),
    phone: (
      <path
        d="M21.5 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.2 2 2 0 0 1 3.6 1h2a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L6.6 8.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"
        fill="#fff"
      />
    ),
    whatsapp: (
      <path
        d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a13 13 0 0 1-5.6-4.9c-.4-.6-.9-1.5-.9-2.4 0-.9.5-1.4.7-1.6.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.4l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.2-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3v1Z"
        fill="#fff"
      />
    ),
  };

  return (
    <span className="flex size-[6.5mm] shrink-0 items-center justify-center rounded-full bg-[var(--invoice-accent)]">
      <svg viewBox="0 0 24 24" className="size-[3.4mm]" aria-hidden>
        {paths[glyph]}
      </svg>
    </span>
  );
}

export function DocumentFooter({ note }: { note?: string }) {
  const letterhead = useLetterhead();
  const { documents } = useSystemSettings();

  /*
   * Contact lines are free text in settings, so the disc is chosen by what the
   * line looks like rather than by position — an address stays an address when
   * someone reorders the list.
   */
  const items = letterhead.contactLines.map((line) => ({
    line,
    glyph: line.includes('@')
      ? ('mail' as const)
      : /^[+\d(]/.test(line.trim())
        ? ('phone' as const)
        : ('globe' as const),
  }));

  return (
    <footer className="mt-[8mm] border-t-2 border-[var(--invoice-brand)] px-[14mm] pb-[6mm] pt-[4mm]">
      <div className="flex items-center gap-[6mm]">
        <div className="flex flex-1 flex-wrap items-center gap-x-[5mm] gap-y-[2mm]">
          {items.map((item) => (
            <span key={item.line} className="flex items-center gap-[2.4mm]">
              <FooterDisc glyph={item.glyph} />
              {item.glyph === 'phone' ? <FooterDisc glyph="whatsapp" /> : null}
              <span className="text-[8.5pt] font-semibold text-[var(--invoice-ink)]">{item.line}</span>
            </span>
          ))}
          {letterhead.registrationLines.map((line) => (
            <span key={line} className="text-[8pt] text-[var(--invoice-muted)]">
              {line}
            </span>
          ))}
        </div>
        {documents.showFooterMark ? (
          <img src={letterhead.markSrc} alt="" className="h-[6mm] w-auto shrink-0 object-contain" />
        ) : (
          <span className="flex size-[9mm] shrink-0 items-center justify-center rounded-full bg-[var(--invoice-brand)] text-[8.5pt] font-bold text-white">
            1
          </span>
        )}
      </div>
      {note ? (
        <p className="mt-[3mm] text-center text-[7.5pt] text-[var(--invoice-faint)]">{note}</p>
      ) : null}
    </footer>
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
