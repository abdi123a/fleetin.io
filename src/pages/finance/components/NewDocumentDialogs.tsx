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
import { Package, Plus, Search, Trash2 } from '@/design-system/icons';
import {
  commissionOf,
  resolveCommission,
  useCreateProforma,
  useInvoices,
  useIssueInvoice,
} from '@/features/finance';
import { useSettings } from '@/features/settings/api/queries';
import { ShipmentLocationField } from '@/features/locations/components/ShipmentLocationField';
import { CONTAINER_SIZES, type ContainerSizeType } from '@/components/shipments/CreateShipmentModal';
import { usePermissions } from '@/hooks';
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
/**
 * One cargo line under a route: a size, how many, and the price each.
 *
 * Separate from the route because a lane routinely carries more than one kind
 * of box — "six 40ft and two 20ft, Doraleh to DIFTZ" is ONE road quoted twice,
 * and forcing it into two routes would repeat the lane and misreport the
 * route count.
 */
interface DraftItem {
  key: string;
  /** The wizard's own three categories — see `CARGO_KINDS`. */
  category: CargoKind;
  /** Only meaningful for `containerized`. */
  size: ContainerSizeType;
  qty: number;
  unitAmount: number;
}

/** One lane, and everything quoted on it. */
interface DraftRoute {
  key: string;
  fromId: string | null;
  fromName: string;
  toId: string | null;
  toName: string;
  items: DraftItem[];
}

/**
 * The cargo Fleetin actually moves — the SAME three the shipment wizard offers,
 * in the same words.
 *
 * The quotation had its own invented list (40ft, 20ft, high-cube, reefer,
 * breakbulk), which quoted for cargo the operations side cannot book and left
 * out bulk and machinery entirely. A quote that cannot become a shipment is a
 * quote nobody can honour, so this list is the wizard's list.
 */
type CargoKind = 'containerized' | 'bulk' | 'machinery';

const CARGO_KINDS: readonly { value: CargoKind; label: string; unit: string }[] = [
  { value: 'containerized', label: 'Container', unit: 'containers' },
  { value: 'bulk', label: 'Bulk cargo', unit: 'loads' },
  { value: 'machinery', label: 'Machinery', unit: 'units' },
];

const newKey = () => Math.random().toString(36).slice(2);

const BLANK_ITEM = (): DraftItem => ({
  key: newKey(),
  category: 'containerized',
  size: '40ft',
  qty: 1,
  unitAmount: 0,
});

const BLANK_ROUTE = (): DraftRoute => ({
  key: newKey(),
  fromId: null,
  fromName: '',
  toId: null,
  toName: '',
  items: [BLANK_ITEM()],
});

/** "40ft container" / "Bulk cargo" / "Machinery" — what the line prints as. */
function itemLabel(item: DraftItem): string {
  if (item.category === 'containerized') return `${item.size} container`;
  return CARGO_KINDS.find((kind) => kind.value === item.category)?.label ?? 'Cargo';
}

/**
 * The noun for a count, so a bulk quote does not report "3 containers" — and
 * one of anything is not "1 containers".
 */
function unitNoun(items: DraftItem[], count: number): string {
  const kinds = new Set(items.map((item) => item.category));
  const plural =
    kinds.size === 1
      ? (CARGO_KINDS.find((kind) => kind.value === [...kinds][0])?.unit ?? 'items')
      : 'items';
  return count === 1 ? plural.replace(/s$/, '') : plural;
}

