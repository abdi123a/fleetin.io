import { useState } from 'react';

import { TablePager, usePagedRows } from '@/components/common/TablePager';
import { Badge, Card } from '@/design-system';
import { ChevronDown, ChevronRight } from '@/design-system/icons';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { ContainerRowCard } from './ContainerRowCard';

/**
 * One urgency band of the Control Tower queue.
 *
 * A heading, a count badge, a stack of row cards and a pager — the same shape
 * the Shipments directory has, because this is the same kind of list and an
 * operator moving between the two should not have to relearn it.
 *
 * **Every band pages.** A Closed band holding 483 containers is not a list
 * anybody reads, it is a scroll they abandon; twelve rows at a time makes
 * opening it cost one screen instead of forty, and page 4 is an address
 * somebody can come back to. The two urgent bands stay open, the two calm ones
 * start collapsed.
 */
export interface ContainerQueueSectionProps {
  title: string;
  /** One line saying what this band means — the grouping is editorial, so it explains itself. */
  hint: string;
  /** Class for the band's own heading colour. */
  tone: string;
  rows: EmptyReturnRecord[];
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  /** Bands nobody has to act on start closed. */
  collapsible?: boolean;
  emptyCopy: string;
  /** Anything that changes what the band contains, so paging resets to page 1. */
  resetKey?: unknown;
}

export function ContainerQueueSection({
  title,
  hint,
  tone,
  rows,
  now,
  onOpen,
  collapsible = false,
  emptyCopy,
  resetKey,
}: ContainerQueueSectionProps) {
  const [open, setOpen] = useState(!collapsible);
  const [pageSize, setPageSize] = useState(12);
  const paged = usePagedRows(rows, { pageSize, resetKey });

  return (
    <section className="min-w-0 space-y-3">
      <button
        type="button"
        disabled={!collapsible}
        onClick={() => collapsible && setOpen((value) => !value)}
        aria-expanded={collapsible ? open : undefined}
        // The visible label is three nested spans, which assistive tech reads
        // as a run-on string; name the control by what it does instead.
        aria-label={
          collapsible
            ? `${open ? 'Collapse' : 'Expand'} ${title} — ${rows.length} containers`
            : `${title} — ${rows.length} containers`
        }
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsible ? 'cursor-pointer hover:bg-secondary/40' : 'cursor-default',
        )}
      >
        {collapsible &&
          (open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ))}
        <span className="min-w-0">
          <span className={cn('flex items-center gap-2 text-base font-bold', tone)}>
            {title}
            <Badge variant="subtle" intent="primary" size="sm" className="font-bold">
              {rows.length}
            </Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
        </span>
      </button>

      {open &&
        (rows.length === 0 ? (
          <Card className="rounded-lg border border-border/80 p-8 text-center text-sm text-muted-foreground">
            {emptyCopy}
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {paged.rows.map((record) => (
                <ContainerRowCard key={record.id} record={record} now={now} onOpen={onOpen} />
              ))}
            </div>

            <TablePager
              paged={paged}
              noun="containers"
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
            />
          </>
        ))}
    </section>
  );
}
