import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference, nextReferenceField } from '../../common/helpers/reference.util';
import { decodeMulterFilename } from '../../common/helpers/multipart-filename.util';
import { hasPermission } from '../../common/constants/permissions';
import { isPortalAccount } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  advanceDueDate,
  monthlyEquivalent,
  periodLabelFor,
  type ExpenseFrequency,
} from './expense-catalog';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { PayExpenseDto, RejectExpenseDto } from './dto/decide-expense.dto';
import {
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/recurring-expense.dto';

/** Receipts are photographs and PDFs. 15 MB covers a phone camera with room over. */
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

const RECEIPT_MIME_PREFIXES = ['image/'];
const RECEIPT_MIME_EXACT = ['application/pdf'];

/** DJF has no subunit, so the figure typed IS the minor-unit figure. */
function toMinorUnits(amount: number): bigint {
  return BigInt(Math.round(amount));
}

interface FindAllParams {
  status?: string;
  category?: string;
  from?: string;
  to?: string;
  mine?: boolean;
}

/**
 * The internal cost book.
 *
 * ## Who may do what, and why it is split that way
 *
 * **Filing is open; ruling on it is not.** `expenses.create` is granted to
 * every internal role including DRIVER and EMPLOYEE, because the person who
 * bought the diesel is the person holding the receipt, and a system only
 * finance can type into is a system that learns about November in December.
 * `expenses.approve` and `expenses.pay` are the desks'.
 *
 * An account holding `create` without `view` is scoped to its own rows
 * throughout — list, read, receipt. That scope lives here rather than in a
 * second permission string because "mine" is a row filter, not a capability;
 * see `scopeFor`.
 *
 * ## The two shapes of cost
 *
 * A **claim** is a thing that happened: somebody spent money, has the receipt,
 * and files it. A **template** is a thing that will keep happening: the rent,
 * a salary, the insurance premium. The template never counts as money —
 * posting one writes a real claim for that period and moves the due date on,
 * which keeps the rule that every figure in this book is a payment somebody
 * recorded rather than one somebody predicted.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /* ═══════════════════════════════════════════════════════════════════════
   * Access
   * ═══════════════════════════════════════════════════════════════════ */

  private canSeeEverything(user: AuthenticatedUser): boolean {
    return hasPermission(user.permissions ?? [], 'expenses.view');
  }

  /**
   * The `where` fragment that keeps a claimant to their own claims.
   *
   * `createdById` OR `paidById`: a colleague may file a claim on behalf of
   * somebody who fronted the cash — the driver who paid for the tyre still
   * has to be able to see whether he has been paid back.
   */
  private scopeFor(user: AuthenticatedUser): Record<string, unknown> {
    if (this.canSeeEverything(user)) return {};
    return { OR: [{ createdById: user.id }, { paidById: user.id }] };
  }

  private displayName(user: AuthenticatedUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Claims
   * ═══════════════════════════════════════════════════════════════════ */

  async findAll(params: FindAllParams, user: AuthenticatedUser) {
    /* A portal login is a counterparty, not staff. Nothing in this book is
       theirs, and the guard's permission check cannot say so — a custom role
       could be granted `expenses.view` and attached to a shipper account. */
    if (isPortalAccount(user)) throw new ForbiddenException('Expenses are internal to Fleetin');

    const incurredAt =
      params.from || params.to
        ? {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999Z`) } : {}),
          }
        : undefined;

    return this.prisma.expenseEntry.findMany({
      where: {
        ...(params.mine ? { OR: [{ createdById: user.id }, { paidById: user.id }] } : this.scopeFor(user)),
        ...(params.status && params.status !== 'all' ? { status: params.status } : {}),
        ...(params.category && params.category !== 'all' ? { category: params.category } : {}),
        ...(incurredAt ? { incurredAt } : {}),
      },
      include: { template: { select: { reference: true, frequency: true } } },
      /* By when the money was SPENT, not when the claim was typed. A receipt
         handed in three weeks late belongs where it happened, or the book
         cannot be read against a bank statement. */
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const expense = await this.prisma.expenseEntry.findFirst({
      where: { OR: [{ id }, { number: id }] },
      include: { template: { select: { reference: true, frequency: true } } },
    });
    if (!expense) throw new NotFoundException(`Expense "${id}" not found`);
    if (!this.canSeeEverything(user) && expense.createdById !== user.id && expense.paidById !== user.id) {
      throw new ForbiddenException('This expense belongs to somebody else');
    }
    return expense;
  }

  /**
   * File a claim.
   *
   * The receipt is **required**, and that is the whole discipline of the
   * feature: an amount with a description and no evidence is a number
   * somebody remembered. It is stored through `StorageService` like every
   * other file in the system, so it can be streamed back, moved to S3 and
   * deleted with its row.
   */
  async create(dto: CreateExpenseDto, file: Express.Multer.File | undefined, user: AuthenticatedUser) {
    if (isPortalAccount(user)) throw new ForbiddenException('Expenses are internal to Fleetin');
    this.assertReceipt(file);

    const incurredAt = new Date(dto.incurredAt);
    /* A receipt cannot be dated in the future. Left unchecked this is how a
       claim lands at the top of a list sorted by spend date and stays there. */
    if (incurredAt.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('An expense cannot be dated in the future');
    }

    const stored = await this.storage.upload(
      {
        originalname: decodeMulterFilename(file!.originalname),
        buffer: file!.buffer,
        mimetype: file!.mimetype,
        size: file!.size,
      },
      { folder: 'expenses' },
    );

    const amount = toMinorUnits(dto.amount);
    const number = await nextReferenceField(this.prisma.expenseEntry, 'number', 'EXP');
    const name = this.displayName(user);

    return this.prisma.expenseEntry.create({
      data: {
        number,
        category: dto.category,
        description: dto.description,
        vendorOrPayee: dto.vendorOrPayee ?? null,
        amountMinorUnits: amount,
        currency: 'DJF',
        fxRate: 1.0,
        baseAmountMinorUnits: amount,
        incurredAt,
        method: dto.method ?? 'CASH',
        /* Whoever filed it is assumed to have fronted it — which is true of
           every fuel receipt and every taxi. Finance can see from
           `reimbursable` whether the money is owed back to them. */
        paidById: user.id,
        paidByName: name,
        reimbursable: dto.reimbursable ?? false,
        receiptKey: stored.key,
        receiptName: decodeMulterFilename(file!.originalname),
        receiptMime: stored.mimetype,
        receiptSizeBytes: stored.size,
        status: 'Submitted',
        createdById: user.id,
        createdByName: name,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * Fix a claim that has not been ruled on.
   *
   * Only while `Submitted`, and only your own unless you hold
   * `expenses.approve` — editing the amount under an approval is how a
   * 5,000 DJF claim becomes a 500,000 DJF one after somebody signed it.
   */
  async update(id: string, dto: UpdateExpenseDto, user: AuthenticatedUser) {
    const expense = await this.findOne(id, user);
    if (expense.status !== 'Submitted') {
      throw new ConflictException(`A ${expense.status.toLowerCase()} expense can no longer be edited`);
    }
    const mine = expense.createdById === user.id;
    if (!mine && !hasPermission(user.permissions ?? [], 'expenses.approve')) {
      throw new ForbiddenException('Only the person who filed this claim can change it');
    }

    const amount = dto.amount === undefined ? undefined : toMinorUnits(dto.amount);
    return this.prisma.expenseEntry.update({
      where: { id: expense.id },
      data: {
        category: dto.category,
        description: dto.description,
        vendorOrPayee: dto.vendorOrPayee,
        amountMinorUnits: amount,
        baseAmountMinorUnits: amount,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : undefined,
        method: dto.method,
        reimbursable: dto.reimbursable,
        notes: dto.notes,
      },
    });
  }

  /** Accept the claim as a real cost. Fleetin now owes it. */
  async approve(id: string, user: AuthenticatedUser) {
    const expense = await this.mustExist(id);
    if (expense.status !== 'Submitted') {
      throw new ConflictException(`This expense is already ${expense.status.toLowerCase()}`);
    }
    return this.prisma.expenseEntry.update({
      where: { id: expense.id },
      data: {
        status: 'Approved',
        approvedById: user.id,
        approvedByName: this.displayName(user),
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
  }

  /**
   * Refuse it, with the reason on the row.
   *
   * The reason is required. A person whose fuel receipt came back refused
   * cannot re-file it correctly without being told what was wrong, and a
   * blank refusal turns into a conversation the system was supposed to save.
   */
  async reject(id: string, dto: RejectExpenseDto, user: AuthenticatedUser) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Say why the claim is refused — the claimant has to re-file it');

    const expense = await this.mustExist(id);
    if (expense.status === 'Paid') throw new ConflictException('This expense has already been paid');
    if (expense.status === 'Rejected') throw new ConflictException('This expense is already rejected');

    return this.prisma.expenseEntry.update({
      where: { id: expense.id },
      data: {
        status: 'Rejected',
        rejectionReason: reason,
        approvedById: user.id,
        approvedByName: this.displayName(user),
        approvedAt: new Date(),
      },
    });
  }

  /**
   * The money moved: settled with the supplier, or reimbursed to the
   * colleague who fronted it. Only from `Approved` — paying a claim nobody
   * ruled on is the control this ladder exists to impose.
   */
  async markPaid(id: string, dto: PayExpenseDto, user: AuthenticatedUser) {
    const expense = await this.mustExist(id);
    if (expense.status === 'Paid') throw new ConflictException('This expense is already paid');
    if (expense.status !== 'Approved') {
      throw new ConflictException('Approve the claim before recording its payment');
    }
    return this.prisma.expenseEntry.update({
      where: { id: expense.id },
      data: {
        status: 'Paid',
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        approvedById: expense.approvedById ?? user.id,
        approvedByName: expense.approvedByName ?? this.displayName(user),
      },
    });
  }

  /**
   * Withdraw a claim.
   *
   * Only your own, only while `Submitted`. Once a desk has ruled on it the
   * row is part of the record — a rejected claim in particular has to stay
   * put, or the reason it was refused disappears along with it.
   */
  async remove(id: string, user: AuthenticatedUser) {
    const expense = await this.findOne(id, user);
    if (expense.status !== 'Submitted') {
      throw new ConflictException(`A ${expense.status.toLowerCase()} expense cannot be withdrawn`);
    }
    if (expense.createdById !== user.id && !hasPermission(user.permissions ?? [], 'expenses.manage')) {
      throw new ForbiddenException('Only the person who filed this claim can withdraw it');
    }
    if (expense.receiptKey) await this.storage.delete(expense.receiptKey);
    return this.prisma.expenseEntry.delete({ where: { id: expense.id } });
  }

  /** The stored receipt's bytes, for streaming or preview. */
  async receipt(id: string, user: AuthenticatedUser) {
    const expense = await this.findOne(id, user);
    if (!expense.receiptKey) throw new NotFoundException('This expense carries no receipt');
    return {
      buffer: await this.storage.get(expense.receiptKey),
      name: expense.receiptName ?? `${expense.number}.pdf`,
      mimeType: expense.receiptMime ?? 'application/octet-stream',
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Recurring templates
   * ═══════════════════════════════════════════════════════════════════ */

  /**
   * The standing book, each template carrying what it costs per month.
   *
   * `monthlyMinorUnits` is computed here rather than on the client because it
   * is the only figure that lets a weekly cleaner, a monthly rent and an
   * annual premium be added together — and two implementations of that
   * arithmetic would eventually disagree about what a month is.
   */
  async findTemplates() {
    const templates = await this.prisma.recurringExpenseTemplate.findMany({
      orderBy: [{ isActive: 'desc' }, { nextDueAt: 'asc' }],
    });
    return templates.map((template) => ({
      ...template,
      monthlyMinorUnits: Math.round(
        monthlyEquivalent(template.amountMinorUnits, template.frequency as ExpenseFrequency),
      ).toString(),
    }));
  }

  async createTemplate(dto: CreateRecurringExpenseDto, user: AuthenticatedUser) {
    const reference = await nextReference(this.prisma.recurringExpenseTemplate, 'REX');
    return this.prisma.recurringExpenseTemplate.create({
      data: {
        reference,
        category: dto.category,
        description: dto.description,
        vendorOrPayee: dto.vendorOrPayee,
        amountMinorUnits: toMinorUnits(dto.amount),
        currency: 'DJF',
        method: dto.method ?? 'BANK_TRANSFER',
        frequency: dto.frequency,
        nextDueAt: new Date(dto.nextDueAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        notes: dto.notes ?? null,
        createdById: user.id,
        createdByName: this.displayName(user),
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateRecurringExpenseDto) {
    const template = await this.mustExistTemplate(id);
    return this.prisma.recurringExpenseTemplate.update({
      where: { id: template.id },
      data: {
        category: dto.category,
        description: dto.description,
        vendorOrPayee: dto.vendorOrPayee,
        amountMinorUnits: dto.amount === undefined ? undefined : toMinorUnits(dto.amount),
        frequency: dto.frequency,
        method: dto.method,
        nextDueAt: dto.nextDueAt ? new Date(dto.nextDueAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive,
        notes: dto.notes,
      },
    });
  }

  /**
   * Turn a due obligation into a real expense.
   *
   * **Only a period that has actually arrived.** Without that check, pressing
   * the button twice does not double-book September — it books October, and
   * a third press books November, walking a year of rent into the book in
   * three clicks. The date guard is the one that matters; the
   * `(template, period)` check below it is the race guard, for two people
   * looking at the same due template at the same time.
   *
   * The entry lands `Approved`, not `Submitted` — the approval happened when
   * somebody committed the company to the lease, and asking a desk to
   * re-approve its own rent twelve times a year is ceremony, not control. It
   * still has to be marked paid, because that is the part that is actually a
   * fact about the world.
   *
   * No receipt, and that is deliberate: the bank slip for a standing order
   * arrives after the payment does, and refusing to book the cost until the
   * paperwork catches up is how a month's rent goes missing from the book.
   */
  async postTemplate(id: string, user: AuthenticatedUser) {
    const template = await this.mustExistTemplate(id);
    if (!template.isActive) throw new ConflictException('This obligation is paused');

    const frequency = template.frequency as ExpenseFrequency;
    const due = template.nextDueAt;

    /* End of the due day, not its midnight: rent due on the 1st is bookable
       all of the 1st, and comparing against the stored timestamp would leave
       the button refusing itself for a day. UTC, like the rest of the
       schedule — see `advanceDueDate`. */
    const dueBy = new Date(due);
    dueBy.setUTCHours(23, 59, 59, 999);
    if (dueBy.getTime() > Date.now()) {
      throw new ConflictException(
        `${template.reference} is not due until ${due.toISOString().slice(0, 10)}`,
      );
    }

    const period = periodLabelFor(due, frequency);

    const already = await this.prisma.expenseEntry.findFirst({
      where: { recurringTemplateId: template.id, periodLabel: period },
      select: { id: true, number: true },
    });
    if (already) {
      throw new ConflictException(`${period} is already booked as ${already.number}`);
    }

    const number = await nextReferenceField(this.prisma.expenseEntry, 'number', 'EXP');
    const name = this.displayName(user);
    const nextDue = advanceDueDate(due, frequency);

    const [entry] = await this.prisma.$transaction([
      this.prisma.expenseEntry.create({
        data: {
          number,
          category: template.category,
          description: `${template.description} — ${period}`,
          vendorOrPayee: template.vendorOrPayee,
          amountMinorUnits: template.amountMinorUnits,
          currency: template.currency,
          fxRate: 1.0,
          baseAmountMinorUnits: template.amountMinorUnits,
          incurredAt: due,
          method: template.method,
          paidById: user.id,
          paidByName: name,
          reimbursable: false,
          status: 'Approved',
          isRecurring: true,
          recurringTemplateId: template.id,
          periodLabel: period,
          approvedById: user.id,
          approvedByName: name,
          approvedAt: new Date(),
          createdById: user.id,
          createdByName: name,
          notes: template.notes,
        },
      }),
      this.prisma.recurringExpenseTemplate.update({
        where: { id: template.id },
        data: {
          lastPostedAt: new Date(),
          nextDueAt: nextDue,
          /* An obligation that has run past its own end stops asking. The
             lease is over; the row stays for its history. */
          isActive: template.endsAt ? nextDue <= template.endsAt : true,
        },
      }),
    ]);
    return entry;
  }

  /**
   * Remove a standing obligation.
   *
   * Refused once it has booked anything: those entries are real payments, and
   * the template is the only thing that says what they were for. Pause it
   * instead — `isActive: false` stops it asking and keeps the history.
   */
  async removeTemplate(id: string) {
    const template = await this.mustExistTemplate(id);
    const posted = await this.prisma.expenseEntry.count({ where: { recurringTemplateId: template.id } });
    if (posted > 0) {
      throw new ConflictException(
        `${template.reference} has booked ${posted} payment${posted === 1 ? '' : 's'}. Pause it instead of deleting it.`,
      );
    }
    return this.prisma.recurringExpenseTemplate.delete({ where: { id: template.id } });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Guards
   * ═══════════════════════════════════════════════════════════════════ */

  private async mustExist(id: string) {
    const expense = await this.prisma.expenseEntry.findFirst({ where: { OR: [{ id }, { number: id }] } });
    if (!expense) throw new NotFoundException(`Expense "${id}" not found`);
    return expense;
  }

  private async mustExistTemplate(id: string) {
    const template = await this.prisma.recurringExpenseTemplate.findFirst({
      where: { OR: [{ id }, { reference: id }] },
    });
    if (!template) throw new NotFoundException(`Recurring expense "${id}" not found`);
    return template;
  }

  private assertReceipt(file: Express.Multer.File | undefined): void {
    if (!file) {
      throw new BadRequestException('Attach the receipt — a claim without one cannot be approved');
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('The receipt is larger than 15 MB');
    }
    const mime = file.mimetype ?? '';
    const accepted =
      RECEIPT_MIME_EXACT.includes(mime) || RECEIPT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
    if (!accepted) {
      throw new BadRequestException('The receipt must be a photograph or a PDF');
    }
  }
}
