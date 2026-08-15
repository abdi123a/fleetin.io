import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { FieldGrid, SelectField } from '../components/fields';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ value: String(index + 1), label }));

/** A sample of each format, so the choice is made by looking rather than parsing. */
const SAMPLE = new Date(2026, 7, 15, 14, 30);

function sampleDate(format: string): string {
  const day = String(SAMPLE.getDate()).padStart(2, '0');
  const month = String(SAMPLE.getMonth() + 1).padStart(2, '0');
  const monthName = SAMPLE.toLocaleDateString('en-GB', { month: 'short' });
  const year = SAMPLE.getFullYear();
  switch (format) {
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`;
    case 'dd MMM yyyy':
      return `${day} ${monthName} ${year}`;
    case 'MM/dd/yyyy':
      return `${month}/${day}/${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

/**
 * How dates, numbers and the calendar read.
 *
 * Djibouti works in French and the corridor's counterparties do not, which is
 * why the language and the number format are separate choices: an operator can
 * read the interface in English while documents still group thousands the way
 * a local bank statement does.
 */
export function LocalizationSection() {
  const localization = useSystemSettings().localization;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof localization>) => update('localization', patch);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Language & region" subtitle="What the interface speaks, and which clock it keeps">
        <FieldGrid>
          <SelectField
            label="Interface language"
            value={localization.language}
            onChange={(v) => set({ language: v })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'Français' },
            ]}
          />
          <SelectField
            label="Time zone"
            value={localization.timezone}
            onChange={(v) => set({ timezone: v })}
            options={[
              { value: 'Africa/Djibouti', label: 'Africa/Djibouti (EAT, UTC+3)' },
              { value: 'Africa/Addis_Ababa', label: 'Africa/Addis Ababa (EAT, UTC+3)' },
              { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, UTC+3)' },
              { value: 'UTC', label: 'UTC' },
            ]}
            hint="Milestone timestamps are stored in UTC and rendered in this zone."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Formats" subtitle="How a date, a time and a number are written">
        <FieldGrid>
          <SelectField
            label="Date format"
            value={localization.dateFormat}
            onChange={(v) => set({ dateFormat: v })}
            options={(['dd MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'] as const).map((format) => ({
              value: format,
              label: `${format} — ${sampleDate(format)}`,
            }))}
            hint="A day-first numeric format and a month-first one are indistinguishable until the 13th. The spelled-out month never is."
          />
          <SelectField
            label="Time format"
            value={localization.timeFormat}
            onChange={(v) => set({ timeFormat: v })}
            options={[
              { value: '24h', label: '24-hour — 14:30' },
              { value: '12h', label: '12-hour — 2:30 pm' },
            ]}
          />
          <SelectField
            label="Number format"
            value={localization.numberFormat}
            onChange={(v) => set({ numberFormat: v })}
            options={[
              { value: 'en-GB', label: 'en-GB — 1,234,567.89' },
              { value: 'fr-DJ', label: 'fr-DJ — 1 234 567,89' },
              { value: 'en-US', label: 'en-US — 1,234,567.89' },
            ]}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Calendar" subtitle="Where a week and a financial year start">
        <FieldGrid>
          <SelectField
            label="Week starts on"
            value={String(localization.weekStartsOn)}
            onChange={(v) => set({ weekStartsOn: Number(v) as 0 | 1 | 6 })}
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
              { value: '6', label: 'Saturday' },
            ]}
            hint="Drives every week bucket in the analytics suite, so changing it re-cuts historical charts."
          />
          <SelectField
            label="Financial year opens"
            value={String(localization.fiscalYearStartMonth)}
            onChange={(v) => set({ fiscalYearStartMonth: Number(v) })}
            options={MONTHS}
            hint="Year-to-date figures across Finance count from the first day of this month."
          />
        </FieldGrid>
      </Panel>
    </div>
  );
}
