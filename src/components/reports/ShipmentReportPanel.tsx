import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ContainerIcon, Layers, Printer } from '@/design-system/icons';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconChip,
  Skeleton,
} from '@/design-system';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { displayShipmentStatus, statusBadgeIntentOf } from '@/lib/shipmentStatus';
import {
  CONTAINER_STATE_BADGE_CLASS,
  containerStateOf,
} from '@/lib/containerState';
import { cn, formatDate } from '@/utils';
import { MissionReportView } from './MissionReportView';
import { ShipmentReportView } from './ShipmentReportView';
import { computeShipmentReport } from './shipmentReport';
import { useShipmentMissionReports } from './useShipperReporting';
import { formatDuration } from './reportFormat';
import {
  ReportFootnote,
  ReportLetterhead,
  ReportSheet,
  useReportPrint,
} from './reportKit';

/**
 * The Shipment Report — the reporting system, in the shipment it belongs to.
 *
 * Two documents behind one masthead, and the shipment is the one that opens.
 *
 * It used to be only the second of them. A shipment is a consignment and the
 * thing with a timeline is the **mission** inside it, one per container — so
 * the block was a picker and a document: choose a container, read its report.
 * Which meant that opening a four-container shipment showed the reader an
 * arbitrary one of its four containers and made them work out the consignment
 * themselves. The question a person has when they open a shipment is about the
 * shipment.
 *
 * So the default scope is the whole consignment — every container's report,
 * aggregated — and the picker is still there, one click away, for the moment
 * the reader wants a single box. The rail in the shipment view doubles as that
 * picker: clicking a container swaps the sheet to its own mission report.
 *
 * The masthead is deliberately a filled band in **`--primary`, the brand
 * colour itself** — the user's call, and the same flat #60969D with white text
 * the sidebar wears, rather than the darker `--primary-bold` this first used.
 * It is a band rather than the plain label row it replaced. Everything above this block on the page *changes*
 * bookings — status pickers, the preview sheet, the cards — and a quiet grey
 * control row read as one more of them. This band reads as a document header,
 * which is what it is.
 *
 * Every figure in both documents is computed from recorded event timestamps
 * (the booking's status timeline, the empty-return cycle, the line's return
 * deadline); nothing here is entered by hand, which is what lets a report be
 * generated the moment a mission closes. "Download PDF" prints whichever sheet
 * is open with the application shell removed.
 */

export interface ShipmentReportPanelProps {
  bookings: BookingRecord[];
  cyclesByBookingId: Map<string, EmptyReturnCycleRecord>;
  className?: string;
}

/** Which document the sheet is showing. */
type Scope = 'shipment' | 'container';

/**
 * Every row here is one container, so it takes the app-wide container pair —
 * teal while the box is full, brand yellow once it is empty. The same chip on
 * the booking card above this panel says the same thing in the same colour.
 */
/** The ink classes a finished container's chip needs — no `Badge` intent carries them. */
const badgeClassOf = (booking: { status: string; containerNumber?: string | null }) => {
  const state = containerStateOf(booking.status, Boolean(booking.containerNumber));
  return state ? CONTAINER_STATE_BADGE_CLASS[state] : '';
};

/* The ladder's phase, not the container's state — see `statusBadgeIntentOf`.
   The report prints a container tag of its own alongside this. */
const badgeIntentOf = (booking: { status: string }) => statusBadgeIntentOf(booking.status);

