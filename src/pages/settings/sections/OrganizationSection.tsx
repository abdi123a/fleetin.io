import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { FieldGrid, SectionNote, TextField } from '../components/fields';

/**
 * The legal entity.
 *
 * These fields are not decoration: they print on every invoice a client
 * receives and every payroll document an employee signs. The registration and
 * tax numbers shipped as placeholders — an invoice carrying a wrong NIF is a
 * document a client's accountant rejects — so the note stays until they are
 * replaced.
 */
export function OrganizationSection() {
  const org = useSystemSettings().organization;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof org>) => update('organization', patch);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Identity" subtitle="What the app calls itself, and what documents call the company">
        <FieldGrid>
          <TextField
            label="Trading name"
            value={org.tradingName}
            onChange={(v) => set({ tradingName: v })}
            hint="Used in app chrome, page titles and email signatures."
          />
          <TextField
            label="Registered name"
            value={org.legalName}
            onChange={(v) => set({ legalName: v })}
            hint="Exactly as it appears on the trade register — this is what prints on an invoice."
          />
          <TextField
            label="Tagline"
            value={org.tagline}
            onChange={(v) => set({ tagline: v })}
            hint="One line under the name on a document letterhead."
          />
          <TextField
            label="HR department line"
            value={org.hrDepartment}
            onChange={(v) => set({ hrDepartment: v })}
            hint="Printed above the signature on payroll and leave documents."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Registered office" subtitle="Printed as the address block on every document">
        <FieldGrid>
          <TextField label="Address line 1" value={org.addressLine1} onChange={(v) => set({ addressLine1: v })} />
          <TextField label="Address line 2" value={org.addressLine2} onChange={(v) => set({ addressLine2: v })} />
          <TextField label="City" value={org.city} onChange={(v) => set({ city: v })} />
          <TextField label="Country" value={org.country} onChange={(v) => set({ country: v })} />
        </FieldGrid>
      </Panel>

      <Panel title="Contact" subtitle="The lines a client uses to reach accounts">
        <FieldGrid>
          <TextField label="Telephone" type="tel" value={org.phone} onChange={(v) => set({ phone: v })} />
          <TextField label="Mobile" type="tel" value={org.mobile} onChange={(v) => set({ mobile: v })} />
          <TextField label="Email" type="email" value={org.email} onChange={(v) => set({ email: v })} />
          <TextField label="Website" type="url" value={org.website} onChange={(v) => set({ website: v })} />
        </FieldGrid>
      </Panel>

      <Panel title="Registration" subtitle="Statutory identifiers that must appear on issued documents">
        <FieldGrid>
          <TextField
            label="Trade register"
            value={org.tradeRegister}
            onChange={(v) => set({ tradeRegister: v })}
            mono
            hint="RC number as issued."
          />
          <TextField
            label="Tax identification (NIF)"
            value={org.taxId}
            onChange={(v) => set({ taxId: v })}
            mono
          />
          <TextField
            label="Social security employer no. (CNSS)"
            value={org.cnssId}
            onChange={(v) => set({ cnssId: v })}
            mono
            hint="Printed on payslips and employment certificates."
          />
          <SectionNote tone="warning">
            The registration and tax numbers shipped as placeholders. A document carrying a wrong NIF or trade
            register is one a client&rsquo;s accountant will reject — replace both before anything is sent out.
          </SectionNote>
        </FieldGrid>
      </Panel>
    </div>
  );
}
