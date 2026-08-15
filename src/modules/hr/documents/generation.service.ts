import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentScope,
  EmployeeDocumentCategory,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { HrAuditService } from '../hr-audit.service';
import { PayloadBuilder, type DocumentFieldValues } from './payload.builder';
import { DocumentRenderer } from './document.renderer';
import { PdfService } from './pdf.service';
import { XlsxService } from './xlsx.service';

export interface GenerateArgs {
  templateKey: string;
  employeeId?: string;
  periodId?: string;
  fields: DocumentFieldValues;
}

/** Signed download links live ten minutes, like every other HR document. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * What a document is called once it leaves the system.
 *
 * `Attestation de travail — Kadidja Houmad — Fl-att-02-026.pdf`: what it is,
 * who it is about, and the reference it was filed under, in the order someone
 * scanning a downloads folder reads them. The reference is last because it is
 * the tiebreaker, not the identifier a person searches by.
 *
 * Slashes cannot survive a filename and colons do not survive Windows, so the
 * reference's separators are flattened. Everything else is left alone —
 * accented characters are fine in a filename and this company writes French.
 */
export function documentFileName(parts: {
  label: string;
  subject?: string;
  referenceNo: string;
}): string {
  const safe = (value: string) => value.replace(/[/\\:*?"<>|]+/g, '-').trim();
  const segments = [safe(parts.label), parts.subject ? safe(parts.subject) : '', safe(parts.referenceNo)];
  return `${segments.filter(Boolean).join(' — ')}.pdf`;
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: HrAuditService,
    private readonly payloads: PayloadBuilder,
    private readonly renderer: DocumentRenderer,
    private readonly pdf: PdfService,
    private readonly xlsx: XlsxService,
  ) {}

  async templates() {
    const templates = await this.prisma.documentTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ scope: 'asc' }, { label: 'asc' }],
    });
    return templates.map((template) => ({
      key: template.key,
      label: template.label,
      scope: template.scope,
      refPrefix: template.refPrefix,
      version: template.version,
      requiresFields: template.requiresFields,
    }));
  }

  /**
   * Renders without consuming anything.
   *
   * The reference number shown is the *next* one that would be allocated —
   * peeked, never reserved. Two people previewing at once therefore see the
   * same number, and whichever of them issues first gets it; the other is
   * allocated the next one inside the issue transaction.
   */
  async preview(args: GenerateArgs) {
    const template = await this.requireTemplate(args.templateKey);
    const referenceNo = await this.peekReference(template.key, args.fields);

    const payload = await this.payloads.build({ ...args, referenceNo });
    const html = this.renderer.render(payload, template.bodyFr);

    return {
      html,
      payload,
      referenceNo,
      landscape: this.renderer.isLandscape(template.key),
    };
  }

  /**
   * Issues the document: allocates the reference, renders, stores the PDF,
   * writes the snapshot, and files a copy against the employee.
   *
   * Reissuing produces a new reference number and a new row. Documents are
   * never overwritten — a superseded attestation still has to be explainable.
   */
  async issue(
    user: { id: string; firstName: string; lastName: string; email: string; permissions: string[] },
    args: GenerateArgs,
  ) {
    const template = await this.requireTemplate(args.templateKey);

    if (template.scope === DocumentScope.EMPLOYEE && !args.employeeId) {
      throw new BadRequestException('This document is issued to one employee; none was chosen');
    }

    const issueDate = args.fields.issueDate ? new Date(args.fields.issueDate) : new Date();

    /*
     * Everything that makes the document real happens in one transaction:
     * allocate the number, render, store, record. The sequence row stays
     * locked for the duration.
     *
     * Rendering inside a transaction is normally something to avoid, and it is
     * a deliberate trade here. Allocating the number first and committing
     * before the render is faster, but a failed render then burns the number
     * permanently — and a filed document series with holes in it is a question
     * an inspector will ask. Holding the lock across a ~500 ms render
     * serialises concurrent issues *of the same template*, which at 5–40
     * employees is free, and buys a sequence that is both collision-free and
     * gapless.
     *
     * The storage write is the one step that cannot be rolled back. If the
     * transaction fails after it, an unreferenced PDF is left behind — a
     * harmless orphan, and much cheaper than either alternative.
     */
    const { referenceNo, payload, issued, employeeDocumentId, storageKey } =
      await this.prisma.$transaction(
        async (tx) => {
          const allocated = await this.allocateReference(
            tx as unknown as PrismaClient,
            template.key,
            issueDate,
          );

          const builtPayload = await this.payloads.build({ ...args, referenceNo: allocated });
          const html = this.renderer.render(builtPayload, template.bodyFr);
          const pdf = await this.pdf.render(html, {
            landscape: this.renderer.isLandscape(template.key),
          });

          const stored = await this.storage.upload(
            {
              originalname: `${allocated.replace(/[/\\]/g, '-')}.pdf`,
              buffer: pdf,
              mimetype: 'application/pdf',
              size: pdf.length,
            },
            { folder: `hr/issued/${issueDate.getUTCFullYear()}` },
          );

          /* An employee-scope document also lands in that employee's file, so
           * the vault is a complete record of what was issued to whom. */
          let filedDocumentId: string | null = null;
          if (args.employeeId) {
            const filed = await tx.employeeDocument.create({
              data: {
                employeeId: args.employeeId,
                category: EmployeeDocumentCategory.GENERATED_DOCUMENT,
                fileKey: stored.key,
                originalName: documentFileName({
                  label: template.label,
                  subject: (builtPayload.employee as { fullName?: string } | undefined)?.fullName,
                  referenceNo: allocated,
                }),
                mimeType: 'application/pdf',
                sizeBytes: pdf.length,
                issueDate,
                uploadedById: user.id,
                notes: `Généré automatiquement (${template.key})`,
              },
            });
            filedDocumentId = filed.id;
          }

          const record = await tx.issuedDocument.create({
            data: {
              templateKey: template.key,
              employeeId: args.employeeId ?? null,
              periodId: args.periodId ?? (builtPayload.period as { id?: string })?.id ?? null,
              referenceNo: allocated,
              issueDate,
              payloadJson: builtPayload as Prisma.InputJsonValue,
              fileKey: stored.key,
              employeeDocumentId: filedDocumentId,
              issuedById: user.id,
            },
          });

          return {
            referenceNo: allocated,
            payload: builtPayload,
            issued: record,
            employeeDocumentId: filedDocumentId,
            storageKey: stored.key,
          };
        },
        /* Generous, because a cold Chromium start is the slow case. Well
         * inside MySQL's 50 s lock-wait timeout either way. */
        { timeout: 30_000, maxWait: 15_000 },
      );

    await this.audit.record(user as never, {
      entity: 'IssuedDocument',
      entityId: issued.id,
      action: 'issue',
      detail: {
        templateKey: template.key,
        referenceNo,
        employeeId: args.employeeId ?? null,
        periodId: issued.periodId,
      },
    });

    return {
      id: issued.id,
      referenceNo,
      fileKey: storageKey,
      downloadUrl: await this.storage.getUrl(storageKey, SIGNED_URL_TTL_SECONDS),
      issueDate,
      employeeDocumentId,
    };
  }

  async issuedHistory(filters: { employeeId?: string; periodId?: string; templateKey?: string }) {
    return this.prisma.issuedDocument.findMany({
      where: {
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.periodId ? { periodId: filters.periodId } : {}),
        ...(filters.templateKey ? { templateKey: filters.templateKey } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        templateKey: true,
        referenceNo: true,
        issueDate: true,
        employeeId: true,
        periodId: true,
        issuedById: true,
        createdAt: true,
        employee: { select: { id: true, fullName: true, matricule: true } },
      },
    });
  }

  async downloadIssued(
    user: { id: string; firstName: string; lastName: string; email: string; permissions: string[] },
    issuedId: string,
  ) {
    const issued = await this.prisma.issuedDocument.findUnique({ where: { id: issuedId } });
    if (!issued) throw new NotFoundException(`Issued document ${issuedId} not found`);

    await this.audit.record(user as never, {
      entity: 'IssuedDocument',
      entityId: issuedId,
      action: 'download',
      detail: { referenceNo: issued.referenceNo },
    });

    return {
      url: await this.storage.getUrl(issued.fileKey, SIGNED_URL_TTL_SECONDS),
      referenceNo: issued.referenceNo,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    };
  }

  /**
   * The issued PDF's own bytes, named for a human.
   *
   * Streaming beats handing back a storage URL for two reasons that both
   * matter here. The local driver's URL is a path under `/uploads` served
   * statically and *unauthenticated* — anyone holding the key could read a
   * payslip — while this route runs the same permission check and audit write
   * as everything else in the module. And a static URL carries the object key
   * as its filename, so every document the user saved was called
   * `3cfc47df-6524-….pdf`; the name is built here instead.
   */
  async fileIssued(
    user: { id: string; firstName: string; lastName: string; email: string; permissions: string[] },
    issuedId: string,
  ) {
    const issued = await this.prisma.issuedDocument.findUnique({ where: { id: issuedId } });
    if (!issued) throw new NotFoundException(`Issued document ${issuedId} not found`);

    await this.audit.record(user as never, {
      entity: 'IssuedDocument',
      entityId: issuedId,
      action: 'download',
      detail: { referenceNo: issued.referenceNo },
    });

    const payload = (issued.payloadJson ?? {}) as {
      templateLabel?: string;
      employee?: { fullName?: string };
      period?: { labelFr?: string };
    };

    return {
      buffer: await this.storage.get(issued.fileKey),
      fileName: documentFileName({
        label: payload.templateLabel ?? issued.templateKey,
        subject: payload.employee?.fullName ?? payload.period?.labelFr,
        referenceNo: issued.referenceNo,
      }),
      referenceNo: issued.referenceNo,
    };
  }

  /** The bordereau as a spreadsheet, from the same payload as the PDF. */
  async bordereauXlsx(args: GenerateArgs) {
    const template = await this.requireTemplate('bordereau_cnss');
    const referenceNo = await this.peekReference(template.key, args.fields);
    const payload = (await this.payloads.build({
      templateKey: template.key,
      periodId: args.periodId,
      fields: args.fields,
      referenceNo,
    })) as Record<string, any>;

    return {
      buffer: await this.xlsx.bordereau(payload),
      fileName: `bordereau-cnss-${payload.period.month}-${payload.period.year}.xlsx`,
    };
  }

  // ── Reference numbers ────────────────────────────────────────────────────

  private async requireTemplate(key: string) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { key } });
    if (!template || !template.isActive) {
      throw new NotFoundException(`Unknown document "${key}"`);
    }
    return template;
  }

  /**
   * Allocates the next number for this template and year, under a row lock.
   *
   * `SELECT ... FOR UPDATE` inside the caller's transaction: a second issue
   * arriving at the same instant blocks on the row rather than reading the
   * same `lastSeq`. Without it, two people clicking Issue together both get
   * `-01/026` and the unique index on `referenceNo` turns that into a 500 for
   * whoever loses.
   */
  private async allocateReference(
    tx: PrismaClient,
    templateKey: string,
    issueDate: Date,
  ): Promise<string> {
    const year = issueDate.getUTCFullYear();

    await tx.$executeRaw`
      INSERT INTO hr_document_sequences (templateKey, year, lastSeq)
      VALUES (${templateKey}, ${year}, 0)
      ON DUPLICATE KEY UPDATE lastSeq = lastSeq
    `;

    const locked = await tx.$queryRaw<{ lastSeq: number }[]>`
      SELECT lastSeq FROM hr_document_sequences
      WHERE templateKey = ${templateKey} AND year = ${year}
      FOR UPDATE
    `;

    const next = (locked[0]?.lastSeq ?? 0) + 1;
    await tx.$executeRaw`
      UPDATE hr_document_sequences SET lastSeq = ${next}
      WHERE templateKey = ${templateKey} AND year = ${year}
    `;

    return this.formatReference(await this.pattern(), templateKey, next, year);
  }

  /** The next number, read without reserving it. Previews only. */
  private async peekReference(
    templateKey: string,
    fields: DocumentFieldValues,
  ): Promise<string> {
    const issueDate = fields.issueDate ? new Date(fields.issueDate) : new Date();
    const year = issueDate.getUTCFullYear();
    const sequence = await this.prisma.documentSequence.findUnique({
      where: { templateKey_year: { templateKey, year } },
    });
    return this.formatReference(
      await this.pattern(),
      templateKey,
      (sequence?.lastSeq ?? 0) + 1,
      year,
    );
  }

  private async pattern(): Promise<string> {
    const settings = await this.prisma.companySettings.findFirst({
      select: { referencePattern: true },
    });
    return settings?.referencePattern ?? 'Fl/{prefix}-{seq}/{yy}';
  }

  private async formatReference(
    pattern: string,
    templateKey: string,
    sequence: number,
    year: number,
  ): Promise<string> {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { key: templateKey },
      select: { refPrefix: true },
    });

    return pattern
      .replace('{prefix}', template?.refPrefix ?? templateKey.slice(0, 3))
      .replace('{seq}', String(sequence).padStart(2, '0'))
      /* The source workbook writes 2025 as "025" — three digits, not two. The
       * pattern is configurable precisely so this stays the business's call. */
      .replace('{yyyy}', String(year))
      .replace('{yy}', String(year).slice(-3));
  }
}
