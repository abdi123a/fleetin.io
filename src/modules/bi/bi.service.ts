import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildLocator } from './bi-geo';

/**
 * The BI dataset, built from real rows.
 *
 * The frontend's `BiDataset` contract (`shipper-bi/contracts/entities.ts`) was
 * written with the note "the mock generator produces one of these; the backend
 * will produce the same shape from a set of joined queries." This is that set
 * of queries. Emitting the identical shape means the whole derivation and
 * charting layer downstream is untouched — only the source changes.
 *
 * **Grain**: one BI "shipment" is one real `Booking`, not one `Shipment`. The
 * contract's shipment carries a single container, route and vehicle, which is
 * a booking, not the multi-container job above it. Using the job would have
 * made per-container empty-return metrics impossible to state honestly.
 *
 * **What is deliberately empty.** `delays`, `positions` and `etaSnapshots`
 * have no backing table in this system — there is no delay-attribution model,
 * no GPS feed and no stored ETA predictions. They come back as empty arrays
 * rather than as plausible numbers. The sections that read them will show
 * nothing, which is the correct answer to "what do we know about this?" and
 * the whole reason this replaced a generator that answered it with fiction.
 */
@Injectable()
export class BiService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real booking status → the BI lifecycle stage. */
  private stageOf(bookingStatus: string, hasCycle: boolean, returned: boolean): string {
    if (returned) return 'empty_returned';
    switch (bookingStatus) {
      case 'Pending':
        return 'created';
      case 'Assigned':
      case 'Driver Assigned':
      case 'Heading to Pickup':
        return 'dispatched';
      case 'At Pickup':
      case 'Loading':
        return 'gate_in';
      case 'Loaded':
        return 'picked_up';
      case 'En Route':
        return 'in_transit';
      case 'Arrived':
        return 'arrived';
      case 'Unloading':
        return 'unloading';
      case 'POD Submitted':
      case 'Completed':
        // Delivered containers that still owe an empty return are not finished.
        return hasCycle ? 'empty_awaiting' : 'delivered';
      default:
        return 'created';
    }
  }

  /** Timeline step key → the stage that step belongs to. */
  private stageOfTimelineKey(key: string): string {
    switch (key) {
      case 'creation':
      case 'booking_confirmation':
        return 'created';
      case 'vehicle_assignment':
      case 'driver_assignment':
      case 'left_for_pickup':
        return 'dispatched';
      case 'gate_in':
      case 'loading_start':
        return 'gate_in';
      case 'pickup':
        return 'picked_up';
      case 'departure':
        return 'in_transit';
      case 'arrival':
        return 'arrived';
      case 'unloading_start':
        return 'unloading';
      case 'pod_upload':
      case 'completion':
        return 'delivered';
      default:
        return 'created';
    }
  }

  /** Free-text cargo (`"Containerized (40ft Rice)"`) onto the contract's closed enum. */
  private cargoTypeOf(cargoType: string, category: string | null): string {
    const text = `${cargoType} ${category ?? ''}`.toLowerCase();
    if (text.includes('refrigerat') || text.includes('reefer')) return 'Refrigerated';
    if (text.includes('hazard')) return 'Hazardous';
    if (text.includes('bulk') && !text.includes('bulky')) return 'Bulk';
    if (text.includes('bulky') || text.includes('machinery')) return 'Bulky Goods';
    if (text.includes('vehicle')) return 'Vehicles';
    if (text.includes('steel') || text.includes('construction') || text.includes('cement')) return 'Construction';
    return 'General Cargo';
  }

  private containerTypeOf(category: string | null, cargoType: string): string | null {
    const text = `${category ?? ''} ${cargoType}`.toLowerCase();
    if (!text.includes('container') && !text.includes('20') && !text.includes('40')) return null;
    if (text.includes('reefer') || text.includes('refrigerat')) return text.includes('20') ? '20RF' : '40RF';
    if (text.includes('20')) return '20GP';
    if (text.includes('hc')) return '40HC';
    return '40GP';
  }

  private containerStatusOf(bookingStatus: string, hasCycle: boolean, returned: boolean): string {
    if (returned) return 'returned';
    if (hasCycle) return 'return_in_progress';
    if (['Arrived', 'Unloading', 'POD Submitted', 'Completed'].includes(bookingStatus)) return 'awaiting_return';
    if (['En Route'].includes(bookingStatus)) return 'in_transit';
    return 'delivered';
  }

  private iso(value: Date | null | undefined): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }

  /**
   * One dataset. `shipperId` scopes it to a shipper's own book; `partnerId` to
   * a transporter's. Exactly one is expected — the two portals ask the same
   * question of the same rows from opposite sides.
   */
  async dataset(params: { shipperId?: string; partnerId?: string; asOf?: string }) {
    const asOf = params.asOf ? new Date(params.asOf) : new Date();

    if (params.shipperId) {
      const shipper = await this.prisma.shipper.findFirst({
        where: { OR: [{ id: params.shipperId }, { reference: params.shipperId }], deletedAt: null },
        select: { id: true },
      });
      if (!shipper) throw new NotFoundException(`Shipper "${params.shipperId}" not found`);
      params.shipperId = shipper.id;
    }
    if (params.partnerId) {
      const partner = await this.prisma.partner.findFirst({
        where: { OR: [{ id: params.partnerId }, { reference: params.partnerId }], deletedAt: null },
        select: { id: true },
      });
      if (!partner) throw new NotFoundException(`Transporter "${params.partnerId}" not found`);
      params.partnerId = partner.id;
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        ...(params.partnerId ? { partnerId: params.partnerId } : {}),
        shipment: {
          deletedAt: null,
          ...(params.shipperId ? { shipperId: params.shipperId } : {}),
        },
      },
      include: {
        shipment: true,
        partner: { select: { id: true, reference: true, companyLegalName: true } },
        vehicle: { select: { id: true, plateNumber: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
        asEmpty: { select: { returnedAt: true, emptyReadyAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    /* The location catalogue, loaded once. `locate` prefers a shipment's saved
     * location over the gazetteer's name-substring guess, so a route drawn on
     * the tracking map uses coordinates somebody verified rather than a
     * hardcoded one. See `bi-geo.ts`. */
    const locate = buildLocator(
      await this.prisma.location.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, latitude: true, longitude: true },
      }),
    );

    const transporters = new Map<string, Record<string, unknown>>();
    const routes = new Map<string, Record<string, unknown>>();
    const depots = new Map<string, Record<string, unknown>>();
    const vehicles = new Map<string, Record<string, unknown>>();
    const shipments: Record<string, unknown>[] = [];
    const events: Record<string, unknown>[] = [];
    const containers: Record<string, unknown>[] = [];
    const charges: Record<string, unknown>[] = [];

    for (const booking of bookings) {
      const shipment = booking.shipment;
      const returnedAt = booking.asEmpty?.returnedAt ?? null;
      const hasCycle = Boolean(booking.asEmpty);
      const stage = this.stageOf(booking.status, hasCycle, Boolean(returnedAt));

      if (booking.partner) {
        transporters.set(booking.partner.id, {
          id: booking.partner.id,
          name: booking.partner.companyLegalName,
          fleetCode: booking.partner.reference,
        });
      }
      if (booking.vehicle && booking.partnerId) {
        vehicles.set(booking.vehicle.id, {
          id: booking.vehicle.id,
          plateNumber: booking.vehicle.plateNumber,
          transporterId: booking.partnerId,
        });
      }

      // One route per real origin→destination pair actually run.
      const routeId = `RTE-${shipment.pickupLocationCity || shipment.pickupLocationName}→${shipment.deliveryLocationCity || shipment.deliveryLocationName}`
        .replace(/\s+/g, '-')
        .slice(0, 120);
      if (!routes.has(routeId)) {
        const origin = locate(shipment.pickupLocationName, shipment.pickupLocationId);
        const destination = locate(shipment.deliveryLocationName, shipment.deliveryLocationId);
        routes.set(routeId, {
          id: routeId,
          name: `${shipment.pickupLocationName} → ${shipment.deliveryLocationName}`,
          originName: shipment.pickupLocationName,
          originLat: origin?.lat ?? null,
          originLng: origin?.lng ?? null,
          destinationName: shipment.deliveryLocationName,
          destinationLat: destination?.lat ?? null,
          destinationLng: destination?.lng ?? null,
          distanceKm: shipment.estimatedDistanceKm ?? 0,
          // The planning baseline this system actually has: the shipment's own
          // estimate. No separate nominal-transit table exists to read.
          nominalTransitHours: Number.parseFloat(shipment.estimatedDurationHours) || 0,
        });
      }

      if (booking.containerReturnDepot) {
        const depotPoint = locate(booking.containerReturnDepot);
        depots.set(booking.containerReturnDepot, {
          id: booking.containerReturnDepot,
          name: booking.containerReturnDepot,
          lat: depotPoint?.lat ?? null,
          lng: depotPoint?.lng ?? null,
        });
      }

      const plannedPickupAt = this.iso(booking.scheduledPickupTime ?? shipment.scheduledPickupTime)!;
      // The promise this system stores is the pickup time plus the route's own
      // duration estimate; there is no separate agreed delivery date column.
      const transitHours = Number.parseFloat(shipment.estimatedDurationHours) || 0;
      const plannedDeliveryAt = new Date(
        new Date(plannedPickupAt).getTime() + transitHours * 3_600_000,
      ).toISOString();

      const departure = booking.timeline.find((step) => step.key === 'departure' && step.timestamp);
      const lastStep = [...booking.timeline].reverse().find((step) => step.timestamp);
      /**
       * Delivery is the proof of delivery, not the mission's closing stamp.
       *
       * A containerized booking is only closed once its empty is back at the
       * depot — days after the cargo landed — so reading `completedAt` as the
       * delivery date charged every one of those days to the transporter's
       * punctuality. Every carrier in the book read "3d late" for deliveries
       * that were on time; the days belonged to the consignee's depotage and
       * the return leg, which the empty-return metrics already measure.
       */
      const pod = booking.timeline.find((step) => step.key === 'pod_upload' && step.timestamp);
      const deliveredAt = pod?.timestamp ?? booking.completedAt;

      shipments.push({
        id: booking.id,
        reference: booking.reference,
        shipperId: shipment.shipperId,
        transporterId: booking.partnerId ?? '',
        parentReference: shipment.reference,
        routeId,
        vehicleId: booking.vehicleId ?? undefined,
        containerId: booking.containerNumber ? booking.id : undefined,
        cargoType: this.cargoTypeOf(booking.cargoType, booking.shipmentCategory),
        weightKg: shipment.totalWeightKg ?? 0,
        plannedPickupAt,
        plannedDeliveryAt,
        actualPickupAt: this.iso(departure?.timestamp),
        actualDeliveryAt: this.iso(deliveredAt),
        currentStage: stage,
        currentStageAt: this.iso(lastStep?.timestamp) ?? this.iso(booking.updatedAt)!,
        createdAt: this.iso(booking.createdAt)!,
      });

      // Legacy shim: before the ladder tracked the pickup leg, the "Unloading"
      // status stamped a `gate_in` step — which counted unloading time at the
      // destination as waiting at the pickup terminal. A gate-in recorded
      // after the arrival event can only be that old mapping.
      const arrivalStep = booking.timeline.find((step) => step.key === 'arrival' && step.timestamp);
      booking.timeline.forEach((step, index) => {
        if (!step.timestamp) return;
        const isLegacyUnloading =
          step.key === 'gate_in' &&
          arrivalStep?.timestamp &&
          step.timestamp > arrivalStep.timestamp;
        events.push({
          id: step.id,
          shipmentId: booking.id,
          seq: index,
          stage: isLegacyUnloading ? 'unloading' : this.stageOfTimelineKey(step.key),
          occurredAt: this.iso(step.timestamp)!,
          recordedAt: this.iso(step.createdAt)!,
          actorType: step.actor ? 'ops' : 'system',
          actorId: step.actor ?? undefined,
          locationName: step.location ?? undefined,
          note: step.notes ?? undefined,
        });
      });

      const containerType = this.containerTypeOf(booking.shipmentCategory, booking.cargoType);
      if (booking.containerNumber && booking.containerReturnDeadline && containerType) {
        containers.push({
          id: booking.id,
          containerNo: booking.containerNumber,
          type: containerType,
          shippingLine: booking.shippingLine ?? 'Unknown line',
          shipmentId: booking.id,
          status: this.containerStatusOf(booking.status, hasCycle, Boolean(returnedAt)),
          gateOutAt: this.iso(departure?.timestamp),
          deliveredAt: this.iso(deliveredAt),
          freeTimeExpiresAt: this.iso(booking.containerReturnDeadline)!,
          returnedAt: this.iso(returnedAt),
          depotId: booking.containerReturnDepot ?? undefined,
        });
      }

      // Base freight only. Detention/demurrage/storage are real cost types in
      // the contract, but this system stores no per-day accessorial rate to
      // compute them from — emitting a guessed amount is exactly the kind of
      // plausible fiction this rewrite exists to remove.
      const amount = params.shipperId
        ? this.shipperShareOf(shipment.clientRateMinorUnits, shipment.id, bookings)
        : Number(booking.transporterCostMinorUnits ?? 0n);
      if (amount > 0 && booking.partnerId) {
        charges.push({
          id: `CHG-${booking.id}-freight`,
          shipmentId: booking.id,
          containerId: booking.containerNumber ? booking.id : undefined,
          transporterId: booking.partnerId,
          type: 'base_freight',
          amount,
          currency: 'DJF',
          incurredFrom: plannedPickupAt,
          incurredTo: this.iso(booking.completedAt) ?? plannedPickupAt,
          status: shipment.payoutReleasedAt ? 'settled' : 'estimated',
        });
      }
    }

    return {
      asOf: asOf.toISOString(),
      shipperId: params.shipperId ?? '',
      transporters: [...transporters.values()],
      routes: [...routes.values()],
      depots: [...depots.values()],
      vehicles: [...vehicles.values()],
      shipments,
      events,
      containers,
      // No delay-attribution model, no GPS feed, no stored ETA predictions.
      // See this class's own doc comment: empty is the honest answer.
      delays: [],
      charges,
      positions: [],
      etaSnapshots: [],
    };
  }

  /**
   * A booking's share of what the shipper is billed.
   *
   * The client rate is agreed per shipment, not per container, so splitting it
   * evenly across that shipment's bookings is an allocation, not a stored
   * fact — stated here rather than hidden so nobody reads a per-container cost
   * as something the system was told.
   */
  private shipperShareOf(
    clientRateMinorUnits: bigint | null,
    shipmentId: string,
    allBookings: { shipmentId: string }[],
  ): number {
    if (!clientRateMinorUnits) return 0;
    const siblings = allBookings.filter((b) => b.shipmentId === shipmentId).length || 1;
    return Math.round(Number(clientRateMinorUnits) / siblings);
  }
}
