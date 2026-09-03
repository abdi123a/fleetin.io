import { Injectable, NotFoundException } from '@nestjs/common';
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
  private async totals(projectId: string, shipments: Array<{ clientRateMinorUnits: bigint | null }>) {
    const invoices = await this.prisma.invoice.findMany({
      where: { projectId, kind: 'invoice', status: { not: 'Cancelled' } },
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
   * Closes the project, billing whatever is left to bill on the way out.
   *
   * Every priced shipment that has no invoice yet gets one — `issueForShipment`
   * is idempotent, so shipments already billed are returned unchanged rather
   * than billed twice. Unpriced shipments are SKIPPED and counted, never
   * billed at zero, and the count comes back in the response so the operator
   * can see that closing the project did not quietly bill nothing.
   */
  async close(id: string, actorId: string, actorName: string) {
    const project = await this.findOne(id);

    let issued = 0;
    let skipped = 0;
    for (const shipment of project.shipments) {
      if (shipment.clientRateMinorUnits == null) {
        skipped += 1;
        continue;
      }
      await this.invoices.issueForShipment(shipment.id, actorId, actorName);
      issued += 1;
    }

    const closed = await this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'completed' },
    });
    return { ...closed, issued, skippedUnpriced: skipped };
  }
}
