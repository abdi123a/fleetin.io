import { Input, Select } from '@/design-system';
import { useSettings } from '@/features/settings/api/queries';

import type { CommissionMode } from '../model/commission';

/**
 * The deal, as three fields that behave like one.
 *
 * Fleetin's cut is negotiated per counterparty and comes in two shapes, so the
 * control is a MODE first and an amount second:
 *
 *   - **House rate** — no special deal. The rate under Settings applies, and
 *     this record follows it wherever it moves. The default, and the one most
 *     records stay on.
 *   - **Custom percentage** — a share of what the client is billed, at a rate
 *     agreed with this counterparty rather than the house one.
 *   - **Flat fee** — a fixed amount, charged once per container. A
 *     five-container shipment owes five fees, and the field and its hint both
 *     say "per container", because read as "per shipment" that is a
 *     five-fold error.
 *
 * The two option labels name the SHAPE of the deal, not a sentence about it:
 * a reader picking from this list is choosing between a percentage and a flat
 * amount, and "Percentage of the job" / "Fixed fee per container" spent the
 * width restating what the fields underneath already spell out.
 *
 * The mode is what records a deal, never the amount. That is why "house rate"
 * is an explicit choice rather than an empty box: a negotiated **0%** is a real
 * commercial decision — a favour, a first job — and it has to be storable
 * without being indistinguishable from a field nobody filled in.
 *
 * Identical on the shipper and on the transporter on purpose. The two are the
 * same negotiation from opposite ends, and two forms that drift apart give the
 * resolver two shapes to reconcile.
 */
export interface CommissionValue {
  commissionMode: CommissionMode | null;
  commissionPct: number | null;
  commissionFixedAmount: number | null;
}

export function CommissionFields({
  value,
  onChange,
  counterparty,
  idPrefix,
}: {
  value: CommissionValue;
  onChange: (next: CommissionValue) => void;
  /** Shapes the wording only — the fields and their meaning are identical. */
  counterparty: 'shipper' | 'transporter';
  idPrefix: string;
}) {
  const { data: settings } = useSettings();
  const housePct = settings?.fleetinCommissionPct ?? 0;
  const mode = value.commissionMode ?? 'house';

  const setMode = (next: string) => {
    if (next === 'house') {
      // Clearing the mode clears the deal. The amounts go with it rather than
      // lingering as a value that is stored but no longer applied.
      onChange({ commissionMode: null, commissionPct: null, commissionFixedAmount: null });
      return;
    }
    onChange({
      commissionMode: next as CommissionMode,
      commissionPct: next === 'percent' ? (value.commissionPct ?? housePct) : null,
      commissionFixedAmount: next === 'fixed' ? (value.commissionFixedAmount ?? 0) : null,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-commission-mode`} className="block type-caption font-medium text-foreground">
          Our commission
        </label>
        <Select
          id={`${idPrefix}-commission-mode`}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          options={[
            { value: 'house', label: `House rate — ${housePct}%` },
            { value: 'percent', label: 'Custom percentage' },
            { value: 'fixed', label: 'Flat fee' },
          ]}
        />
        <p className="type-body-xs text-muted-foreground">
          {mode === 'house'
            ? `Follows Settings. Changing the house rate changes what this ${counterparty} is charged.`
            : mode === 'percent'
              ? 'Overrides the house rate for every shipment on this account.'
              : 'Charged once per container, whatever the shipment is priced at.'}
        </p>
      </div>

      {mode === 'percent' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-commission-pct`} className="block type-caption font-medium text-foreground">
            Percentage
          </label>
          <Input
            id={`${idPrefix}-commission-pct`}
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={value.commissionPct ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                commissionPct: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            placeholder="7.5"
          />
          <p className="type-body-xs text-muted-foreground">
            Of what the client is billed. 0 is allowed and means we take nothing.
          </p>
        </div>
      ) : null}

      {mode === 'fixed' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-commission-fixed`} className="block type-caption font-medium text-foreground">
            Fee per container (DJF)
          </label>
          <Input
            id={`${idPrefix}-commission-fixed`}
            type="number"
            min={0}
            step={100}
            value={value.commissionFixedAmount ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                commissionFixedAmount: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            placeholder="5000"
          />
          <p className="type-body-xs text-muted-foreground">
            {value.commissionFixedAmount
              ? `A 5-container shipment earns ${(value.commissionFixedAmount * 5).toLocaleString('en-US')} DJF.`
              : 'Multiplied by the number of containers on each shipment.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
