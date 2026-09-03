import { useMemo, useState } from 'react';

import { SearchField } from '@/components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconChip,
  Input,
  Label,
  Select,
  Skeleton,
} from '@/design-system';
import { Package, Plus, Route, Search, Trash2 } from '@/design-system/icons';
import {
  commissionOf,
  resolveCommission,
  useCreateProforma,
  useInvoices,
  useIssueInvoice,
} from '@/features/finance';
import { useSettings } from '@/features/settings/api/queries';
import { ShipmentLocationField } from '@/features/locations/components/ShipmentLocationField';
import { useShippers } from '@/features/shippers/api/queries';
import { useAllShipmentsRaw } from '@/features/shipments/api/queries';
import { fmtDjf, fromMinorUnits } from '@/lib/finance';
import { CompanyName } from '@/pages/empty-returns/components/marks';
import { shortPlace } from '@/features/emissions';
import { cn } from '@/utils';

/**
 * The two ways a document gets made, and they are not symmetrical.
 *
 * An **invoice** bills work that happened, so it is CHOSEN: pick the shipment,
 * and the containers, the price and the commission all come from the job. The
 * operator types nothing, because everything is already recorded and retyping
 * it is how a bill ends up disagreeing with the shipment it bills.
 *
 * A **quotation** prices work that has not happened, so it is WRITTEN: there is
 * no shipment to read from, and the lines are the operator's own.
 *
 * Both show the money as it will land — total and Fleetin's share — before the
 * button is pressed. A figure that only appears after you commit is a figure
 * you cannot check.
 */

/*
 * One grid template, written out literally and shared by the line headings and
 * the line rows. This is the whole reason the columns line up: two separate
 * flex rows guessing at each other's widths is what made the first version's
 * "PRICE EACH" heading float over the gap between two fields.
 *
 * Literal, not interpolated — Tailwind only sees classes it can read as whole
 * strings in the source, so a `sm:${TEMPLATE}` compiles to nothing and the
 * grid silently never applies.
 */
const LINE_GRID = 'grid grid-cols-[1fr_4.5rem_7.5rem_7.5rem_2rem] items-center gap-2';

/* ═══════════════════════════════════════════════════════════════════════════
 * Invoice — pick the shipment
 * ═══════════════════════════════════════════════════════════════════════ */

const DELIVERED = ['POD Submitted', 'Completed', 'Delivered'];

