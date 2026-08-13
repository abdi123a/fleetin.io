import { create } from 'zustand';

import {
  FINANCE_BOOKINGS,
  FINANCE_CLIENTS,
  FINANCE_DEFAULT_SETTINGS,
  FINANCE_INVOICES,
  FINANCE_MOVEMENTS,
  FINANCE_PAYMENTS,
  FINANCE_PROJECTS,
  FINANCE_SHIPMENTS,
  FINANCE_TICK_MS,
  FINANCE_TRANSPORTERS,
  FUNDING_SOURCES,
} from '@/data/financeData';
import { nextId } from '@/lib/ids';
import {
  HOUR_MS,
  buildFundingPosition,
  buildShipmentInvoice,
  canDraw,
  canRelease,
  clockLabel,
  isEarlyRelease,
  isHeld,
  releaseBlocker,
  settlementFor,
  shipmentProvenAt,
  unprovenBookings,
  validationClock,
  withHold,
  withHoldCleared,
  withPodConfirmed,
  withSettlementPaid,
  withShipmentReleased,
} from '@/lib/finance';
import type {
  ClientInvoice,
  FinanceBooking,
  FinanceClient,
  FinanceProject,
  FinanceSettings,
  FinanceShipment,
  FinanceTransporter,
  FundingSource,
  HoldCategory,
  LedgerMovement,
  OriginationChannel,
  PaymentMethod,
  PodDocument,
  RateSource,
  ShipmentPayment,
} from '@/types/finance';

/**
 * The finance module's single source of truth.
 *
 * Seven routes share this store, so nothing money-shaped survives in a page
 * component. Every transition goes through the pure engine in `@/lib/finance`
 * — the store's job is to apply guards, keep the ledger consistent with the
 * shipment board (a release APPENDS the draw that funds it), mint references
 * through `@/lib/ids`, and narrate what it did through one toast.
 *
 * Rules enforced here, not in the UI:
 * - PoD is per CONTAINER and refuses without BOTH proofs — signed note and
 *   photograph. Confirming the last one issues the shipment's invoice.
 * - Release is per SHIPMENT and refuses while any booking is unproven, or
 *   while a hold is open. An open validation window is reported, never
 *   refused.
 * - Payment is per TRANSPORTER per SHIPMENT: one action settles every booking
 *   that party carried, under one voucher reference. There is deliberately no
 *   way to pay a single container — that was the old model's mistake.
 * - A draw refuses without headroom on its funding source;
 * - repayments are pool lumps — no draw matching exists anywhere;
 * - a credit-line invoice marked paid auto-restores the line's availability
 *   (the client repaid THE BANK, that is what a revolving line is);
 * - reminders only exist for sources where Fleetin carries the risk.
 */
interface FinanceStoreState {
  shipments: FinanceShipment[];
  bookings: FinanceBooking[];
  invoices: ClientInvoice[];
  payments: ShipmentPayment[];
  movements: LedgerMovement[];
  sources: FundingSource[];
  clients: FinanceClient[];
  transporters: FinanceTransporter[];
  projects: FinanceProject[];
  settings: FinanceSettings;
  now: number;
  toast: string | null;

  setNow: (now: number) => void;
  dismissToast: () => void;

  /** Per container. Issues the shipment invoice if this was the last one. */
  confirmPod: (bookingId: string, documents: PodDocument[]) => void;
  raiseHold: (
    shipmentId: string,
    category: HoldCategory,
    reason: string,
    bookingId?: string,
  ) => void;
  clearHold: (shipmentId: string, holdId: string) => void;
  /** One release for the whole consignment. */
  releaseShipment: (shipmentId: string) => void;
  /**
   * Pay one transporter everything they are owed on one shipment, in one
   * transfer, under one `PAY-#####` voucher.
   */
  payTransporter: (
    shipmentId: string,
    transporterId: string,
    method?: PaymentMethod,
    paymentRef?: string,
  ) => void;
  /** The signed voucher came back. */
  acknowledgePayment: (paymentId: string, signedBy: string) => void;
  confirmDraw: (movementId: string) => void;
  recordRepayment: (fundingSourceId: string, amountDjf: number) => void;
  markInvoicePaid: (invoiceId: string) => void;
  sendReminder: (invoiceId: string) => void;
  setBookingRate: (bookingId: string, rateDjf: number, rateSource: RateSource) => void;
  updateSettings: (patch: Partial<FinanceSettings>) => void;
  /** New project for a client, with the contract dates this repo now tracks. */
  addProject: (input: {
    clientId: string;
    channel: OriginationChannel;
    fundingSourceId: string;
    name: string;
    scope?: string;
    contractRef?: string;
    startedAt: string;
    contractEndAt?: string | null;
  }) => FinanceProject;
  /**
   * Ends a project's contract: issues one closing invoice for any priced
   * work that hasn't been billed yet, then marks the project completed.
   */
  closeProjectContract: (projectId: string) => void;
}

