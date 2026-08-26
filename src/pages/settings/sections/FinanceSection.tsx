import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { FieldGrid, NumberField, SectionNote, SelectField, TextField, ToggleField } from '../components/fields';

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
] as const;

/**
 * Money policy: the currency, the terms, and the rules that can stop a payout.
 *
 * The payout rules deserve their own note because they were argued out once
 * already. The 48-hour window **advises** — it colours a row and orders a
 * queue, and it has never been allowed to block a release. Only two things
 * actually stop money: missing proof of delivery, and an open hold. Those two
 * are the toggles below; the window is a number beside them, not a gate.
 */
export function FinanceSection() {
  const finance = useSystemSettings().finance;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof finance>) => update('finance', patch);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Currency" subtitle="Denomination and conversion rate">
        <FieldGrid>
          <TextField
            label="Base currency"
            value={finance.baseCurrency}
            onChange={(v) => set({ baseCurrency: v.toUpperCase() })}
            mono
            hint="Everything is booked in this. Changing it does not restate anything already recorded."
          />
          <NumberField
            label="USD → DJF"
            value={finance.usdToDjf}
            onChange={(v) => set({ usdToDjf: v })}
            min={1}
            step={0.001}
            hint="A fixed peg, not a market rate. 177.721 is the Banque Centrale de Djibouti figure."
          />
          <ToggleField
            label="Show a USD figure beside DJF"
            description="Adds a converted second line. Off keeps DJF only."
            checked={finance.showSecondaryCurrency}
            onChange={(v) => set({ showSecondaryCurrency: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Terms" subtitle="Due dates and settlement day">
        <FieldGrid>
          <NumberField
            label="Payment terms"
            value={finance.paymentTermsDays}
            onChange={(v) => set({ paymentTermsDays: v })}
            min={0}
            max={180}
            suffix="days"
            hint="An invoice falls due this many days after issue."
          />
          <NumberField
            label="Overdue grace"
            value={finance.overdueGraceDays}
            onChange={(v) => set({ overdueGraceDays: v })}
            min={0}
            max={30}
            suffix="days"
            hint="Days past due before an invoice reads as overdue."
          />
          <SelectField
            label="Settlement day"
            value={String(finance.settlementWeekday)}
            onChange={(v) => set({ settlementWeekday: Number(v) })}
            options={WEEKDAYS}
            hint="The weekday settlement runs, UTC."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Release rules">
        <FieldGrid>
          <NumberField
            label="Advisory window"
            value={finance.payoutAdvisoryHours}
            onChange={(v) => set({ payoutAdvisoryHours: v })}
            min={0}
            max={336}
            suffix="hours"
            hint="Orders the settlement queue. Never blocks a release."
          />
          <NumberField
            label="Proof of delivery required"
            value={finance.requiredPodAttachments}
            onChange={(v) => set({ requiredPodAttachments: v })}
            min={0}
            max={5}
            suffix="files"
            hint="A release with fewer attachments than this is stopped. Set 0 to stop checking."
          />
          <ToggleField
            label="An open hold stops a release"
            description="Off, a hold becomes a note rather than a control."
            checked={finance.blockReleaseOnOpenHold}
            onChange={(v) => set({ blockReleaseOnOpenHold: v })}
          />
          <SectionNote tone="warning">
            These two are the only rules that stop money. The advisory window never blocks a release.
          </SectionNote>
        </FieldGrid>
      </Panel>

      <Panel title="Containers" subtitle="Free time and detention">
        <FieldGrid>
          <NumberField
            label="Default free time"
            value={finance.defaultFreeTimeDays}
            onChange={(v) => set({ defaultFreeTimeDays: v })}
            min={0}
            max={60}
            suffix="days"
            hint="Used when the shipping line has not specified one for a container."
          />
          <NumberField
            label="Detention rate"
            value={finance.detentionRatePerDay}
            onChange={(v) => set({ detentionRatePerDay: v })}
            min={0}
            step={0.5}
            suffix={`${finance.detentionCurrency}/day`}
            hint="Per container, per day past free time."
          />
          <TextField
            label="Detention currency"
            value={finance.detentionCurrency}
            onChange={(v) => set({ detentionCurrency: v.toUpperCase() })}
            mono
            hint="Labelled at the point of display so it never reads as DJF."
          />
        </FieldGrid>
      </Panel>
    </div>
  );
}