export function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const { data: shipments = [], isLoading } = useAllShipmentsRaw({});
  const { data: documents = [] } = useInvoices({ kind: 'invoice' });
  const issue = useIssueInvoice();

  /*
   * Only what can actually be billed. A shipment already invoiced, still on the
   * road, or carrying no price is not a choice an operator should be offered
   * and then refused — the server would reject the last two anyway, and a
   * picker that lists options it will not accept wastes a click to teach a rule.
   */
  const billable = useMemo(() => {
    const billed = new Set(
      documents.filter((doc) => doc.status !== 'Cancelled').map((doc) => doc.shipmentId).filter(Boolean),
    );
    const term = search.trim().toLowerCase();
    return shipments
      .filter(
        (shipment) =>
          shipment.clientRateMinorUnits != null &&
          DELIVERED.includes(shipment.status) &&
          !billed.has(shipment.id),
      )
      .filter((shipment) =>
        term
          ? shipment.reference.toLowerCase().includes(term) ||
            shipment.customerCompany.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => b.scheduledPickupTime.localeCompare(a.scheduledPickupTime));
  }, [shipments, documents, search]);

  const chosen = billable.find((shipment) => shipment.id === picked);

  function close() {
    setPicked(null);
    setSearch('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader title="New invoice" className="shrink-0">
          <p className="text-sm text-muted-foreground">
            Pick the delivered shipment to bill. Its containers, price and our share come from the job.
          </p>
        </DialogHeader>

        <div className="shrink-0 border-b border-border-subtle px-5 py-3 sm:px-6">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Shipment reference or client"
            matched={billable.length}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : billable.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <IconChip icon={Search} size={44} tint="neutral" />
              <p className="text-sm font-medium text-foreground">Nothing left to invoice</p>
              <p className="max-w-[22rem] text-sm text-muted-foreground">
                Every delivered, priced shipment already has one. A job still on the road, or with no
                price set, cannot be billed yet.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 py-1">
              {billable.map((shipment) => {
                const isChosen = picked === shipment.id;
                return (
                  <li key={shipment.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(shipment.id)}
                      aria-pressed={isChosen}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        isChosen
                          ? 'border-primary bg-primary-subtle'
                          : 'border-border hover:border-border-strong hover:bg-muted',
                      )}
                    >
                      <IconChip
                        icon={Package}
                        size={36}
                        tint={isChosen ? 'teal' : 'neutral'}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {shipment.reference}
                        </span>
                        <CompanyName
                          name={shipment.customerCompany}
                          className="text-xs text-muted-foreground"
                        />
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-foreground">
                          {fmtDjf(
                            fromMinorUnits(
                              shipment.clientRateMinorUnits as string,
                              shipment.clientRateCurrency ?? 'DJF',
                            ),
                          )}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {shipment.bookingCount ?? 0} container
                          {shipment.bookingCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {issue.isError ? (
          <p className="shrink-0 px-5 pb-2 text-sm text-destructive sm:px-6">
            {(issue.error as Error).message}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border-subtle">
          {/* The chosen figure repeated at the point of commitment, because the
              row that carries it may have scrolled out of sight by now. */}
          <span className="mr-auto text-sm text-muted-foreground">
            {chosen ? (
              <>
                Billing{' '}
                <span className="font-semibold text-foreground">
                  {fmtDjf(
                    fromMinorUnits(
                      chosen.clientRateMinorUnits as string,
                      chosen.clientRateCurrency ?? 'DJF',
                    ),
                  )}
                </span>
              </>
            ) : (
              'No shipment chosen'
            )}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!picked || issue.isPending}
            onClick={() =>
              picked &&
              issue.mutate(picked, {
                onSuccess: (invoice) => {
                  close();
                  onCreated(invoice.id);
                },
              })
            }
          >
            Raise invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Quotation — describe the job, then price it
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * One priced row: a size of container, how many, and what each costs.
 *
 * Structured rather than free text, because a quotation for haulage always has
 * the same shape — *this many boxes of that size, over this road* — and typing
 * it as prose means every quote describes the job differently and none of them
 * can be compared. The description that reaches the printed sheet is composed
 * from these fields.
 */
interface DraftLine {
  key: string;
  size: string;
  qty: number;
  unitAmount: number;
}

/** The sizes actually hauled, plus the escape hatch for everything else. */
const QUOTE_SIZES = [
  { value: '40ft', label: "40ft container" },
  { value: '20ft', label: "20ft container" },
  { value: '40HC', label: '40ft high-cube' },
  { value: 'reefer', label: 'Reefer container' },
  { value: 'other', label: 'Other / breakbulk' },
] as const;

const BLANK = (): DraftLine => ({
  key: Math.random().toString(36).slice(2),
  size: '40ft',
  qty: 1,
  unitAmount: 0,
});

function sizeLabel(value: string): string {
  return QUOTE_SIZES.find((size) => size.value === value)?.label ?? value;
}

export function NewQuotationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
}) {
  const [shipperId, setShipperId] = useState('');
  const [fromId, setFromId] = useState<string | null>(null);
  const [fromName, setFromName] = useState('');
  const [toId, setToId] = useState<string | null>(null);
  const [toName, setToName] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([BLANK()]);

  const { data: shipperPage } = useShippers({ limit: 200 });
  const { data: settings } = useSettings();
  const create = useCreateProforma();

  /* Read from the query's own array, not a `?? []` fallback recreated on every
     render — that new empty array is a fresh reference each time and would
     re-run the commission memo below on every keystroke. */
  const shippers = useMemo(() => shipperPage?.items ?? [], [shipperPage]);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, line.qty) * Math.max(0, line.unitAmount), 0),
    [lines],
  );
  const units = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, line.qty), 0), [lines]);

  /* The lane, as one phrase. It is the document's subject line and it is also
     appended to every line's description, so a client reading the sheet on its
     own can tell what road they are being quoted for. */
  const route = fromName && toName ? `${fromName} → ${toName}` : '';

  /* Fleetin's share as the quote stands — the client's own deal if they have
     one, else the house rate. Shown while the operator is still typing, so a
     price can be set against what it actually earns. */
  const commission = useMemo(() => {
    const deal = resolveCommission({
      shipper: shippers.find((row) => row.id === shipperId) ?? null,
      housePct: settings?.fleetinCommissionPct ?? 0,
    });
    return { ...deal, amount: commissionOf(total, deal, units) };
  }, [shippers, shipperId, settings, total, units]);

  const usable = lines.filter((line) => line.qty > 0);
  const canSubmit = shipperId !== '' && Boolean(route) && usable.length > 0 && !create.isPending;

  function patch(key: string, next: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...next } : line)));
  }

  function close() {
    setShipperId('');
    setFromId(null);
    setFromName('');
    setToId(null);
    setToName('');
    setLines([BLANK()]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader title="New quotation" className="shrink-0">
          <p className="text-sm text-muted-foreground">
            A price for work that has not happened yet. Nothing is owed against it.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {/* ── 1. Who, and over what road ── */}
          <Fieldset legend="The job">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-client">Client</Label>
              <Select
                id="quote-client"
                value={shipperId}
                onChange={(event) => setShipperId(event.target.value)}
                placeholder="Choose a shipper"
                options={shippers.map((shipper) => ({
                  value: shipper.id,
                  label: shipper.companyLegalName,
                }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Collect from</Label>
                {/* Ports first, then free zones — the direction almost every
                    job runs, so the common answer is the first one offered. */}
                <ShipmentLocationField
                  value={fromId}
                  onChange={(location) => {
                    setFromId(location?.id ?? null);
                    setFromName(location ? shortPlace(location.name) : '');
                  }}
                  preferKinds={['port', 'depot']}
                  placeholder="Port or depot"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Deliver to</Label>
                <ShipmentLocationField
                  value={toId}
                  onChange={(location) => {
                    setToId(location?.id ?? null);
                    setToName(location ? shortPlace(location.name) : '');
                  }}
                  preferKinds={['free_zone', 'customer', 'yard']}
                  placeholder="Free zone or customer site"
                />
              </div>
            </div>

            {route ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Route className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="font-medium text-foreground">{route}</span>
              </p>
            ) : null}
          </Fieldset>

          {/* ── 2. What, how many, and at what price ── */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Containers
              </h3>
              <span className="text-xs text-muted-foreground">
                {units} container{units === 1 ? '' : 's'}
              </span>
            </div>

            <div className="rounded-lg border border-border">
              <div
                className={cn(
                  LINE_GRID,
                  'hidden border-b border-border bg-surface-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid',
                )}
              >
                <span>Container</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price each</span>
                <span className="text-right">Amount</span>
                <span />
              </div>

              <div className="flex flex-col divide-y divide-border-subtle">
                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className={cn(
                      'px-3 py-2.5',
                      'grid grid-cols-[1fr_2rem] items-center gap-2',
                      'sm:grid sm:grid-cols-[1fr_4.5rem_7.5rem_7.5rem_2rem] sm:items-center sm:gap-2',
                    )}
                  >
                    <Select
                      aria-label={`Line ${index + 1} container size`}
                      className="min-w-0"
                      value={line.size}
                      onChange={(event) => patch(line.key, { size: event.target.value })}
                      options={QUOTE_SIZES.map((size) => ({ value: size.value, label: size.label }))}
                    />
                    {/* On a phone the three numbers share one row under the
                        size; the five-column grid only takes over once there is
                        width for it. */}
                    <div className="col-span-2 grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 sm:contents">
                      <Input
                        aria-label={`Line ${index + 1} quantity`}
                        type="number"
                        min={1}
                        className="text-right"
                        value={line.qty}
                        onChange={(event) => patch(line.key, { qty: Number(event.target.value) })}
                      />
                      <Input
                        aria-label={`Line ${index + 1} price each`}
                        type="number"
                        min={0}
                        step={500}
                        className="text-right"
                        value={line.unitAmount}
                        onChange={(event) => patch(line.key, { unitAmount: Number(event.target.value) })}
                      />
                      <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {fmtDjf(Math.max(0, line.qty) * Math.max(0, line.unitAmount))}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      /* The last line cannot go — a quote with no containers is
                         not a quote, and an empty form is a worse blank slate
                         than one row waiting to be filled. */
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                      className="flex size-8 shrink-0 items-center justify-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, BLANK()])}
                >
                  <Plus className="mr-1.5 size-4" />
                  Add container size
                </Button>
              </div>
            </div>

            {/* What the quote comes to, and what Fleetin keeps of it — worked
                out live, from the client's own deal where they have one. */}
            <dl className="mt-3 ml-auto w-full max-w-xs space-y-1.5 text-sm sm:w-auto">
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-muted-foreground">Quoted total</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">{fmtDjf(total)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-t border-border-subtle pt-1.5">
                <dt className="text-muted-foreground">
                  Our share{' '}
                  <span className="text-muted-foreground/70">
                    ({commission.mode === 'fixed'
                      ? `${fmtDjf(commission.fixed)} a container`
                      : `${commission.pct}%`}
                    )
                  </span>
                </dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {fmtDjf(commission.amount)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {create.isError ? (
          <p className="shrink-0 px-5 pb-2 text-sm text-destructive sm:px-6">
            {(create.error as Error).message}
          </p>
        ) : null}

        <DialogFooter className="shrink-0 border-t border-border-subtle">
          {!canSubmit && !create.isPending ? (
            /* Names what is missing rather than leaving a dead button to be
               poked at. */
            <span className="mr-auto text-sm text-muted-foreground">
              {shipperId === ''
                ? 'Choose a client'
                : !route
                  ? 'Set where it runs from and to'
                  : 'Add at least one container'}
            </span>
          ) : null}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              create.mutate(
                {
                  shipperId,
                  description: `Container haulage — ${route}`,
                  lines: usable.map((line) => ({
                    description: `${sizeLabel(line.size)}, ${route}`,
                    qty: line.qty,
                    unitAmount: line.unitAmount,
                  })),
                },
                {
                  onSuccess: (proforma) => {
                    close();
                    onCreated(proforma.id);
                  },
                },
              )
            }
          >
            Create quotation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A titled group of fields — one rule, one heading, consistent spacing. */
function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{legend}</h3>
      {children}
    </section>
  );
}
