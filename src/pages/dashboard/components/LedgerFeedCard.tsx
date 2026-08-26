import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ArrowDownLeft, ArrowUpRight } from '@/design-system/icons';
import type { LedgerEntryRecord } from '@/features/finance';
import { formatMoneyMinorUnits } from '@/lib/finance';
import {
  ConsolePanel,
  PanelLink,
  PartyBadge,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

/**
 * What the book actually did, most recent first.
 *
 * These are real ledger postings, not an activity log — every row has a
 * counterparty, an amount and the person who booked it. A feed of "X updated
 * Y" tells an administrator nothing they can act on; a feed of money leaving
 * the account does, which is why this panel exists at all.
 *
 * Direction is carried twice on purpose — by the glyph and by the sign — so it
 * survives a greyscale screenshot.
 */
export function LedgerFeedCard({
  entries,
  className,
}: {
  entries: LedgerEntryRecord[];
  className?: string;
}) {
  return (
    <ConsolePanel
      className={className}
      title="Ledger Activity"
      subtitle="Newest first"
      action={
        <Link to={ROUTES.finance}>
          <PanelLink>Finance</PanelLink>
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No ledger entries yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {entries.map((entry, index) => {
            const out = entry.direction === 'OUT';
            const Glyph = out ? ArrowUpRight : ArrowDownLeft;
            return (
              <div
                key={entry.id}
                className={
                  index === entries.length - 1
                    ? 'flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5'
                    : 'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle py-2.5'
                }
              >
                <PartyBadge
                  initials={initialsOf(entry.counterpartyName)}
                  tone={out ? 'attention' : 'calm'}
                />
                <span className="min-w-[10rem] flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {entry.counterpartyName}
                  </span>
                  <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                    {entry.description || entry.type} · {entry.createdByName} ·{' '}
                    {new Date(entry.postedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Glyph
                    aria-label={out ? 'Outgoing' : 'Incoming'}
                    className={
                      out
                        ? 'size-3.5 shrink-0 text-accent-subtle-foreground'
                        : 'size-3.5 shrink-0 text-primary-subtle-foreground'
                    }
                  />
                  <span
                    className={
                      out
                        ? 'text-xs font-extrabold tabular-nums text-accent-subtle-foreground'
                        : 'text-xs font-extrabold tabular-nums text-primary-subtle-foreground'
                    }
                  >
                    {out ? '−' : '+'}
                    {formatMoneyMinorUnits(entry.amountMinorUnits, entry.currency)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ConsolePanel>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => /[a-z0-9]/i.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '—'
  );
}
