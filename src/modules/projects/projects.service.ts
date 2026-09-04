import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/**
 * DJF has no subunit, so the estimate the operator types IS the minor-unit
 * figure. `undefined` (field absent) leaves the stored estimate alone.
 */
function toEstimateMinorUnits(monthlyEstimate: number | undefined): bigint | undefined {
  return monthlyEstimate === undefined ? undefined : BigInt(Math.round(monthlyEstimate));
}

/** A grouping tag over one shipper's shipments — see the schema's own doc comment for what this deliberately does not carry. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async findAll(params: { shipperId?: string; status?: string }) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(params.shipperId ? { shipperId: params.shipperId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
      include: { shipments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
    });
    if (!project) throw new NotFoundException(`Project with ID "${id}" not found`);
    return { ...project, totals: await this.totals(project.id, project.shipments) };
  }

  /**
   * What the project is worth, counted two different ways on purpose.
   *
   * `contracted` is the sum of what the shipments are priced at — the work
   * itself, whether or not anybody has raised a document for it. `billed` is
   * what has actually been invoiced, and `paid` what has actually come in.
   * The gap between the first two is the operator's to-do list; the gap
   * between the last two is the client's.
   *
   * Proformas are excluded from `billed` throughout. A quote is not a bill,
   * and counting one as revenue is how a project reads as fully invoiced when
   * nothing has been sent.
   */
  private async totals(
    projectId: string,
    shipments: Array<{ id: string; clientRateMinorUnits: bigint | null }>,
  ) {
    /*
     * Counted through the SHIPMENTS, not through `Invoice.projectId`.
     *
     * An invoice stamps the project its shipment belonged to at issue time, so
     * a shipment attached to a project *after* it was billed leaves its invoice
     * carrying a null project — and the project then reported 0 invoiced while
     * plainly listing an invoiced shipment. The shipment set is the project's
     * real membership, so the money follows it.
     */
    const shipmentIds = shipments.map((shipment) => shipment.id);
    const invoices =
      shipmentIds.length === 0
        ? []
        : await this.prisma.invoice.findMany({
            where: {
              kind: 'invoice',
              status: { not: 'Cancelled' },
              OR: [{ shipmentId: { in: shipmentIds } }, { projectId }],
            },
            select: { totalMinorUnits: true, commissionMinorUnits: true, status: true },
          });

    const contracted = shipments.reduce((sum, s) => sum + (s.clientRateMinorUnits ?? 0n), 0n);
    const billed = invoices.reduce((sum, i) => sum + i.totalMinorUnits, 0n);
    const paid = invoices
      .filter((i) => i.status === 'Paid')
      .reduce((sum, i) => sum + i.totalMinorUnits, 0n);
    const commission = invoices.reduce((sum, i) => sum + i.commissionMinorUnits, 0n);

    return {
      shipmentCount: shipments.length,
      /* Priced but not yet billed — the number that tells an operator there is
         work to do here, which is why it is computed rather than left to the
         client to subtract. */
      unpricedCount: shipments.filter((s) => s.clientRateMinorUnits == null).length,
      contractedMinorUnits: contracted.toString(),
      billedMinorUnits: billed.toString(),
      paidMinorUnits: paid.toString(),
      outstandingMinorUnits: (billed - paid).toString(),
      commissionMinorUnits: commission.toString(),
    };
  }

  async create(dto: CreateProjectDto) {
    const shipper = await this.prisma.shipper.findFirst({ where: { id: dto.shipperId, deletedAt: null } });
    if (!shipper) throw new NotFoundException(`Shipper with ID "${dto.shipperId}" not found`);

    const reference = await nextReference(this.prisma.project, 'PRJ');
    const estimate = toEstimateMinorUnits(dto.monthlyEstimate);
    return this.prisma.project.create({
      data: {
        reference,
        name: dto.name,
        shipperId: shipper.id,
        startedAt: new Date(dto.startedAt),
        contractEndAt: dto.contractEndAt ? new Date(dto.contractEndAt) : undefined,
        monthlyEstimateMinorUnits: estimate,
        monthlyEstimateCurrency: 'DJF',
        monthlyEstimateFxRate: 1.0,
        monthlyEstimateBaseAmountMinorUnits: estimate,
      },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.findOne(id);
    const estimate = toEstimateMinorUnits(dto.monthlyEstimate);
    return this.prisma.project.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        contractEndAt: dto.contractEndAt ? new Date(dto.contractEndAt) : undefined,
        monthlyEstimateMinorUnits: estimate,
        monthlyEstimateBaseAmountMinorUnits: estimate,
      },
    });
  }

  /**
   * Closes the project — but only once its money is finished.
   *
   * A project is a commercial agreement, and closing one says the agreement is
   * settled. Two things have to be true before that is honest, and both are
   * refused rather than warned about:
   *
   *   1. **Everything priced is invoiced.** Closing over unbilled work strands
   *      revenue: the project drops off every screen that shows what is left
   *      to bill, and nobody comes back to it.
   *   2. **Every invoice is paid.** A closed project with money outstanding is
   *      a debt with no home — it leaves the collections list along with the
   *      project.
   *
   * Unpriced shipments are the one thing that does NOT block: they cannot be
   * invoiced at all, so requiring it would make such a project uncloseable
   * forever. They are reported instead, so the operator can see what closed
   * without ever being billed.
   *
   * Closing no longer raises documents. Invoicing is its own deliberate act on
   * this page; a close that silently billed was a second way to create money
   * documents, and the operator could not see what it would produce first.
   */
  async close(id: string) {
    const project = await this.findOne(id);

    const shipmentIds = project.shipments.map((shipment) => shipment.id);
    const invoices =
      shipmentIds.length === 0
        ? []
        : await this.prisma.invoice.findMany({
            where: {
              kind: 'invoice',
              status: { not: 'Cancelled' },
              OR: [{ shipmentId: { in: shipmentIds } }, { projectId: project.id }],
            },
            select: { number: true, status: true, shipmentId: true, missionIds: true },
          });

    /* A shipment counts as billed whether it was invoiced on its own
       (`shipmentId`) or swept into a project invoice (`missionIds`). */
    const billed = new Set<string>();
    for (const invoice of invoices) {
      if (invoice.shipmentId) billed.add(invoice.shipmentId);
      const ids = Array.isArray(invoice.missionIds) ? (invoice.missionIds as string[]) : [];
      for (const shipmentId of ids) billed.add(shipmentId);
    }

    const unbilled = project.shipments.filter(
      (shipment) => shipment.clientRateMinorUnits != null && !billed.has(shipment.id),
    );
    if (unbilled.length > 0) {
      throw new BadRequestException(
        `Cannot close "${project.name}" — ${unbilled.length} shipment${
          unbilled.length === 1 ? ' is' : 's are'
        } not invoiced yet: ${unbilled.map((shipment) => shipment.reference).join(', ')}`,
      );
    }

    const unpaid = invoices.filter((invoice) => invoice.status !== 'Paid');
    if (unpaid.length > 0) {
      throw new BadRequestException(
        `Cannot close "${project.name}" — ${unpaid.length} invoice${
          unpaid.length === 1 ? ' is' : 's are'
        } still unpaid: ${unpaid.map((invoice) => invoice.number).join(', ')}`,
      );
    }

    const skipped = project.shipments.filter((shipment) => shipment.clientRateMinorUnits == null).length;

    const closed = await this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'completed' },
    });
    return { ...closed, skippedUnpriced: skipped };
  }
}
