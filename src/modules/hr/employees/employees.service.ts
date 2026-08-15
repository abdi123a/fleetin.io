import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeDocumentCategory,
  EmployeeStatus,
  LeaveStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { HrAuditService } from '../hr-audit.service';
import { PayrollConfigService } from '../payroll/payroll-config.service';
import {
  assertCanReadDocument,
  employeeScopeFor,
  redactEmployee,
  resolveViewer,
  type HrViewer,
} from '../hr-access';
import { calculateLeaveBalance } from '../payroll/payroll.engine';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

/** §6: MIME whitelist and 10 MB cap on every upload. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** §6: signed URLs live ten minutes, never longer. */
const SIGNED_URL_TTL_SECONDS = 600;

export interface FindAllParams {
  search?: string;
  status?: string;
  department?: string;
  contractType?: string;
  page: number;
  limit: number;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: HrAuditService,
    private readonly payrollConfig: PayrollConfigService,
  ) {}

  /**
   * Resolves the viewer, including which employee record they *are*.
   *
   * Every read path starts here: the row scope and the field redaction both
   * depend on it, and neither is safe to derive from permissions alone.
   */
  async viewerFor(user: AuthenticatedUser): Promise<HrViewer> {
    const self = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return resolveViewer(user, self?.id ?? null);
  }

  async findAll(user: AuthenticatedUser, params: FindAllParams) {
    const viewer = await this.viewerFor(user);
    const scope = employeeScopeFor(user, viewer);

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(params.status && params.status !== 'all'
        ? { status: params.status as EmployeeStatus }
        : {}),
      ...(params.department ? { department: params.department } : {}),
      ...(params.contractType ? { contractType: params.contractType as never } : {}),
      ...(params.search
        ? {
            OR: [
              { fullName: { contains: params.search } },
              { matricule: { contains: params.search } },
              { profession: { contains: params.search } },
              { cnssNumber: { contains: params.search } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { matricule: 'asc' },
        include: { _count: { select: { documents: true } } },
      }),
      this.prisma.employee.count({ where }),
    ]);

    await this.audit.record(user, {
      entity: 'Employee',
      entityId: 'list',
      action: 'list',
      detail: { returned: rows.length, filters: { ...params } },
    });

    return {
      items: rows.map((row) => redactEmployee(this.serialise(row), viewer)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const viewer = await this.viewerFor(user);
    const employee = await this.loadScoped(user, viewer, id);

    const asOf = new Date();
    const { rates } = await this.payrollConfig.resolveForDate(asOf);
    const leaveTaken = await this.approvedLeaveDays(id);
    const leave = calculateLeaveBalance(
      employee.joiningDate,
      asOf,
      leaveTaken,
      rates,
    );

    await this.audit.record(user, { entity: 'Employee', entityId: id, action: 'view' });

    return {
      ...redactEmployee(this.serialise(employee), viewer),
      manager: employee.manager
        ? { id: employee.manager.id, fullName: employee.manager.fullName }
        : null,
      leave,
      documents: employee.documents
        .filter((document) => this.mayList(document.category, id, viewer))
        .map((document) => ({
          id: document.id,
          category: document.category,
          originalName: document.originalName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          issueDate: document.issueDate,
          expiryDate: document.expiryDate,
          uploadedAt: document.uploadedAt,
          notes: document.notes,
        })),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateEmployeeDto) {
    const matricule = dto.matricule ?? (await this.nextMatricule());

    const employee = await this.prisma.employee.create({
      data: {
        matricule,
        fullName: dto.fullName,
        gender: dto.gender,
        nationality: dto.nationality,
        cnssNumber: dto.cnssNumber ?? null,
        nifNumber: dto.nifNumber ?? null,
        profession: dto.profession,
        department: dto.department ?? null,
        contractType: dto.contractType,
        joiningDate: new Date(dto.joiningDate),
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
        trialPeriodEnd: dto.trialPeriodEnd ? new Date(dto.trialPeriodEnd) : null,
        baseSalary: new Prisma.Decimal(dto.baseSalary),
        bankAccount: dto.bankAccount ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        managerId: dto.managerId ?? null,
        userId: dto.userId ?? null,
      },
    });

    await this.audit.record(user, {
      entity: 'Employee',
      entityId: employee.id,
      action: 'create',
      detail: { matricule: employee.matricule, fullName: employee.fullName },
    });

    return this.serialise(employee);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    const existing = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException(`Employee ${id} not found`);

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.nationality !== undefined ? { nationality: dto.nationality } : {}),
        ...(dto.cnssNumber !== undefined ? { cnssNumber: dto.cnssNumber } : {}),
        ...(dto.nifNumber !== undefined ? { nifNumber: dto.nifNumber } : {}),
        ...(dto.profession !== undefined ? { profession: dto.profession } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.contractType !== undefined ? { contractType: dto.contractType } : {}),
        ...(dto.joiningDate !== undefined ? { joiningDate: new Date(dto.joiningDate) } : {}),
        ...(dto.contractEndDate !== undefined
          ? { contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null }
          : {}),
        ...(dto.trialPeriodEnd !== undefined
          ? { trialPeriodEnd: dto.trialPeriodEnd ? new Date(dto.trialPeriodEnd) : null }
          : {}),
        ...(dto.baseSalary !== undefined
          ? { baseSalary: new Prisma.Decimal(dto.baseSalary) }
          : {}),
        ...(dto.bankAccount !== undefined ? { bankAccount: dto.bankAccount } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.terminationDate !== undefined
          ? { terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : null }
          : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      },
    });

    /* The audit detail records what actually moved, not the whole payload —
     * a diff is what an inspector reads, and dumping the request body would
     * copy salary and bank details into a second table. */
    const changed = Object.keys(dto).filter(
      (key) => String((existing as never)[key]) !== String((employee as never)[key]),
    );

    await this.audit.record(user, {
      entity: 'Employee',
      entityId: id,
      action: 'update',
      detail: { changed },
    });

    return this.serialise(employee);
  }

  /**
   * Soft delete. §6 is explicit: a terminated employee is archived, never
   * removed, because payroll and contract records have to survive a labour
   * inspection and a CNSS audit.
   */
  async archive(user: AuthenticatedUser, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    await this.prisma.employee.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: EmployeeStatus.TERMINATED,
        terminationDate: employee.terminationDate ?? new Date(),
      },
    });

    await this.audit.record(user, { entity: 'Employee', entityId: id, action: 'delete' });
    return { id, archived: true };
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async uploadDocument(
    user: AuthenticatedUser,
    employeeId: string,
    file: Express.Multer.File,
    meta: {
      category: EmployeeDocumentCategory;
      issueDate?: string;
      expiryDate?: string;
      notes?: string;
    },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    if (!file) throw new BadRequestException('No file was uploaded');

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: PDF, JPEG, PNG, DOCX.`,
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`,
      );
    }

    /* The stored key is generated, never taken from the upload: the original
     * filename is kept in its own column so a hostile name can never become a
     * path segment. */
    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: `hr/employees/${employeeId}` },
    );

    const document = await this.prisma.employeeDocument.create({
      data: {
        employeeId,
        category: meta.category,
        fileKey: stored.key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        issueDate: meta.issueDate ? new Date(meta.issueDate) : null,
        expiryDate: meta.expiryDate ? new Date(meta.expiryDate) : null,
        notes: meta.notes ?? null,
        uploadedById: user.id,
      },
    });

    await this.audit.record(user, {
      entity: 'EmployeeDocument',
      entityId: document.id,
      action: 'upload',
      detail: { employeeId, category: meta.category, originalName: file.originalname },
    });

    return document;
  }

  /** A short-lived signed URL, issued only after the permission check. */
  async documentDownloadUrl(user: AuthenticatedUser, documentId: string) {
    const viewer = await this.viewerFor(user);
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    await this.loadScoped(user, viewer, document.employeeId);
    assertCanReadDocument(document.category, document.employeeId, viewer);

    const url = await this.storage.getUrl(document.fileKey, SIGNED_URL_TTL_SECONDS);

    await this.audit.record(user, {
      entity: 'EmployeeDocument',
      entityId: documentId,
      action: 'download',
      detail: { employeeId: document.employeeId, category: document.category },
    });

    return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS, originalName: document.originalName };
  }

  /**
   * The document's own bytes, under its original name.
   *
   * Same permission check and audit write as the URL route above, but the file
   * never leaves the API — which is the only version that holds, because the
   * local storage driver serves `/uploads` statically with no auth at all.
   */
  async documentFile(user: AuthenticatedUser, documentId: string) {
    const viewer = await this.viewerFor(user);
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    await this.loadScoped(user, viewer, document.employeeId);
    assertCanReadDocument(document.category, document.employeeId, viewer);

    await this.audit.record(user, {
      entity: 'EmployeeDocument',
      entityId: documentId,
      action: 'download',
      detail: { employeeId: document.employeeId, category: document.category },
    });

    return {
      buffer: await this.storage.get(document.fileKey),
      fileName: document.originalName,
      mimeType: document.mimeType,
    };
  }

  async deleteDocument(user: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);

    await this.prisma.employeeDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    await this.audit.record(user, {
      entity: 'EmployeeDocument',
      entityId: documentId,
      action: 'delete',
      detail: { employeeId: document.employeeId, category: document.category },
    });

    return { id: documentId, archived: true };
  }

  // ── Expiry dashboard ─────────────────────────────────────────────────────

  /**
   * What is about to lapse: document expiries, CDD end dates and trial period
   * ends, in one list. The workbook had none of this — it is the one thing §5
   * adds rather than reproduces.
   */
  async expiring(user: AuthenticatedUser, withinDays: number) {
    const viewer = await this.viewerFor(user);
    const scope = employeeScopeFor(user, viewer);
    const horizon = new Date(Date.now() + withinDays * 86_400_000);
    const today = new Date();

    const [documents, contracts, trials] = await Promise.all([
      this.prisma.employeeDocument.findMany({
        where: {
          deletedAt: null,
          expiryDate: { not: null, lte: horizon },
          employee: { deletedAt: null, status: { not: EmployeeStatus.TERMINATED }, ...(scope ?? {}) },
        },
        include: { employee: { select: { id: true, fullName: true, matricule: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          status: { not: EmployeeStatus.TERMINATED },
          contractEndDate: { not: null, lte: horizon },
          ...(scope ?? {}),
        },
        select: { id: true, fullName: true, matricule: true, contractEndDate: true, contractType: true },
        orderBy: { contractEndDate: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          status: { not: EmployeeStatus.TERMINATED },
          trialPeriodEnd: { not: null, lte: horizon },
          ...(scope ?? {}),
        },
        select: { id: true, fullName: true, matricule: true, trialPeriodEnd: true },
        orderBy: { trialPeriodEnd: 'asc' },
      }),
    ]);

    const daysUntil = (date: Date) =>
      Math.ceil((date.getTime() - today.getTime()) / 86_400_000);

    return {
      withinDays,
      items: [
        ...documents
          .filter((document) => this.mayList(document.category, document.employeeId, viewer))
          .map((document) => ({
            kind: 'document' as const,
            id: document.id,
            employeeId: document.employeeId,
            employeeName: document.employee.fullName,
            matricule: document.employee.matricule,
            label: document.category,
            expiresOn: document.expiryDate as Date,
            daysUntil: daysUntil(document.expiryDate as Date),
          })),
        ...contracts.map((employee) => ({
          kind: 'contract' as const,
          id: employee.id,
          employeeId: employee.id,
          employeeName: employee.fullName,
          matricule: employee.matricule,
          label: `Contrat ${employee.contractType}`,
          expiresOn: employee.contractEndDate as Date,
          daysUntil: daysUntil(employee.contractEndDate as Date),
        })),
        ...trials.map((employee) => ({
          kind: 'trial' as const,
          id: employee.id,
          employeeId: employee.id,
          employeeName: employee.fullName,
          matricule: employee.matricule,
          label: "Fin de période d'essai",
          expiresOn: employee.trialPeriodEnd as Date,
          daysUntil: daysUntil(employee.trialPeriodEnd as Date),
        })),
      ].sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime()),
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Loads an employee through the viewer's row scope, or 404s. */
  private async loadScoped(user: AuthenticatedUser, viewer: HrViewer, id: string) {
    const scope = employeeScopeFor(user, viewer);
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null, ...(scope ?? {}) },
      include: {
        manager: { select: { id: true, fullName: true } },
        documents: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } },
      },
    });

    if (!employee) {
      /* Deliberately a 404 and not a 403: telling a scoped user that a record
       * exists but is not theirs leaks the directory one probe at a time. */
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return employee;
  }

  private mayList(
    category: EmployeeDocumentCategory,
    employeeId: string,
    viewer: HrViewer,
  ): boolean {
    try {
      assertCanReadDocument(category, employeeId, viewer);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private async approvedLeaveDays(employeeId: string): Promise<number> {
    const aggregate = await this.prisma.leaveRecord.aggregate({
      where: { employeeId, status: LeaveStatus.APPROVED },
      _sum: { days: true },
    });
    return Number(aggregate._sum.days ?? 0);
  }

  private async nextMatricule(): Promise<string> {
    const last = await this.prisma.employee.findFirst({
      where: { matricule: { startsWith: 'EMP-' } },
      orderBy: { matricule: 'desc' },
      select: { matricule: true },
    });
    const lastSeq = last ? Number(last.matricule.slice(4)) : 0;
    return `EMP-${String(lastSeq + 1).padStart(5, '0')}`;
  }

  /** Decimals cross the wire as numbers, not as Decimal instances. */
  private serialise<T extends { baseSalary?: Prisma.Decimal }>(employee: T) {
    return {
      ...employee,
      ...(employee.baseSalary !== undefined
        ? { baseSalary: Number(employee.baseSalary) }
        : {}),
    };
  }
}