export function ShipmentReportPanel({
  bookings,
  cyclesByBookingId,
  className,
}: ShipmentReportPanelProps) {
  const print = useReportPrint();
  const [scope, setScope] = useState<Scope>('shipment');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pinned once per mount: a per-render clock would recompute every report (and
  // its "overrun so far" figures) on each parent render for no new fact.
  const now = useMemo(() => Date.now(), []);

  /* Both documents read the same objects. The shipment's analytics ARE the
     aggregate of the very mission reports the picker opens, which is the only
     way to guarantee that the consignment's figures and a container's figures
     never disagree. */
  const { reports, isLoading, loaded, total } = useShipmentMissionReports(
    bookings,
    cyclesByBookingId,
    now,
  );

  const shipmentReport = useMemo(() => computeShipmentReport(reports, now), [reports, now]);

  // Follow the list: never point at a container that is no longer there.
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

  if (bookings.length === 0) return null;

  const selectedIndex = bookings.findIndex((booking) => booking.id === selectedId);
  const selected = selectedIndex >= 0 ? bookings[selectedIndex] : undefined;
  const context = bookings[0]?.shipment;
  const selectedReport = reports.find((report) => report.bookingId === selectedId) ?? null;

  const openContainer = (bookingId: string) => {
    setSelectedId(bookingId);
    setScope('container');
  };

  const isShipmentScope = scope === 'shipment';
  const ret = shipmentReport.containerReturn;

  /* The band's second line, and the rule it follows: it may only carry figures
     the title cannot. In shipment scope that is the shape of the consignment;
     in container scope it is where that one box has got to. */
  const headline = isShipmentScope
    ? [
        `${shipmentReport.containers.total} container${shipmentReport.containers.total === 1 ? '' : 's'}`,
        ret.withBox > 0 ? `${ret.returned} home · ${ret.out} out` : null,
        shipmentReport.time.spanMs !== null
          ? formatDuration(shipmentReport.time.spanMs, { compact: true })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : [
        selected?.containerNumber,
        selectedIndex >= 0 ? `container ${selectedIndex + 1} of ${bookings.length}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <section className={cn('space-y-3', className)}>
      {/* ── The masthead ─────────────────────────────────────────────────
          Screen only. On paper the letterhead is the document's header, and
          printing a scope switcher would be printing a control. */}
      <div className="report-screen-only flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-primary px-4 py-3.5 text-primary-foreground shadow-xs">
        <IconChip icon={isShipmentScope ? Layers : ContainerIcon} tint="on-teal" size={44} />
        <div className="min-w-0 flex-1 basis-52">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-75">Analytics</p>
          <h3 className="truncate text-base font-bold leading-tight sm:text-[17px]">
            {isShipmentScope ? 'Whole Shipment' : `Booking ${selected?.reference ?? ''}`}
          </h3>
          {headline && (
            <p className="mt-0.5 truncate font-mono text-[11.5px] tabular-nums opacity-85">
              {headline}
            </p>
          )}
        </div>

        {/* The scope switch. Two documents, one control: the left half is the
            consignment, the right half is whichever container is selected —
            and it is the dropdown as well, so choosing a box and switching to
            it are the same gesture rather than two. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-white/15 p-1">
            <button
              type="button"
              onClick={() => setScope('shipment')}
              aria-pressed={isShipmentScope}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                isShipmentScope
                  ? 'bg-white text-primary shadow-2xs'
                  : 'text-primary-foreground/85 hover:bg-white/10',
              )}
            >
              Whole shipment
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-pressed={!isShipmentScope}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                    !isShipmentScope
                      ? 'bg-white text-primary shadow-2xs'
                      : 'text-primary-foreground/85 hover:bg-white/10',
                  )}
                >
                  <span className="max-w-[13ch] truncate">
                    {isShipmentScope ? 'One container' : (selected?.reference ?? 'One container')}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
                <DropdownMenuLabel>Read one container's own report</DropdownMenuLabel>
                {bookings.map((booking) => (
                  <DropdownMenuItem
                    key={booking.id}
                    onSelect={() => openContainer(booking.id)}
                    className="flex items-center gap-2"
                  >
                    <span className="shrink-0 font-mono text-xs">{booking.reference}</span>
                    {booking.containerNumber && (
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {booking.containerNumber}
                      </span>
                    )}
                    <Badge
                      variant="subtle"
                      intent={badgeIntentOf(booking)}
                      size="sm"
                      className={`ml-auto shrink-0 ${badgeClassOf(booking)}`}
                    >
                      {displayShipmentStatus(booking.status)}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Printer />}
            onClick={print}
            className="border-white/40 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
          >
            Download PDF
          </Button>
        </div>
      </div>

      {isLoading || (!isShipmentScope && !selectedReport) ? (
        <div className="space-y-3">
          {total > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Reading {loaded} of {total} container timelines…
            </p>
          )}
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <ReportSheet
          letterhead={
            <ReportLetterhead
              shipperName={context?.customerCompany || context?.customerName || 'Shipper'}
              title={isShipmentScope ? 'Shipment Analytics' : 'Container Report'}
              period={
                isShipmentScope
                  ? `${context?.reference ?? ''} · ${shipmentReport.containers.total} container${shipmentReport.containers.total === 1 ? '' : 's'}`
                  : `${context?.reference ?? ''} · ${selectedReport?.overview.missionId ?? ''}${selectedReport?.overview.containerNumber ? ` · ${selectedReport.overview.containerNumber}` : ''}`
              }
              generatedAt={formatDate(now, 'dateTime')}
            />
          }
          footnote={<ReportFootnote />}
        >
          {isShipmentScope ? (
            <ShipmentReportView report={shipmentReport} />
          ) : (
            selectedReport && <MissionReportView report={selectedReport} />
          )}
        </ReportSheet>
      )}
    </section>
  );
}