/**
 * A quotation, composed route by route.
 *
 * Two levels, because that is the shape of the thing being priced: a LANE
 * (pickup → drop-off), and under it the CARGO on that lane (size × quantity ×
 * price each). One quote can hold several lanes, and each lane several kinds
 * of box.
 *
 * The route started life once at the top of the dialog, which said a quote
 * covers exactly one road; then per line, which repeated the lane for every
 * box size on it. Nesting is what the domain actually has.
 */
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
  const [routes, setRoutes] = useState<DraftRoute[]>([BLANK_ROUTE()]);

  const { data: shipperPage } = useShippers({ limit: 200 });
  const { data: settings } = useSettings();
  const create = useCreateProforma();

  /* From the query's own array, not a `?? []` fallback recreated each render —
     that new empty array is a fresh reference and would re-run the commission
     memo on every keystroke. */
  const shippers = useMemo(() => shipperPage?.items ?? [], [shipperPage]);

  /*
   * Fleetin's margin is ADMIN-ONLY, wherever it appears.
   *
   * What the client pays is the client's business and every operator's; what
   * Fleetin keeps out of it is neither. `isSuperuser` is the `*` grant
   * reserved for ADMIN — the same gate used on every other commission figure
   * in the module, because gating one screen and not the rest hides nothing.
   */
  const { isSuperuser } = usePermissions();

  /** Every priced box on the quote, flattened — the document's lines. */
  const usable = useMemo(
    () =>
      routes.flatMap((route) =>
        route.fromName && route.toName
          ? route.items
              .filter((item) => item.qty > 0)
              .map((item) => ({
                description: `${itemLabel(item)}, ${route.fromName} → ${route.toName}`,
                qty: item.qty,
                unitAmount: item.unitAmount,
                category: item.category,
              }))
          : [],
      ),
    [routes],
  );

  const total = useMemo(
    () =>
      routes.reduce(
        (sum, route) =>
          sum +
          route.items.reduce(
            (routeSum, item) => routeSum + Math.max(0, item.qty) * Math.max(0, item.unitAmount),
            0,
          ),
        0,
      ),
    [routes],
  );
  const units = useMemo(
    () =>
      routes.reduce(
        (sum, route) => sum + route.items.reduce((n, item) => n + Math.max(0, item.qty), 0),
        0,
      ),
    [routes],
  );

  const commission = useMemo(() => {
    const deal = resolveCommission({
      shipper: shippers.find((row) => row.id === shipperId) ?? null,
      housePct: settings?.fleetinCommissionPct ?? 0,
    });
    return { ...deal, amount: commissionOf(total, deal, units) };
  }, [shippers, shipperId, settings, total, units]);

  const namedRoutes = routes.filter((route) => route.fromName && route.toName);
  const canSubmit = shipperId !== '' && usable.length > 0 && !create.isPending;

  function patchRoute(key: string, next: Partial<DraftRoute>) {
    setRoutes((prev) => prev.map((route) => (route.key === key ? { ...route, ...next } : route)));
  }

  function patchItem(routeKey: string, itemKey: string, next: Partial<DraftItem>) {
    setRoutes((prev) =>
      prev.map((route) =>
        route.key === routeKey
          ? {
              ...route,
              items: route.items.map((item) => (item.key === itemKey ? { ...item, ...next } : item)),
            }
          : route,
      ),
    );
  }

  function close() {
    setShipperId('');
    setRoutes([BLANK_ROUTE()]);
    onOpenChange(false);
  }

  /* The document's subject: the single lane when there is one, otherwise the
     count. Naming one of three lanes at the top of a three-lane quote would be
     worse than naming none. */
  const onlyRoute = namedRoutes.length === 1 ? namedRoutes[0] : undefined;
  const subject = onlyRoute
    ? `Container haulage — ${onlyRoute.fromName} → ${onlyRoute.toName}`
    : namedRoutes.length > 1
      ? `Container haulage — ${namedRoutes.length} routes`
      : 'Container haulage';

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader title="New quotation" className="shrink-0">
          <p className="text-sm text-muted-foreground">
            A price for work that has not happened yet. Nothing is owed against it.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
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

          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                What we are quoting
              </h3>
              <span className="text-xs text-muted-foreground">
                {units} {unitNoun(routes.flatMap((route) => route.items), units)}
                {namedRoutes.length > 1 ? ` · ${namedRoutes.length} routes` : ''}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {routes.map((route, routeIndex) => {
                const routeTotal = route.items.reduce(
                  (sum, item) => sum + Math.max(0, item.qty) * Math.max(0, item.unitAmount),
                  0,
                );
                return (
                  <div key={route.key} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Route {routeIndex + 1}
                      </span>
                      <span className="flex items-center gap-2">
                        {routeTotal > 0 ? (
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {fmtDjf(routeTotal)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove route ${routeIndex + 1}`}
                          /* The last route cannot go — a quote with no lane is
                             not a quote. */
                          disabled={routes.length === 1}
                          onClick={() =>
                            setRoutes((prev) => prev.filter((row) => row.key !== route.key))
                          }
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </div>

                    <div className="grid gap-2.5 p-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>Pickup</Label>
                        {/* Ports first — the direction almost every job runs. */}
                        <ShipmentLocationField
                          value={route.fromId}
                          onChange={(location) =>
                            patchRoute(route.key, {
                              fromId: location?.id ?? null,
                              fromName: location ? shortPlace(location.name) : '',
                            })
                          }
                          preferKinds={['port', 'depot']}
                          placeholder="Port or depot"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Drop off</Label>
                        <ShipmentLocationField
                          value={route.toId}
                          onChange={(location) =>
                            patchRoute(route.key, {
                              toId: location?.id ?? null,
                              toName: location ? shortPlace(location.name) : '',
                            })
                          }
                          preferKinds={['free_zone', 'customer', 'yard']}
                          placeholder="Free zone or customer site"
                        />
                      </div>
                    </div>

                    {/*
                      The cargo on this lane. Several kinds are normal — six
                      40ft boxes and a bulk load can run the same road — so the
                      headings print once, above them all.

                      The container SIZE only appears for containerized cargo.
                      A size field beside "Bulk cargo" is a question with no
                      answer, and leaving it there taught operators to ignore
                      whatever it said.
                    */}
                    <div className="border-t border-border-subtle px-3 pb-3 pt-2.5">
                      <div className="mb-1.5 hidden grid-cols-[1fr_1fr_4.5rem_7.5rem_6.5rem_2rem] items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                        <span>Cargo</span>
                        <span>Size</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Price each</span>
                        <span className="text-right">Amount</span>
                        <span />
                      </div>

                      <div className="flex flex-col gap-2">
                        {route.items.map((item, itemIndex) => (
                          <div
                            key={item.key}
                            className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_1fr_4.5rem_7.5rem_6.5rem_2rem]"
                          >
                            <Select
                              aria-label={`Route ${routeIndex + 1} cargo ${itemIndex + 1} type`}
                              value={item.category}
                              onChange={(event) =>
                                patchItem(route.key, item.key, {
                                  category: event.target.value as CargoKind,
                                })
                              }
                              options={CARGO_KINDS.map((kind) => ({
                                value: kind.value,
                                label: kind.label,
                              }))}
                            />

                            {item.category === 'containerized' ? (
                              <Select
                                aria-label={`Route ${routeIndex + 1} cargo ${itemIndex + 1} size`}
                                value={item.size}
                                onChange={(event) =>
                                  patchItem(route.key, item.key, {
                                    size: event.target.value as ContainerSizeType,
                                  })
                                }
                                options={CONTAINER_SIZES.map((size) => ({
                                  value: size.value,
                                  label: size.label,
                                }))}
                              />
                            ) : (
                              <span className="hidden text-xs text-muted-foreground sm:block">—</span>
                            )}

                            <div className="col-span-2 grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 sm:contents">
                              <Input
                                aria-label={`Route ${routeIndex + 1} cargo ${itemIndex + 1} quantity`}
                                type="number"
                                min={1}
                                className="text-right"
                                value={item.qty}
                                onChange={(event) =>
                                  patchItem(route.key, item.key, { qty: Number(event.target.value) })
                                }
                              />
                              <Input
                                aria-label={`Route ${routeIndex + 1} cargo ${itemIndex + 1} price each`}
                                type="number"
                                min={0}
                                step={500}
                                className="text-right"
                                value={item.unitAmount}
                                onChange={(event) =>
                                  patchItem(route.key, item.key, {
                                    unitAmount: Number(event.target.value),
                                  })
                                }
                              />
                              <span className="text-right text-sm font-semibold tabular-nums text-foreground sm:min-w-[6.5rem]">
                                {fmtDjf(Math.max(0, item.qty) * Math.max(0, item.unitAmount))}
                              </span>
                            </div>

                            <button
                              type="button"
                              aria-label={`Remove cargo ${itemIndex + 1} from route ${routeIndex + 1}`}
                              disabled={route.items.length === 1}
                              onClick={() =>
                                patchRoute(route.key, {
                                  items: route.items.filter((row) => row.key !== item.key),
                                })
                              }
                              className="col-start-2 row-start-1 flex size-8 shrink-0 items-center justify-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:pointer-events-none disabled:opacity-30 sm:col-start-auto sm:row-start-auto"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1.5"
                        onClick={() =>
                          patchRoute(route.key, { items: [...route.items, BLANK_ITEM()] })
                        }
                      >
                        <Plus className="mr-1.5 size-4" />
                        Add cargo on this route
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setRoutes((prev) => [...prev, BLANK_ROUTE()])}
            >
              <Plus className="mr-1.5 size-4" />
              Add another route
            </Button>

            <dl className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm sm:w-auto">
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-muted-foreground">Quoted total</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">{fmtDjf(total)}</dd>
              </div>
              {isSuperuser ? (
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
              ) : null}
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
            <span className="mr-auto text-sm text-muted-foreground">
              {shipperId === '' ? 'Choose a client' : 'Give a route its pickup, drop-off and quantity'}
            </span>
          ) : null}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              create.mutate(
                { shipperId, description: subject, lines: usable },
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