const ACTOR = 'finance.desk';

/** The bookings belonging to one shipment. Used by nearly every action. */
const bookingsOf = (bookings: FinanceBooking[], shipmentId: string): FinanceBooking[] =>
  bookings.filter((booking) => booking.shipmentId === shipmentId);

export const useFinanceStore = create<FinanceStoreState>((set, get) => ({
  shipments: FINANCE_SHIPMENTS,
  bookings: FINANCE_BOOKINGS,
  invoices: FINANCE_INVOICES,
  payments: FINANCE_PAYMENTS,
  movements: FINANCE_MOVEMENTS,
  sources: FUNDING_SOURCES,
  clients: FINANCE_CLIENTS,
  transporters: FINANCE_TRANSPORTERS,
  projects: FINANCE_PROJECTS,
  settings: FINANCE_DEFAULT_SETTINGS,
  now: Date.now(),
  toast: null,

  setNow: (now) => set({ now }),
  dismissToast: () => set({ toast: null }),

  confirmPod: (bookingId, documents) => {
    const { bookings, shipments, invoices, clients, now } = get();
    const booking = bookings.find((entry) => entry.id === bookingId);
    if (!booking || booking.proof.podSentAt) return;

    const updated = withPodConfirmed(booking, now, documents);
    // The engine refuses an incomplete proof set by returning the booking
    // untouched. Say so rather than failing silently.
    if (!updated.proof.podSentAt) {
      set({
        toast: `${bookingId} needs both proofs — the signed delivery note AND the delivery photo`,
      });
      return;
    }

    const nextBookings = bookings.map((entry) => (entry.id === bookingId ? updated : entry));
    const shipment = shipments.find((entry) => entry.id === booking.shipmentId);
    const own = bookingsOf(nextBookings, booking.shipmentId);
    const stillMissing = unprovenBookings(own);

    /*
     * The last container's proof completes the consignment: THAT is when the
     * client's terms start and the one invoice for the whole shipment issues.
     * Confirming container 7 of 20 changes nothing financial, and the toast
     * has to say so or the desk will think it did.
     */
    if (stillMissing.length > 0 || !shipment) {
      set({
        bookings: nextBookings,
        toast: `PoD confirmed for ${bookingId} — ${stillMissing.length} booking${
          stillMissing.length === 1 ? '' : 's'
        } still unproven on ${booking.shipmentId}, so its payout stays blocked`,
      });
      return;
    }

    const provenAt = shipmentProvenAt(own) ?? new Date(now).toISOString();
    const priced = own.filter((entry) => entry.clientRateDjf !== null);
    const nextInvoices = [...invoices];
    let nextShipments = shipments;

    if (priced.length > 0 && !shipment.invoiceId) {
      const client = clients.find((entry) => entry.id === shipment.clientId);
      const terms = client?.paymentTermsDays ?? 30;
      const invoice = buildShipmentInvoice(shipment, own, nextId('invoice'), terms, provenAt);
      if (!invoice) return; // priced.length > 0 guarantees this never fires
      nextInvoices.push(invoice);
      nextShipments = shipments.map((entry) =>
        entry.id === shipment.id ? { ...entry, invoiceId: invoice.id } : entry,
      );
      const unpricedCount = own.length - priced.length;
      set({
        bookings: nextBookings,
        shipments: nextShipments,
        invoices: nextInvoices,
        toast: `${shipment.id} fully proven — payout can be released, ${invoice.id} issued for ${
          priced.length
        } booking${priced.length === 1 ? '' : 's'}${
          unpricedCount > 0 ? ` (${unpricedCount} unpriced and NOT billed)` : ''
        }`,
      });
      return;
    }

    set({
      bookings: nextBookings,
      toast: `${shipment.id} fully proven — payout can be released. Every booking is UNPRICED: no invoice can be issued`,
    });
  },

  raiseHold: (shipmentId, category, reason, bookingId) => {
    const { shipments, now } = get();
    const shipment = shipments.find((entry) => entry.id === shipmentId);
    if (!shipment || shipment.payout.releasedAt) return;
    const updated = withHold(shipment, {
      id: nextId('hold'),
      bookingId,
      category,
      reason,
      raisedBy: ACTOR,
      raisedAt: new Date(now).toISOString(),
    });
    set({
      shipments: shipments.map((entry) => (entry.id === shipmentId ? updated : entry)),
      toast: `${shipmentId} held${
        bookingId ? ` over ${bookingId}` : ''
      } — the validation counter is paused where it stands`,
    });
  },

  clearHold: (shipmentId, holdId) => {
    const { shipments, now } = get();
    const shipment = shipments.find((entry) => entry.id === shipmentId);
    if (!shipment) return;
    const updated = withHoldCleared(shipment, holdId, now, ACTOR);
    set({
      shipments: shipments.map((entry) => (entry.id === shipmentId ? updated : entry)),
      toast: `Hold cleared on ${shipmentId} — counter resumes where it stopped, not from zero`,
    });
  },

  releaseShipment: (shipmentId) => {
    const { shipments, bookings, movements, sources, settings, now } = get();
    const shipment = shipments.find((entry) => entry.id === shipmentId);
    if (!shipment) return;
    const own = bookingsOf(bookings, shipmentId);

    const windowMs = settings.validationWindowHours * HOUR_MS;
    /*
     * Only unproven containers and open disputes stop money. The clock is read
     * AFTER this guard, purely so the toast can say the window was closed
     * early — it is never a reason to refuse.
     */
    if (!canRelease(shipment, own)) {
      const blocker = releaseBlocker(shipment, own);
      const missing = unprovenBookings(own);
      const message =
        blocker === 'held'
          ? `${shipmentId} is on hold — clear the hold before releasing`
          : blocker === 'incomplete_pod'
            ? `${shipmentId} has ${missing.length} booking${
                missing.length === 1 ? '' : 's'
              } without proof of delivery (${missing
                .slice(0, 3)
                .map((booking) => booking.id)
                .join(', ')}${missing.length > 3 ? '…' : ''}) — confirm every PoD first`
            : blocker === 'no_bookings'
              ? `${shipmentId} has no bookings to release`
              : `${shipmentId} is already released`;
      set({ toast: message });
      return;
    }
    const early = isEarlyRelease(shipment, own, now, windowMs);
    const remaining = validationClock(shipment, own, now, windowMs).remainingMs;

    // The release and the draw that funds the whole consignment are one event.
    const source = sources.find((entry) => entry.id === shipment.fundingSourceId);
    const total = own.reduce(
      (sum, booking) => sum + booking.costLines.reduce((s, line) => s + line.amountDjf, 0),
      0,
    );
    if (source) {
      const position = buildFundingPosition(source, movements);
      if (!canDraw(position, total)) {
        set({
          toast: `Cannot release ${shipmentId}: ${source.id} has ${position.availableDjf.toLocaleString()} DJF headroom, needs ${total.toLocaleString()}`,
        });
        return;
      }
    }

    const updated = withShipmentReleased(shipment, own, now, ACTOR);
    const draw: LedgerMovement = {
      id: nextId('draw'),
      fundingSourceId: shipment.fundingSourceId,
      kind: 'draw',
      amountDjf: total,
      date: new Date(now).toISOString(),
      shipmentId: shipment.id,
      confirmed: false,
      note: `Funded payout for ${shipment.id} — ${own.length} booking${own.length === 1 ? '' : 's'}`,
    };
    set({
      shipments: shipments.map((entry) => (entry.id === shipmentId ? updated : entry)),
      movements: [...movements, draw],
      toast: early
        ? `${shipmentId} released early — ${clockLabel(remaining)} of review waived. ${total.toLocaleString()} DJF across ${own.length} booking${
            own.length === 1 ? '' : 's'
          } is now payable`
        : `${shipmentId} released — ${total.toLocaleString()} DJF across ${own.length} booking${
            own.length === 1 ? '' : 's'
          } is now payable, drawn from ${shipment.fundingSourceId}`,
    });
  },

  payTransporter: (shipmentId, transporterId, method = 'bank_transfer', paymentRef) => {
    const { shipments, bookings, payments, now } = get();
    const shipment = shipments.find((entry) => entry.id === shipmentId);
    if (!shipment) return;
    const own = bookingsOf(bookings, shipmentId);

    if (!shipment.payout.releasedAt) {
      set({ toast: `${shipmentId} is not released — nothing can be paid yet` });
      return;
    }
    if (isHeld(shipment.payout)) {
      set({ toast: `${shipmentId} is on hold — clear the hold before paying anyone` });
      return;
    }

    const settlement = settlementFor(shipment, own, transporterId);
    if (!settlement || settlement.payableDjf <= 0) {
      set({ toast: `Nothing payable to that transporter on ${shipmentId}` });
      return;
    }

    /*
     * One voucher, every booking. The reference is stamped onto each cost line
     * so reconciliation can walk backwards from a single bank entry to the ten
     * containers it covered.
     */
    const paymentId = nextId('payment');
    const nextBookings = withSettlementPaid(shipment, bookings, transporterId, {
      paymentId,
      atMs: now,
      method,
      paymentRef,
    });
    if (nextBookings === bookings) return;

    const payment: ShipmentPayment = {
      id: paymentId,
      shipmentId,
      transporterId,
      transporterName: settlement.transporterName,
      bookingIds: settlement.lines
        .filter((line) => !line.paidAt)
        .map((line) => line.bookingId),
      amountDjf: settlement.payableDjf,
      paidAt: new Date(now).toISOString(),
      paidVia: method,
      paymentRef,
      paidBy: ACTOR,
    };

    set({
      bookings: nextBookings,
      payments: [...payments, payment],
      toast: `${settlement.transporterName} paid ${settlement.payableDjf.toLocaleString()} DJF for ${
        payment.bookingIds.length
      } booking${payment.bookingIds.length === 1 ? '' : 's'} on ${shipmentId} — voucher ${paymentId}${
        paymentRef ? ` · ref ${paymentRef}` : ''
      }`,
    });
  },

  acknowledgePayment: (paymentId, signedBy) => {
    const { payments, now } = get();
    const payment = payments.find((entry) => entry.id === paymentId);
    if (!payment || payment.acknowledgedAt) return;
    set({
      payments: payments.map((entry) =>
        entry.id === paymentId
          ? { ...entry, acknowledgedAt: new Date(now).toISOString(), acknowledgedBy: signedBy }
          : entry,
      ),
      toast: `${paymentId} signed by ${signedBy} — the receipt is back on file`,
    });
  },

  confirmDraw: (movementId) => {
    const { movements } = get();
    set({
      movements: movements.map((entry) =>
        entry.id === movementId ? { ...entry, confirmed: true } : entry,
      ),
      toast: `Draw ${movementId} confirmed against the bank advice`,
    });
  },

  recordRepayment: (fundingSourceId, amountDjf) => {
    const { movements, sources, now } = get();
    const source = sources.find((entry) => entry.id === fundingSourceId);
    if (!source || amountDjf <= 0) return;
    const repayment: LedgerMovement = {
      id: nextId('repayment'),
      fundingSourceId,
      kind: 'repayment',
      amountDjf,
      date: new Date(now).toISOString(),
      confirmed: true,
      note:
        source.type === 'client_credit_line'
          ? 'Client repayment to CAC — availability restored'
          : 'Pool repayment — no draw matching',
    };
    set({
      movements: [...movements, repayment],
      toast: `${amountDjf.toLocaleString()} DJF repayment recorded on ${fundingSourceId}`,
    });
  },

  markInvoicePaid: (invoiceId) => {
    const { invoices, shipments, movements, sources, now } = get();
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    if (!invoice || invoice.paidAt) return;

    const shipment = shipments.find((entry) => entry.id === invoice.shipmentId);
    const source = shipment
      ? sources.find((entry) => entry.id === shipment.fundingSourceId)
      : undefined;

    const nextMovements = [...movements];
    let toast = `${invoiceId} settled — ${invoice.amountDjf.toLocaleString()} DJF in`;

    // On a revolving line the client's payment IS the bank repayment.
    if (source?.type === 'client_credit_line') {
      nextMovements.push({
        id: nextId('repayment'),
        fundingSourceId: source.id,
        kind: 'repayment',
        amountDjf: invoice.amountDjf,
        date: new Date(now).toISOString(),
        confirmed: true,
        note: `Client settlement of ${invoiceId} — availability restored`,
      });
      toast = `${invoiceId} settled — ${source.id} availability restored by ${invoice.amountDjf.toLocaleString()} DJF`;
    }

    set({
      invoices: invoices.map((entry) =>
        entry.id === invoiceId ? { ...entry, paidAt: new Date(now).toISOString() } : entry,
      ),
      movements: nextMovements,
      toast,
    });
  },

  sendReminder: (invoiceId) => {
    const { invoices, shipments, sources, now } = get();
    const invoice = invoices.find((entry) => entry.id === invoiceId);
    if (!invoice) return;
    const shipment = shipments.find((entry) => entry.id === invoice.shipmentId);
    const source = shipment
      ? sources.find((entry) => entry.id === shipment.fundingSourceId)
      : undefined;
    // Credit-line collections are the bank's. Fleetin does not chase them.
    if (source?.riskBearer === 'bank') {
      set({ toast: `${invoiceId} sits on ${source.id} — collections belong to CAC Bank` });
      return;
    }
    set({
      invoices: invoices.map((entry) =>
        entry.id === invoiceId
          ? {
              ...entry,
              reminders: [
                ...entry.reminders,
                { sentAt: new Date(now).toISOString(), by: ACTOR },
              ],
            }
          : entry,
      ),
      toast: `Reminder ${invoice.reminders.length + 1} sent for ${invoiceId}`,
    });
  },

  setBookingRate: (bookingId, rateDjf, rateSource) => {
    const { bookings, shipments, invoices, clients } = get();
    const booking = bookings.find((entry) => entry.id === bookingId);
    if (!booking || rateDjf <= 0) return;

    const updated: FinanceBooking = { ...booking, clientRateDjf: rateDjf, rateSource };
    const nextBookings = bookings.map((entry) => (entry.id === bookingId ? updated : entry));
    const shipment = shipments.find((entry) => entry.id === booking.shipmentId);
    const own = bookingsOf(nextBookings, booking.shipmentId);
    const nextInvoices = [...invoices];
    let nextShipments = shipments;
    let extra = '';

    if (shipment) {
      const existing = shipment.invoiceId
        ? invoices.find((entry) => entry.id === shipment.invoiceId)
        : undefined;
      const priced = own.filter((entry) => entry.clientRateDjf !== null);

      if (existing && !existing.paidAt) {
        // The invoice for this shipment already exists: the newly-priced
        // container joins it rather than spawning a second document.
        const index = nextInvoices.findIndex((entry) => entry.id === existing.id);
        nextInvoices[index] = {
          ...existing,
          bookingIds: priced.map((entry) => entry.id),
          amountDjf: priced.reduce((sum, entry) => sum + (entry.clientRateDjf ?? 0), 0),
        };
        extra = ` — added to ${existing.id}`;
      } else if (!existing) {
        // Pricing a shipment whose proof is already complete back-issues the
        // invoice from the proof date: the terms clock started then, not now.
        const provenAt = shipmentProvenAt(own);
        if (provenAt && priced.length > 0) {
          const client = clients.find((entry) => entry.id === shipment.clientId);
          const terms = client?.paymentTermsDays ?? 30;
          const invoice: ClientInvoice = {
            id: nextId('invoice'),
            shipmentId: shipment.id,
            clientId: shipment.clientId,
            bookingIds: priced.map((entry) => entry.id),
            amountDjf: priced.reduce((sum, entry) => sum + (entry.clientRateDjf ?? 0), 0),
            issuedAt: provenAt,
            dueAt: new Date(new Date(provenAt).getTime() + terms * 24 * HOUR_MS).toISOString(),
            reminders: [],
          };
          nextInvoices.push(invoice);
          nextShipments = shipments.map((entry) =>
            entry.id === shipment.id ? { ...entry, invoiceId: invoice.id } : entry,
          );
          extra = ` — ${invoice.id} back-dated to the proof date`;
        }
      }
    }

    set({
      bookings: nextBookings,
      shipments: nextShipments,
      invoices: nextInvoices,
      toast: `${bookingId} priced at ${rateDjf.toLocaleString()} DJF (${rateSource.replace(
        '_',
        ' ',
      )})${extra}`,
    });
  },

  updateSettings: (patch) => {
    set((state) => ({
      settings: { ...state.settings, ...patch },
      toast: 'Thresholds updated — these drive flags only, never blocks',
    }));
  },

  addProject: (input) => {
    const id = nextId('project');
    // The reference IS the minted id — unlike a client's own contract number
    // (`contractRef`), there is no hand-written shorthand to preserve here.
    const project: FinanceProject = {
      id,
      reference: id,
      name: input.name,
      scope: input.scope,
      clientId: input.clientId,
      channel: input.channel,
      fundingSourceId: input.fundingSourceId,
      contractRef: input.contractRef,
      startedAt: input.startedAt,
      contractEndAt: input.contractEndAt ?? null,
      status: 'active',
    };
    set((state) => ({
      projects: [...state.projects, project],
      toast: `${project.id} created for ${input.name}`,
    }));
    return project;
  },

  closeProjectContract: (projectId) => {
    const { projects, shipments, bookings, invoices, clients, now } = get();
    const project = projects.find((entry) => entry.id === projectId);
    if (!project || project.status === 'completed') return;

    const terms = clients.find((entry) => entry.id === project.clientId)?.paymentTermsDays ?? 30;
    const issuedAt = new Date(now).toISOString();

    // Only shipments this project has never billed — an already-invoiced
    // shipment keeps the invoice it has; closing a contract must never
    // double-bill work the desk already sent an invoice for.
    const unbilled = shipments.filter(
      (entry) => entry.projectId === projectId && !entry.invoiceId,
    );
    const newInvoices: ClientInvoice[] = [];
    const invoiceIdByShipment = new Map<string, string>();
    for (const shipment of unbilled) {
      const invoice = buildShipmentInvoice(
        shipment,
        bookingsOf(bookings, shipment.id),
        nextId('invoice'),
        terms,
        issuedAt,
      );
      if (invoice) {
        newInvoices.push(invoice);
        invoiceIdByShipment.set(shipment.id, invoice.id);
      }
    }

    const nextShipments =
      invoiceIdByShipment.size > 0
        ? shipments.map((entry) =>
            invoiceIdByShipment.has(entry.id)
              ? { ...entry, invoiceId: invoiceIdByShipment.get(entry.id) }
              : entry,
          )
        : shipments;
    const nextProjects = projects.map((entry) =>
      entry.id === projectId ? { ...entry, status: 'completed' as const } : entry,
    );
    const billedTotal = newInvoices.reduce((sum, invoice) => sum + invoice.amountDjf, 0);

    set({
      projects: nextProjects,
      shipments: nextShipments,
      invoices: newInvoices.length > 0 ? [...invoices, ...newInvoices] : invoices,
      toast:
        newInvoices.length > 0
          ? `${project.id} closed — ${newInvoices.length} closing invoice${
              newInvoices.length === 1 ? '' : 's'
            } issued for ${billedTotal.toLocaleString()} DJF`
          : `${project.id} closed — nothing left to bill`,
    });
  },
}));

/**
 * The 30-second clock every validation window reads from. Returns its own
 * cleanup so the module chrome can hand it to `useEffect` directly.
 */
export function startFinanceClock(intervalMs: number = FINANCE_TICK_MS): () => void {
  useFinanceStore.getState().setNow(Date.now());
  const timer = setInterval(() => {
    useFinanceStore.getState().setNow(Date.now());
  }, intervalMs);
  return () => clearInterval(timer);
}
