import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/utils';

import { FieldGrid, NumberField, SectionNote } from '../components/fields';

/**
 * The thresholds every badge, gauge and risk score colours against.
 *
 * Each of these answers a policy question with one number, and the reason they
 * are collected here rather than left inline is that the answer has to be the
 * same everywhere: the tab badge and the table it opens must agree about what
 * "at risk" means, or the operator stops believing either. When a transporter
 * disputes their on-time ranking, the grace window below is the number the
 * argument is actually about.
 */
export function OperationsSection() {
  const ops = useSystemSettings().operations;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof ops>) => update('operations', patch);

  const weightSum = ops.riskWeights.etaDrift + ops.riskWeights.stageDwell + ops.riskWeights.freeTime;
  const weightsBalanced = Math.abs(weightSum - 1) < 0.005;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Punctuality" subtitle="What counts as on time, and what counts as too early">
        <FieldGrid>
          <NumberField
            label="On-time grace"
            value={ops.onTimeGraceMinutes}
            onChange={(v) => set({ onTimeGraceMinutes: v })}
            min={0}
            max={4320}
            step={30}
            suffix="min"
            hint="A shipment quoted for Tuesday that arrives Tuesday evening met its commitment. 720 minutes is the working-hours reading of 'on the promised date'."
          />
          <NumberField
            label="Too-early threshold"
            value={ops.earlyThresholdMinutes}
            onChange={(v) => set({ earlyThresholdMinutes: v })}
            min={0}
            max={4320}
            step={30}
            suffix="min"
            hint="Beyond this, an early arrival is reported separately — a truck a day early is a truck waiting at a closed gate."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Targets" subtitle="The marks the gauges draw against">
        <FieldGrid columns={3}>
          <NumberField
            label="On-time target"
            value={Math.round(ops.onTimeTarget * 100)}
            onChange={(v) => set({ onTimeTarget: v / 100 })}
            min={0}
            max={100}
            suffix="%"
            hint="The contractual rate."
          />
          <NumberField
            label="Fleet utilisation target"
            value={Math.round(ops.utilizationTarget * 100)}
            onChange={(v) => set({ utilizationTarget: v / 100 })}
            min={0}
            max={100}
            suffix="%"
          />
          <NumberField
            label="Backhaul match target"
            value={Math.round(ops.backhaulMatchTarget * 100)}
            onChange={(v) => set({ backhaulMatchTarget: v / 100 })}
            min={0}
            max={100}
            suffix="%"
            hint="Share of outbound trips the matching programme aims to pair."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Empty return" subtitle="When a container becomes somebody's problem today">
        <FieldGrid>
          <NumberField
            label="Due-soon window"
            value={ops.returnDueSoonHours}
            onChange={(v) => set({ returnDueSoonHours: v })}
            min={1}
            max={240}
            suffix="hours"
            hint="Free-time headroom below this reads as due soon — still fixable if someone acts today."
          />
          <NumberField
            label="Empty-risk window"
            value={ops.emptyRiskHours}
            onChange={(v) => set({ emptyRiskHours: v })}
            min={1}
            max={168}
            suffix="hours"
            hint="A live trip arriving inside this window with no return load raises an alert."
          />
        </FieldGrid>
      </Panel>

      <Panel
        title="Risk score"
        subtitle="Blends the three independent ways a shipment goes wrong"
        action={
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-extrabold',
              weightsBalanced
                ? 'bg-success-subtle text-success-subtle-foreground'
                : 'bg-warning-subtle text-warning-subtle-foreground',
            )}
          >
            Weights sum to {weightSum.toFixed(2)}
          </span>
        }
      >
        <FieldGrid columns={3}>
          <NumberField
            label="ETA drift weight"
            value={ops.riskWeights.etaDrift}
            onChange={(v) => update('operations', { riskWeights: { etaDrift: v } })}
            min={0}
            max={1}
            step={0.05}
          />
          <NumberField
            label="Stage dwell weight"
            value={ops.riskWeights.stageDwell}
            onChange={(v) => update('operations', { riskWeights: { stageDwell: v } })}
            min={0}
            max={1}
            step={0.05}
          />
          <NumberField
            label="Free-time weight"
            value={ops.riskWeights.freeTime}
            onChange={(v) => update('operations', { riskWeights: { freeTime: v } })}
            min={0}
            max={1}
            step={0.05}
          />
          <NumberField
            label="Critical at"
            value={ops.riskCritical}
            onChange={(v) => set({ riskCritical: v })}
            min={0}
            max={100}
            hint="Score at or above which an alert draws as critical."
          />
          <NumberField
            label="Warning at"
            value={ops.riskWarning}
            onChange={(v) => set({ riskWarning: v })}
            min={0}
            max={100}
            hint="Score at or above which a trip appears in the alert table at all."
          />
          {!weightsBalanced ? (
            <SectionNote tone="warning">
              The three weights should sum to 1. At {weightSum.toFixed(2)} the score no longer runs 0–100, so the
              critical and warning thresholds above stop meaning what they say.
            </SectionNote>
          ) : null}
        </FieldGrid>
      </Panel>

      <Panel title="Corridor economics" subtitle="Behind every empty-kilometre and emissions figure">
        <FieldGrid columns={3}>
          <NumberField
            label="Empty running cost"
            value={ops.emptyCostPerKm}
            onChange={(v) => set({ emptyCostPerKm: v })}
            min={0}
            step={0.01}
            suffix="USD/km"
            hint="Fuel, tyres and wear on an empty leg. An empty 910 km return burns roughly USD 865 at 0.95."
          />
          <NumberField
            label="CO₂ loaded"
            value={ops.co2PerKmLoaded}
            onChange={(v) => set({ co2PerKmLoaded: v })}
            min={0}
            step={0.01}
            suffix="kg/km"
          />
          <NumberField
            label="CO₂ empty"
            value={ops.co2PerKmEmpty}
            onChange={(v) => set({ co2PerKmEmpty: v })}
            min={0}
            step={0.01}
            suffix="kg/km"
            hint="An empty truck still burns most of its fuel — which is why an avoided empty leg is worth stating in kg."
          />
        </FieldGrid>
      </Panel>
    </div>
  );
}
