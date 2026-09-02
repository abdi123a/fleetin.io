import { Tooltip } from '@/design-system';
import { Building2, Clock, FileCheck, FileX, Truck, User } from '@/design-system/icons';
import { cn } from '@/utils';

import type { ComplianceGroup, ComplianceTally } from '../compliance';

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

/**
 * One line: company, drivers, trucks — how many of each are papered.
 *
 * `7/8`, not `8 −1`. A shortfall alone is a number you have to do arithmetic
 * on before you know whether it matters — one truck short of two is half the
 * fleet grounded, one short of forty is a Tuesday — and the minus sign made
 * every row read as a deficit even where nothing was wrong.
 *
 * Icon, word, fraction — stacked, three rows. Run onto one line the fractions
 * ran together into number soup; reduced to icons alone they were three
 * unlabelled ratios that had to be decoded before they could be read. The word
 * is what makes a glance work, and at 10px beside a 3.5px glyph it costs a
 * column this table can afford.
 *
 * The unit is *records*, not papers: one truck missing two certificates is one
 * truck that cannot leave, which is what a dispatcher scanning this list is
 * counting. The paper-level split is on the hover and in full on the dossier.
 */
const GROUPS: {
  key: 'PARTNER' | 'VEHICLE' | 'DRIVER';
  label: string;
  hint: string;
  icon: typeof Building2;
}[] = [
  { key: 'PARTNER', label: 'Business', hint: 'Company papers', icon: Building2 },
  { key: 'DRIVER', label: 'Drivers', hint: 'Drivers fully papered', icon: User },
  { key: 'VEHICLE', label: 'Vehicles', hint: 'Vehicles fully papered', icon: Truck },
];

export function ComplianceCell({
  tally,
  groups,
}: {
  tally: ComplianceTally;
  groups: Record<'PARTNER' | 'VEHICLE' | 'DRIVER', ComplianceGroup>;
}) {
  if (tally.required === 0) {
    return <span className="text-xs text-muted-foreground">No papers required</span>;
  }
  /* A grid, not three flex rows: the fractions have to land in one column for
     a reader to compare them down the page. */
  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-1">
      {GROUPS.map(({ key, label, hint, icon: Icon }) => {
        const group = groups[key];
        if (group.total === 0) return null;
        const papered = group.total - group.short;
        const short = group.short > 0;
        return (
          <Tooltip
            key={key}
            content={`${hint}: ${papered} of ${group.total}${
              short ? ` · ${group.short} to chase` : ''
            }`}
          >
            <div className="col-span-3 grid grid-cols-subgrid items-center">
              <Icon
                className={cn(
                  'size-3.5 shrink-0',
                  short ? 'text-destructive' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</span>
              <span
                className={cn(
                  'font-mono text-[11px] font-bold tabular-nums',
                  short ? 'text-destructive' : 'text-foreground',
                )}
              >
                {papered}/{group.total}
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * One owner's papers, for a row that has only one set of them.
 *
 * `ComplianceCell` above rolls a transporter up over three groups, because a
 * haulier is its own licence plus every truck's and every driver's. A driver, a
 * truck or a shipper has exactly one group, and drawing that as a
 * three-row subgrid with two rows empty spends a column saying "1/1" in the
 * most elaborate way available.
 *
 * So: a fraction, and a glyph for the worst thing wrong with it. The escalation
 * is the same one the fleet's expiry dates use — in order, nothing is worse
 * than a paper that is missing or lapsed, then one about to lapse, then all in
 * order — and the hover carries the breakdown, because a column this narrow can
 * hold a number or an explanation and not both.
 */
export function OwnerComplianceCell({ tally }: { tally?: ComplianceTally }) {
  /* Optional so three call sites do not each keep a zeroed tally around to pass
     while the document book is still in flight. */
  if (!tally || tally.required === 0) {
    return <span className="text-xs text-muted-foreground">No papers required</span>;
  }

  const short = tally.missing + tally.expired;
  const state = short > 0 ? 'short' : tally.expiring > 0 ? 'expiring' : 'valid';
  /* Document glyphs, not generic status ones — this is a Documents column, and
     a bare tick beside a fraction could as easily be a verification badge. The
     file family says what the fraction counts before the number is read.
     `expiring` keeps the clock because the curated set has no file-with-clock,
     and time is the thing that is wrong with it — the same clock the fleet's
     expiry dates wear inside their last fortnight. */
  const { Icon, tone } = {
    short: { Icon: FileX, tone: 'text-destructive' },
    expiring: { Icon: Clock, tone: 'text-urgency-watch-fg' },
    valid: { Icon: FileCheck, tone: 'text-urgency-safe-fg' },
  }[state];

  /* Named in the order they need chasing, and only where there is something to
     chase — a hover reading "0 expired · 0 expiring" is worse than no hover. */
  const detail =
    [
      tally.missing > 0 ? `${tally.missing} missing` : null,
      tally.expired > 0 ? `${tally.expired} expired` : null,
      tally.expiring > 0 ? `${tally.expiring} expiring soon` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'All papers on file and in date';

  return (
    <Tooltip content={`${tally.valid} of ${tally.required} in order — ${detail}`}>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Icon className={cn('size-3.5 shrink-0', tone)} aria-hidden />
        <span className={cn('font-mono text-[11px] font-bold tabular-nums', tone)}>
          {tally.valid}/{tally.required}
        </span>
      </span>
    </Tooltip>
  );
}
