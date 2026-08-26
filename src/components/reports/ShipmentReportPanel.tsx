import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText, Printer } from '@/design-system/icons';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconChip,
  Skeleton,
} from '@/design-system';
import { useBooking } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { displayShipmentStatus, statusIntentOf } from '@/lib/shipmentStatus';
import { cn, formatDate } from '@/utils';
import { MissionReportView } from './MissionReportView';
import { computeMissionReport } from './missionReport';
import {
  ReportFootnote,
  ReportLetterhead,
  ReportSheet,
  useReportPrint,
} from './reportKit';

/**
 * The Shipment Report — the reporting system, in the shipment it belongs to.
 *
 * A shipment is a consignment; the thing that has a lifecycle, a timeline and a
 * container to give back is the **mission** inside it, one per container. So the
 * block is a picker and a document: choose a container, read its report —
 * overview, timeline, transport KPIs, container return, responsibility,
 * exceptions, in the specification's own section order.
 *
 * A picker, not a chip row or a table: a shipment can carry twenty containers,
 * and twenty of anything pushes the report itself off the screen before it is
 * read.
 *
 * Every figure is computed from recorded event timestamps (the booking's status
 * timeline, the empty-return cycle, the line's return deadline); nothing here is
 * entered by hand, which is what lets the report be generated the moment a
 * mission closes. "Download PDF" prints the sheet with the application shell
 * removed — one artefact, never a second layout to keep in step.
 */

export interface ShipmentReportPanelProps {
  bookings: BookingRecord[];
  cyclesByBookingId: Map<string, EmptyReturnCycleRecord>;
  className?: string;
}

const badgeIntentOf = (status: string) => {
  switch (statusIntentOf(status)) {
    case 'green':
      return 'success' as const;
    case 'blue':
      return 'info' as const;
    case 'orange':
      return 'warning' as const;
    default:
      return 'default' as const;
  }
};

export function ShipmentReportPanel({
  bookings,
  cyclesByBookingId,
  className,
}: ShipmentReportPanelProps) {
  const print = useReportPrint();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Follow the list: select the first container once loaded, and never point at
  // one that is no longer there.
  useEffect(() => {
    const first = bookings[0];
    if (!first) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !bookings.some((booking) => booking.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [bookings, selectedId]);

  // The per-shipment booking list omits timelines; the detail endpoint is the
  // record of events this report is computed from.
  const { data: detail, isLoading } = useBooking(selectedId ?? undefined);

  if (bookings.length === 0) return null;

  const selected = bookings.find((booking) => booking.id === selectedId);
  const context = bookings[0]?.shipment;

  return (
    <section className={cn('space-y-3', className)}>
      {/* Screen header. On paper the letterhead inside the sheet replaces it.
          Tinted, so the document below reads as its own module on the page
          rather than as loose text between two white cards. */}
      <div className="report-screen-only flex flex-wrap items-center gap-2.5 rounded-card border border-primary/15 bg-primary-subtle px-3 py-2.5 sm:px-4">
        <IconChip icon={FileText} size={36} />
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-tight text-primary-subtle-foreground sm:text-base">
            Shipment Report
          </h3>
          <p className="text-[11.5px] text-primary-subtle-foreground/75">
            One report per container · every duration computed from recorded timestamps
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Printer />}
          onClick={print}
          className="ml-auto bg-card"
        >
          Download PDF
        </Button>
      </div>

      {/* The picker — screen only; the report itself names the mission on paper. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'report-screen-only flex w-full max-w-md cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2',
              'text-xs font-semibold text-foreground shadow-2xs transition-colors hover:border-border-strong',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
            )}
          >
            <span className="font-mono">{selected?.reference ?? 'Select a container'}</span>
            {selected?.containerNumber && (
              <span className="truncate font-mono text-[11px] font-normal text-muted-foreground">
                {selected.containerNumber}
              </span>
            )}
            {selected && (
              <Badge variant="subtle" intent={badgeIntentOf(selected.status)} size="sm">
                {displayShipmentStatus(selected.status)}
              </Badge>
            )}
            <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
              {bookings.length} container{bookings.length === 1 ? '' : 's'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          {bookings.map((booking) => (
            <DropdownMenuItem
              key={booking.id}
              onSelect={() => setSelectedId(booking.id)}
              className="flex items-center gap-2"
            >
              <span className="font-mono text-xs">{booking.reference}</span>
              {booking.containerNumber && (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {booking.containerNumber}
                </span>
              )}
              <Badge
                variant="subtle"
                intent={badgeIntentOf(booking.status)}
                size="sm"
                className="ml-auto shrink-0"
              >
                {displayShipmentStatus(booking.status)}
              </Badge>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {isLoading || !detail ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <ReportSheet
          letterhead={
            <ReportLetterhead
              shipperName={context?.customerCompany || context?.customerName || 'Shipper'}
              title="Shipment Report"
              period={`${context?.reference ?? ''} · ${detail.reference}${detail.containerNumber ? ` · ${detail.containerNumber}` : ''}`}
              generatedAt={formatDate(Date.now(), 'dateTime')}
            />
          }
          footnote={<ReportFootnote />}
        >
          <MissionReport booking={detail} cycle={cyclesByBookingId.get(detail.id)} />
        </ReportSheet>
      )}
    </section>
  );
}

function MissionReport({
  booking,
  cycle,
}: {
  booking: BookingRecord;
  cycle: EmptyReturnCycleRecord | undefined;
}) {
  // Pinned per booking — a per-render clock would recompute the report (and its
  // "overrun so far" figures) on every parent render for no new fact.
  const now = useMemo(() => Date.now(), []);
  const report = useMemo(
    () => computeMissionReport({ booking, cycle, now }),
    [booking, cycle, now],
  );

  return <MissionReportView report={report} />;
}
