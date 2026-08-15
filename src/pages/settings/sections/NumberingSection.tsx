import { useSystemSettings } from '@/features/settings';
import { formatId, ID_LABEL, type IdKind } from '@/lib/ids';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { Field, FieldGrid, NumberField, SectionNote, TextField, ToggleField } from '../components/fields';
import { Input } from '@/design-system';

/**
 * Reference formats.
 *
 * The scheme is three letters, a hyphen and a fixed number of digits —
 * `SHI-00412` — short enough to read down a phone line to a driver and
 * fixed-width so a column of them sorts and scans. What is configurable is
 * which three letters each record type gets, and how wide the number is.
 *
 * One thing this screen cannot do, and says so: changing a prefix does not
 * renumber anything already issued. `SHI-00412` stays `SHI-00412` forever; the
 * next shipment gets the new prefix. Anything else would break every reference
 * printed on paper or quoted in an email.
 */
export function NumberingSection() {
  const numbering = useSystemSettings().numbering;
  const update = useSettingsStore((s) => s.update);

  const kinds = Object.keys(ID_LABEL) as IdKind[];

  const setPrefix = (kind: IdKind, value: string) =>
    update('numbering', {
      // Three uppercase letters, always — the parser depends on the width.
      prefixes: { [kind]: value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) } as never,
    });

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Scheme" subtitle="Shape of every reference the system mints">
        <FieldGrid>
          <NumberField
            label="Digits"
            value={numbering.digits}
            onChange={(v) => update('numbering', { digits: v })}
            min={3}
            max={8}
            hint={`Five digits gives ${(10 ** numbering.digits - 1).toLocaleString('en-GB')} references per prefix before the scheme runs out.`}
          />
          <TextField
            label="HR document pattern"
            value={numbering.hrReferencePattern}
            onChange={(v) => update('numbering', { hrReferencePattern: v })}
            mono
            hint="Payroll and leave documents number separately. Tokens: {prefix} {seq} {yy} {yyyy}."
          />
          <ToggleField
            label="Restart sequences each year"
            description="On, the counter returns to 1 every January and the year appears in the reference. Off, it runs continuously."
            checked={numbering.resetYearly}
            onChange={(v) => update('numbering', { resetYearly: v })}
          />
          <SectionNote tone="warning">
            Changing a prefix or the digit width affects the <strong>next</strong> reference minted and nothing
            already issued. History is never renumbered — a reference quoted in an email has to keep working.
          </SectionNote>
        </FieldGrid>
      </Panel>

      <Panel title="Prefixes" subtitle="Three letters per record type, with a live example">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map((kind) => {
            const prefix = numbering.prefixes[kind] ?? '';
            return (
              <Field key={kind} label={ID_LABEL[kind]}>
                <div className="flex items-center gap-2">
                  <Input
                    value={prefix}
                    maxLength={3}
                    onChange={(e) => setPrefix(kind, e.target.value)}
                    className="w-24 font-mono uppercase"
                    aria-label={`${ID_LABEL[kind]} prefix`}
                  />
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {prefix.length === 3 ? `${prefix}-${'4'.padStart(numbering.digits, '0')}` : '—'}
                  </span>
                </div>
              </Field>
            );
          })}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Shipper (<span className="font-mono">SHP</span>) and transporter (<span className="font-mono">PTR</span>)
          keys are not listed: four modules join on them, so renaming one is a migration rather than a setting.
          Container numbers, driving licences and client contract references belong to somebody else&rsquo;s
          numbering system and are never rewritten. Today&rsquo;s shipment reads{' '}
          <span className="font-mono text-foreground">{formatId('shipment', 412)}</span>.
        </p>
      </Panel>
    </div>
  );
}
