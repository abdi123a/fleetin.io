import { useEffect, useState } from 'react';

import { Button, Input } from '@/design-system';
import { Percent } from '@/design-system/icons';
import { useSettings, useSystemSettings, useUpdateSettings } from '@/features/settings';
import { fmtDjf } from '@/lib/finance';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/utils';

import { Field, FieldGrid, NumberField, SectionNote, SelectField } from '../components/fields';

/**
 * The commission, and the billing rules around it.
 *
 * The percentage is the one setting in this whole module that is **saved to
 * the server**, because it decides what every transporter is paid and a
 * per-browser answer to that is not an answer. It keeps its explicit Save
 * button for the same reason — the rest of the module writes as you type, but
 * a figure that re-prices future work should take a deliberate click.
 */
export function CommissionSection() {
  const commission = useSystemSettings().commission;
  const update = useSettingsStore((s) => s.update);
  const { data: server, isLoading } = useSettings();
  const updateServer = useUpdateSettings();

  const [pctInput, setPctInput] = useState('');
  const [touched, setTouched] = useState(false);

  // Seed from the server once it lands, but never stomp on typing.
  useEffect(() => {
    if (server && !touched) setPctInput(String(server.fleetinCommissionPct));
  }, [server, touched]);

  const parsed = Number(pctInput);
  const valid = pctInput.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const dirty = touched && valid && server != null && parsed !== server.fleetinCommissionPct;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Fleetin commission"
        subtitle="Applies to every transporter"
      >
        <div className="flex flex-col gap-5">
          <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            The transporter is paid the shipper total{' '}
            <strong className="font-bold text-foreground">minus</strong> this percentage. Future shipments only.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Commission rate">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={pctInput}
                disabled={isLoading}
                onChange={(e) => {
                  setTouched(true);
                  setPctInput(e.target.value);
                }}
                suffixText="%"
                leadingIcon={<Percent className="h-4 w-4" />}
                className="w-44 font-mono"
                aria-label="Fleetin commission percentage"
              />
            </Field>

            <Button
              size="sm"
              disabled={!dirty || updateServer.isPending}
              onClick={() => {
                updateServer.mutate({ fleetinCommissionPct: parsed });
                // Keep the local mirror in step so offline screens agree.
                update('commission', { fleetinCommissionPct: parsed });
              }}
              className="mb-[2px] rounded-full bg-primary px-5 text-primary-foreground"
            >
              {updateServer.isPending ? 'Saving…' : 'Save'}
            </Button>

            {touched && !valid ? (
              <span className="mb-2 text-xs font-bold text-destructive-subtle-foreground">
                Enter a percentage between 0 and 100.
              </span>
            ) : null}
          </div>

          <WorkedExample pct={valid ? parsed : (server?.fleetinCommissionPct ?? 0)} />

          {server?.updatedByName ? (
            <p className="text-xs text-muted-foreground">
              Last changed by {server.updatedByName} on{' '}
              {new Date(server.updatedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              .
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Billing" subtitle="Invoice timing and rounding">
        <FieldGrid>
          <SelectField
            label="Billing cycle"
            value={commission.billingCycle}
            onChange={(v) => update('commission', { billingCycle: v })}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'biweekly', label: 'Every two weeks' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            hint="One invoice per period, not one per shipment."
          />
          <NumberField
            label="Invoice issue day"
            value={commission.invoiceIssueDay}
            onChange={(v) => update('commission', { invoiceIssueDay: v })}
            min={0}
            max={28}
            hint="Day of month the invoice is issued. 0 means the last day."
          />
          <NumberField
            label="Rounding unit"
            value={commission.roundingUnitDjf}
            onChange={(v) => update('commission', { roundingUnitDjf: v })}
            min={1}
            suffix="DJF"
            hint="Document totals round to this. 1 keeps whole DJF."
          />
          <NumberField
            label="Minimum invoice"
            value={commission.minimumInvoiceDjf}
            onChange={(v) => update('commission', { minimumInvoiceDjf: v })}
            min={0}
            suffix="DJF"
            hint="Below this, nothing is issued and the balance rolls forward."
          />
          <SectionNote>
            Billing rules are stored in this browser. Only the commission above is server-owned.
          </SectionNote>
        </FieldGrid>
      </Panel>
    </div>
  );
}

/**
 * The rate as an actual split, on a figure an operator recognises. A
 * percentage alone is easy to read in the wrong direction — this shows which
 * side of the total each party ends up on.
 */
function WorkedExample({ pct }: { pct: number }) {
  const total = 45000;
  const fleetin = Math.round((total * pct) / 100);
  const transporter = total - fleetin;

  return (
    <div className="rounded-card border border-border bg-muted/20 p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
        On one {fmtDjf(total)} container
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ExampleLeg label="Shipper is billed" value={total} tone="in" />
        <ExampleLeg label="Transporter is paid" value={transporter} tone="out" />
        <ExampleLeg label="Fleetin commission" value={fleetin} tone="keep" />
      </div>
    </div>
  );
}

function ExampleLeg({ label, value, tone }: { label: string; value: number; tone: 'in' | 'out' | 'keep' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-lg font-black tabular-nums',
          tone === 'in' && 'text-primary-subtle-foreground',
          tone === 'out' && 'text-accent-subtle-foreground',
          tone === 'keep' && 'text-foreground',
        )}
      >
        {fmtDjf(value)}
      </p>
    </div>
  );
}
