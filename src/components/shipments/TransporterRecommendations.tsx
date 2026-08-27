import { useMemo } from 'react';

import { Badge, Button } from '@/design-system';
import { Check, PackageOpen, Zap } from '@/design-system/icons';
import { useAvailableEmpties } from '@/features/empty-returns';
import type { PartnerRecord } from '@/types/partner';
import { recommendTransporters, type TransporterScore } from '@/features/transporters/recommendation';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { cn } from '@/utils';

/**
 * The five carriers this shipment should probably go to, and why.
 *
 * Shown before the transporter picker rather than beside it, because on a
 * shipment where somebody is already holding the right empty box the answer is
 * usually one of these five and the operator should not have to hunt for it in
 * a list of forty. The manual picker is one click away and always available —
 * this ranks, it never blocks.
 *
 * Every score prints the reasons that produced it. A number a reader cannot
 * argue with is a number they cannot trust, and the one input that matters most
 * here — how many empties the carrier is sitting on — is invisible from
 * anywhere else in this wizard.
 */
export function TransporterRecommendations({
  partners,
  line,
  sizes,
  pickupAt,
  vehiclesNeeded,
  rateOf,
  considerEmpties,
  assignedPartnerIds,
  onChoose,
  onChooseManually,
}: {
  partners: PartnerRecord[];
  line: string;
  sizes: string[];
  pickupAt: number;
  vehiclesNeeded: number;
  rateOf: (partner: PartnerRecord) => number;
  /** Container shipments only — bulk and machinery have no box to reuse. */
  considerEmpties: boolean;
  assignedPartnerIds: string[];
  onChoose: (partnerId: string) => void;
  onChooseManually: () => void;
}) {
  const { data: available = [], isLoading } = useAvailableEmpties();

  const { ranked, noEmptiesAnywhere } = useMemo(
    () =>
      recommendTransporters({
        partners,
        available,
        line,
        sizes,
        pickupAt,
        vehiclesNeeded,
        rateOf,
        considerEmpties,
      }),
    [partners, available, line, sizes, pickupAt, vehiclesNeeded, rateOf, considerEmpties],
  );

  const top = ranked.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Recommended transporters
        </h4>
        <Badge variant="subtle" intent="default" size="sm">
          Top {top.length}
        </Badge>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {considerEmpties
          ? 'Scored mostly on the empty containers each carrier is already holding for this line and size — pairing one turns two trips into one and the return it was heading for never happens. Fleet size and price make up the rest.'
          : 'This shipment carries no container to reuse, so carriers are scored on fleet size and price alone.'}
      </p>

      {isLoading && considerEmpties ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">
          Checking which carriers are holding a container this shipment could take…
        </p>
      ) : (
        <>
          {considerEmpties && noEmptiesAnywhere && (
            <p className="rounded-lg border border-dashed border-border bg-card p-2.5 text-[11px] text-muted-foreground">
              No carrier is holding a container this shipment could reuse, so these are ranked on
              fleet and price alone.
            </p>
          )}

          <ol className="space-y-1.5">
            {top.map((entry, index) => (
              <RecommendationRow
                key={entry.partnerId}
                rank={index + 1}
                entry={entry}
                assigned={assignedPartnerIds.includes(entry.partnerId)}
                onChoose={() => onChoose(entry.partnerId)}
              />
            ))}
            {top.length === 0 && (
              <li className="rounded-lg border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">
                No transporters on the account yet.
              </li>
            )}
          </ol>
        </>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onChooseManually}>
        Choose manually instead
      </Button>
    </div>
  );
}

function RecommendationRow({
  rank,
  entry,
  assigned,
  onChoose,
}: {
  rank: number;
  entry: TransporterScore;
  assigned: boolean;
  onChoose: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        className={cn(
          'w-full cursor-pointer rounded-lg border p-2.5 text-left transition-colors',
          assigned
            ? 'border-primary bg-primary-subtle'
            : 'border-border/60 bg-card hover:border-primary/50 hover:bg-primary-subtle/40',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-4 shrink-0 text-center font-mono text-[11px] font-bold text-muted-foreground">
            {rank}
          </span>
          <CompanyMark
            id={entry.partnerId}
            name={entry.name}
            logoUrl={entry.logoUrl ?? undefined}
            size="xs"
          />
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
            {entry.name}
          </span>
          {assigned ? (
            <Badge variant="subtle" intent="success" size="sm">
              <Check className="h-3 w-3" />
              Assigned
            </Badge>
          ) : (
            <span className="shrink-0 font-mono text-[17px] font-extrabold leading-none text-primary-bold">
              {entry.score}%
            </span>
          )}
        </div>

        {/* The score as a bar, so five of them compare at a glance rather than
            by reading five numbers. */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <span
            className="block h-full rounded-full bg-primary-bold"
            style={{ width: `${Math.max(entry.score, 2)}%` }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {entry.reasons.map((reason, index) => (
            <span
              key={reason}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                /* The empties are the argument; everything else is context. */
                index === 0 && entry.emptiesHeld > 0
                  ? 'bg-primary-subtle text-primary-subtle-foreground'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {index === 0 && entry.emptiesHeld > 0 && <PackageOpen className="h-3 w-3" />}
              {reason}
            </span>
          ))}
        </div>
      </button>
    </li>
  );
}
