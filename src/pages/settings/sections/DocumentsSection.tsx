import { useBankAccounts } from '@/features/bank-accounts';
import { useSystemSettings } from '@/features/settings';
import type { Signatory } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/utils';

import {
  FieldGrid,
  ImageField,
  NumberField,
  SectionNote,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from '../components/fields';

type SignatoryKey = 'prepared' | 'checked' | 'approved';

const SIGNATORY_ORDER: ReadonlyArray<{ key: SignatoryKey; title: string; hint: string }> = [
  { key: 'prepared', title: 'Prepared by', hint: 'Whoever assembles the figures.' },
  { key: 'checked', title: 'Checked by', hint: 'The second pair of eyes, if the process has one.' },
  { key: 'approved', title: 'Approved by', hint: 'The person whose authority the document carries.' },
];

/**
 * What the printed documents say and who signs them.
 *
 * Before this section existed, an invoice printed an empty ruled box labelled
 * "Signature & company stamp" and nothing else: the actual signature and stamp
 * were applied by hand after printing, and a PDF emailed to a client carried
 * neither. Both are settings now — a scanned signature and a stamp image drop
 * into the block, so an emailed document looks like the paper one.
 */
export function DocumentsSection() {
  const documents = useSystemSettings().documents;
  const update = useSettingsStore((s) => s.update);
  const { data: accounts = [] } = useBankAccounts();

  const setStamp = (patch: Partial<typeof documents.stamp>) => update('documents', { stamp: patch });

  const setSignatory = (key: SignatoryKey, patch: Partial<Signatory>) =>
    update('documents', { signatories: { [key]: patch } as never });

  const toggleBlock = (doc: 'invoice' | 'voucher', key: SignatoryKey) => {
    const current = documents.signatureBlocks[doc];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    update('documents', { signatureBlocks: { [doc]: next } as never });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Letterhead" subtitle="Header and footer">
        <FieldGrid>
          <NumberField
            label="Logo height"
            value={documents.logoHeightMm}
            onChange={(v) => update('documents', { logoHeightMm: v })}
            min={6}
            max={40}
            step={1}
            suffix="mm"
            hint="Documents are laid out in millimetres. 16 mm is the shipped size."
          />
          <ToggleField
            label="Print the icon mark and legal name in the footer"
            description="Off prints registration and contact details only."
            checked={documents.showFooterMark}
            onChange={(v) => update('documents', { showFooterMark: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Signatories" subtitle="Name, role and signature">
        <div className="flex flex-col gap-4">
          {SIGNATORY_ORDER.map(({ key, title, hint }) => {
            const person = documents.signatories[key];
            return (
              <div key={key} className="rounded-card border border-border bg-muted/15 p-4">
                <p className="text-sm font-extrabold text-foreground">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <TextField
                    label="Name"
                    value={person.name}
                    onChange={(v) => setSignatory(key, { name: v })}
                    placeholder="Left blank, this block does not print"
                  />
                  <TextField
                    label="Title printed under the rule"
                    value={person.role}
                    onChange={(v) => setSignatory(key, { role: v })}
                  />
                  <ImageField
                    label="Scanned signature"
                    value={person.signatureSrc}
                    onChange={(v) => setSignatory(key, { signatureSrc: v })}
                    hint="Optional. Without it the rule prints blank."
                  />
                </div>
              </div>
            );
          })}

          <div className="grid gap-4 sm:grid-cols-2">
            <BlockPicker
              title="Invoice signature blocks"
              selected={documents.signatureBlocks.invoice}
              onToggle={(key) => toggleBlock('invoice', key)}
            />
            <BlockPicker
              title="Voucher signature blocks"
              selected={documents.signatureBlocks.voucher}
              onToggle={(key) => toggleBlock('voucher', key)}
            />
          </div>

          <SectionNote>
            A signatory with no name never prints, whichever blocks are selected.
          </SectionNote>
        </div>
      </Panel>

      <Panel title="Company stamp" subtitle="Applied on print and export">
        <FieldGrid>
          <ImageField
            label="Stamp image"
            value={documents.stamp.src}
            onChange={(v) => setStamp({ src: v })}
            hint="Transparent PNG of the seal, scanned at 300 dpi."
          />
          <SelectField
            label="Placement"
            value={documents.stamp.placement}
            onChange={(v) => setStamp({ placement: v })}
            options={[
              { value: 'signature', label: 'Over the signature block' },
              { value: 'footer', label: 'Beside the footer' },
              { value: 'watermark', label: 'Centred behind the document' },
            ]}
          />
          <NumberField
            label="Size"
            value={documents.stamp.sizeMm}
            onChange={(v) => setStamp({ sizeMm: v })}
            min={10}
            max={80}
            suffix="mm"
          />
          <NumberField
            label="Opacity"
            value={documents.stamp.opacityPct}
            onChange={(v) => setStamp({ opacityPct: v })}
            min={10}
            max={100}
            suffix="%"
            hint="85% reads as ink without hiding the figures."
          />
          <ToggleField
            label="Stamp client invoices"
            description="Changes the invoice disclaimer to acknowledge the stamp."
            checked={documents.stamp.onInvoice}
            onChange={(v) => setStamp({ onInvoice: v })}
          />
          <ToggleField
            label="Stamp payment vouchers"
            description="Signed by the transporter on collection."
            checked={documents.stamp.onVoucher}
            onChange={(v) => setStamp({ onVoucher: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Wording" subtitle="Printed verbatim">
        <FieldGrid>
          <TextAreaField
            label="Invoice terms"
            value={documents.invoiceTerms}
            onChange={(v) => update('documents', { invoiceTerms: v })}
            rows={3}
          />
          <TextAreaField
            label="Invoice footer disclaimer"
            value={documents.invoiceDisclaimer}
            onChange={(v) => update('documents', { invoiceDisclaimer: v })}
            rows={2}
          />
          <TextAreaField
            label="Payment voucher terms"
            value={documents.voucherTerms}
            onChange={(v) => update('documents', { voucherTerms: v })}
            rows={3}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Remittance" subtitle="Bank account printed on invoices">
        <FieldGrid>
          <SelectField
            label="Default bank account"
            value={documents.defaultRemittanceAccountId}
            onChange={(v) => update('documents', { defaultRemittanceAccountId: v })}
            options={[
              { value: '', label: 'Ask on each invoice' },
              ...accounts
                .filter((account) => account.isActive)
                .map((account) => ({
                  value: account.id,
                  label: `${account.bankName} · ${account.accountNumber} (${account.currency})`,
                })),
            ]}
            hint="Pre-selected on a new invoice; changeable per document."
          />
          <SectionNote tone="warning">
            A wrong account number misdirects payment. Accounts are managed in Finance → Accounts.
          </SectionNote>
        </FieldGrid>
      </Panel>
    </div>
  );
}

/** Which signing positions appear on one document type. */
function BlockPicker({
  title,
  selected,
  onToggle,
}: {
  title: string;
  selected: ReadonlyArray<SignatoryKey>;
  onToggle: (key: SignatoryKey) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SIGNATORY_ORDER.map(({ key, title: label }) => {
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
