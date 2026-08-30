import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/design-system';
import { ChevronRight, Plus, TriangleAlert } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

import { useRecordTaskCounts } from '../api/queries';
import type { RecordType } from '../contracts';
import { RaiseTaskDialog } from './RaiseTaskDialog';

export interface RecordRaiseProps {
  recordType: RecordType;
  /** The row's uuid. */
  recordId: string;
  /** Its human reference — what the task chip will show. */
  recordRef: string;
  label?: string | null;
  size?: 'sm' | 'md';
  /**
   * `slab` inverts both controls for a filled tile — white plate, tile ink —
   * the same pair `IconChip`'s `on-teal` variant uses, and the same thing the
   * shipment masthead already does to its own actions. On a coloured slab an
   * outline button reads as a hole.
   */
  tone?: 'card' | 'slab';
  /** The tile's ink colour class, e.g. `slab.ink`. Only read when tone="slab". */
  slabInk?: string;
  className?: string;
}

/**
 * Everything Workspace puts on a domain page, and deliberately no more.
 *
 * A **Raise** button, and a count of what is still open — nothing else. There
 * is no thread here, no message bodies, nothing to scroll.
 *
 * That restraint is the point. A comment thread was mounted on the Shipment
 * Overview page on 2026-08-30 and withdrawn the same day, because a
 * conversation that lives only on a record is a dead end: nobody re-opens a
 * shipment to check whether somebody replied. Workspace inverts it — you raise
 * from the record, because that is where you are standing when you notice, and
 * you read it where the team is actually looking.
 *
 * Renders nothing at all for a portal account or an account without
 * `workspace.view`; a customer must never learn that we are talking about them.
 */
export function RecordRaise({
  recordType, recordId, recordRef, label, size = 'md', tone = 'card', slabInk, className,
}: RecordRaiseProps) {
  const { can } = usePermissions();
  const role = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);

  const isPortal = role === 'SHIPPER' || role === 'TRANSPORTER' || role === 'CLIENT';
  const allowed = !isPortal && can('workspace.view');

  const { data: counts } = useRecordTaskCounts(recordType, allowed ? [recordId, recordRef] : []);
  const openCount = counts?.[recordId] ?? counts?.[recordRef] ?? 0;

  if (!allowed) return null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {openCount > 0 ? (
        <Link
          to={`${ROUTES.workspaceAllTasks}?recordType=${recordType}&recordId=${encodeURIComponent(recordRef)}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium',
            'transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            tone === 'slab'
              ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
              : 'border-warning/30 bg-warning-subtle text-warning-bold hover:border-warning hover:bg-warning-subtle/80',
          )}
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">{openCount}</span>
          <span>open</span>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </Link>
      ) : null}

      {can('workspace.create') ? (
        <Button
          variant={tone === 'slab' ? 'secondary' : 'outline'}
          size={size === 'sm' ? 'xs' : 'sm'}
          shape="pill"
          onClick={() => setOpen(true)}
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
          className={cn(
            tone === 'slab' && `cursor-pointer bg-white ${slabInk ?? ''} shadow-xs hover:bg-white/90 active:bg-white/80`,
          )}
        >
          Raise
        </Button>
      ) : null}

      <RaiseTaskDialog
        open={open}
        onOpenChange={setOpen}
        record={{ recordType, recordId, recordRef, label }}
      />
    </div>
  );
}
