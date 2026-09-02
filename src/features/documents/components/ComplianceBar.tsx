import { Tooltip } from '@/design-system';

import type { ComplianceTally } from '../compliance';

/*
 * There was a stacked proportion bar here — four coloured segments over the
 * required set, one per document state. It came out on 2026-09-01.
 *
 * It never said anything the row was not already saying in words. In the list
 * it sat between "24/25 on file" and "1 missing"; on the transporter's dossier
 * it sat under four labelled figures giving the same four numbers. A bar is
 * worth its space when the shape carries something the digits cannot — a
 * trend, a comparison across rows — and at 96% green with a 4% hatch it
 * carried a sliver nobody could measure by eye, under the exact number it was
 * a picture of.
 */

export function ComplianceCell({
  tally,
  vehicles,
  drivers,
}: {
  tally: ComplianceTally;
  vehicles: number;
  drivers: number;
}) {
  if (tally.required === 0) {
    return <span className="text-xs text-muted-foreground">No papers required</span>;
  }
  const held = tally.required - tally.missing;
  const clear = tally.attention === 0;
  return (
    <div className="min-w-0 space-y-1">
      <Tooltip
        content={`1 company licence · ${vehicles} vehicles × 2 · ${drivers} drivers × 1 = ${tally.required} required`}
      >
        <span className="flex items-baseline gap-1">
          <span className="font-mono text-sm font-bold tabular-nums text-foreground">
            {held}/{tally.required}
          </span>
          <span className="text-[11px] text-muted-foreground">on file</span>
        </span>
      </Tooltip>

      {/* What kind of short, not just how short. A missing paper and a lapsed
          one are chased differently — one is a phone call, the other a
          renewal — so the row names them rather than adding them up. */}
      {clear ? (
        <span className="text-[11px] text-muted-foreground">all valid</span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-semibold">
          {tally.missing > 0 && <span className="text-foreground">{tally.missing} missing</span>}
          {tally.expired > 0 && <span className="text-destructive">{tally.expired} expired</span>}
          {tally.expiring > 0 && (
            <span className="text-warning-subtle-foreground">{tally.expiring} expiring</span>
          )}
        </span>
      )}
    </div>
  );
}
