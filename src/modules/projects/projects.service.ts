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
    return project;
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

  /** Marks the project completed and issues invoices for any of its shipments that don't have one yet — a no-op per shipment when it has no client rate set. */
  async close(id: string, actorId: string, actorName: string) {
    const project = await this.findOne(id);

    for (const shipment of project.shipments) {
      await this.invoices.issueForShipment(shipment.id, actorId, actorName);
    }

    return this.prisma.project.update({ where: { id: project.id }, data: { status: 'completed' } });
  }
}
