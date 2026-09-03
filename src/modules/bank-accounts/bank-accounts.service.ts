import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BankAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { RecordMovementDto, TransferFundsDto } from './dto/bank-movement.dto';

/**
 * Every account Fleetin actually holds money in — a shipper's payment lands
 * in one, a transporter is paid out of one, a drawdown disburses into one.
 * `currentBalance` is the one number every other money-moving service in
 * this phase (`invoices`, `payment-orders`, `drawdowns`) updates through
 * `adjustBalance()` — never edited directly, so it can never drift from the
 * `Payment`/`Drawdown` rows that actually moved it.
 *
 * The desk can also move money by hand — `deposit`, `withdraw` and `transfer`
 * — but on exactly the same terms: each writes a `BankMovement` row and moves
 * the balance in one transaction, so the balance always has a row explaining
 * it. `update()` deliberately cannot touch a balance for the same reason.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll() {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(accounts.map((account) => this.withLogoUrl(account)));
  }

  async findOne(id: string) {
    return this.withLogoUrl(await this.getRecord(id));
  }

  async create(dto: CreateBankAccountDto) {
    const account = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await this.clearPrimary(tx, null);
      return tx.bankAccount.create({
        data: {
          bankName: dto.bankName,
          accountHolder: dto.accountHolder,
          accountNumber: dto.accountNumber,
          iban: dto.iban,
          swiftCode: dto.swiftCode,
          currency: dto.currency,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
    return this.withLogoUrl(account);
  }

  /**
   * Registration details only. There is no balance field here on purpose —
   * a wrong balance is corrected with a real deposit or withdrawal, which
   * leaves a row behind, not by silently retyping the number.
   */
  async update(id: string, dto: UpdateBankAccountDto) {
    const existing = await this.getRecord(id);

    const account = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await this.clearPrimary(tx, existing.id);
      return tx.bankAccount.update({
        where: { id: existing.id },
        data: {
          bankName: dto.bankName,
          accountHolder: dto.accountHolder,
          accountNumber: dto.accountNumber,
          iban: dto.iban,
          swiftCode: dto.swiftCode,
          currency: dto.currency,
          isPrimary: dto.isPrimary,
        },
      });
    });
    return this.withLogoUrl(account);
  }

  /** Soft-close. The row stays so historic payments and movements still resolve. */
  async remove(id: string) {
    const existing = await this.getRecord(id);
    if (existing.currentBalance !== 0n) {
      throw new BadRequestException(
        `${existing.bankName} still holds ${existing.currentBalance} — move the balance out before closing the account`,
      );
    }
    const account = await this.prisma.bankAccount.update({
      where: { id: existing.id },
      data: { isActive: false, isPrimary: false },
    });
    return this.withLogoUrl(account);
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const existing = await this.getRecord(id);
    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'logos' },
    );
    const account = await this.prisma.bankAccount.update({
      where: { id: existing.id },
      data: { logoKey: stored.key },
    });
    return this.withLogoUrl(account);
  }

  async removeLogo(id: string) {
    const existing = await this.getRecord(id);
    const account = await this.prisma.bankAccount.update({
      where: { id: existing.id },
      data: { logoKey: null },
    });
    return this.withLogoUrl(account);
  }

  /* ─── Money the desk moves by hand ──────────────────────────────────── */

  /** Every movement on one account, newest first — the "why" behind its balance. */
  async movements(params: { bankAccountId?: string; limit?: number }) {
    return this.prisma.bankMovement.findMany({
      where: params.bankAccountId ? { bankAccountId: params.bankAccountId } : {},
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: params.limit ?? 100,
    });
  }

  async deposit(id: string, dto: RecordMovementDto, actorId: string, actorName: string) {
    return this.recordSingleMovement(id, dto, 'DEPOSIT', actorId, actorName);
  }

  async withdraw(id: string, dto: RecordMovementDto, actorId: string, actorName: string) {
    return this.recordSingleMovement(id, dto, 'WITHDRAWAL', actorId, actorName);
  }

  /**
   * Money from one Fleetin account into another. Both legs and both balances
   * move inside one transaction — a transfer can never half-happen.
   *
   * Cross-currency is allowed but never guessed: the caller states what
   * actually lands in the destination.
   */
  async transfer(fromId: string, dto: TransferFundsDto, actorId: string, actorName: string) {
    if (fromId === dto.toBankAccountId) {
      throw new BadRequestException('Source and destination must be different accounts');
    }

    const [from, to] = await Promise.all([this.getRecord(fromId), this.getRecord(dto.toBankAccountId)]);
    const sent = BigInt(dto.amountMinorUnits);
    const received = BigInt(dto.receivedAmountMinorUnits ?? dto.amountMinorUnits);

    if (from.currency !== to.currency && dto.receivedAmountMinorUnits === undefined) {
      throw new BadRequestException(
        `${from.bankName} holds ${from.currency} and ${to.bankName} holds ${to.currency} — state the amount received to transfer across currencies`,
      );
    }
    if (from.currentBalance < sent) {
      throw new BadRequestException(
        `Insufficient funds in ${from.bankName} (${from.accountNumber}) — balance ${from.currentBalance}, tried to transfer ${sent}`,
      );
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const groupId = randomUUID();

      const fromBalance = from.currentBalance - sent;
      const toBalance = to.currentBalance + received;

      const outLeg = await tx.bankMovement.create({
        data: {
          reference: await this.nextMovementReference(tx),
          bankAccountId: from.id,
          type: 'TRANSFER_OUT',
          direction: 'OUT',
          amountMinorUnits: sent,
          currency: from.currency,
          balanceAfterMinorUnits: fromBalance,
          counterpartyAccountId: to.id,
          groupId,
          method: dto.method ?? 'BANK_TRANSFER',
          externalReference: dto.externalReference,
          description: dto.description ?? `Transfer to ${to.bankName} · ${to.accountNumber.slice(-4)}`,
          occurredAt,
          createdById: actorId,
          createdByName: actorName,
        },
      });

      const inLeg = await tx.bankMovement.create({
        data: {
          reference: await this.nextMovementReference(tx),
          bankAccountId: to.id,
          type: 'TRANSFER_IN',
          direction: 'IN',
          amountMinorUnits: received,
          currency: to.currency,
          balanceAfterMinorUnits: toBalance,
          counterpartyAccountId: from.id,
          groupId,
          method: dto.method ?? 'BANK_TRANSFER',
          externalReference: dto.externalReference,
          description: dto.description ?? `Transfer from ${from.bankName} · ${from.accountNumber.slice(-4)}`,
          occurredAt,
          createdById: actorId,
          createdByName: actorName,
        },
      });

      await tx.bankAccount.update({ where: { id: from.id }, data: { currentBalance: fromBalance } });
      await tx.bankAccount.update({ where: { id: to.id }, data: { currentBalance: toBalance } });

      return { groupId, from: outLeg, to: inLeg };
    });
  }

  /**
   * Money in (`delta > 0`) or out (`delta < 0`), atomically. Refuses to take
   * an account negative — every payout is really cash leaving a specific
   * account, so it can't pay out more than the account actually holds.
   *
   * The guard and the write are one `updateMany` — the balance condition sits
   * in the WHERE, so two concurrent adjustments can never both read the same
   * balance and lose a delta. Callers running inside a `$transaction` pass
   * their transaction client so the debit rolls back with everything else.
   */
  async adjustBalance(bankAccountId: string, deltaMinorUnits: bigint, client: Prisma.TransactionClient = this.prisma) {
    const { count } = await client.bankAccount.updateMany({
      where: {
        id: bankAccountId,
        isActive: true,
        ...(deltaMinorUnits < 0n ? { currentBalance: { gte: -deltaMinorUnits } } : {}),
      },
      data: { currentBalance: { increment: deltaMinorUnits } },
    });
    if (count === 0) {
      const account = await client.bankAccount.findFirst({ where: { id: bankAccountId, isActive: true } });
      if (!account) throw new NotFoundException(`Bank account with ID "${bankAccountId}" not found`);
      throw new BadRequestException(
        `Insufficient funds in ${account.bankName} (${account.accountNumber}) — balance ${account.currentBalance}, tried to move ${deltaMinorUnits}`,
      );
    }
  }

  /* ─── Internals ─────────────────────────────────────────────────────── */

  /** The raw row, for callers that only read scalars. */
  private async getRecord(id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, isActive: true } });
    if (!account) throw new NotFoundException(`Bank account with ID "${id}" not found`);
    return account;
  }

  /** `logoKey` is storage's business; every caller outside wants a URL. */
  private async withLogoUrl(account: BankAccount) {
    return {
      ...account,
      logoUrl: account.logoKey ? await this.storage.getUrl(account.logoKey) : null,
    };
  }

  /** Exactly one account is primary at a time. */
  private async clearPrimary(tx: Prisma.TransactionClient, exceptId: string | null) {
    await tx.bankAccount.updateMany({
      where: { isPrimary: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isPrimary: false },
    });
  }

  private async recordSingleMovement(
    id: string,
    dto: RecordMovementDto,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    actorId: string,
    actorName: string,
  ) {
    const account = await this.getRecord(id);
    const amount = BigInt(dto.amountMinorUnits);
    const delta = type === 'DEPOSIT' ? amount : -amount;
    const balanceAfter = account.currentBalance + delta;

    if (balanceAfter < 0n) {
      throw new BadRequestException(
        `Insufficient funds in ${account.bankName} (${account.accountNumber}) — balance ${account.currentBalance}, tried to withdraw ${amount}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.bankMovement.create({
        data: {
          reference: await this.nextMovementReference(tx),
          bankAccountId: account.id,
          type,
          direction: type === 'DEPOSIT' ? 'IN' : 'OUT',
          amountMinorUnits: amount,
          currency: account.currency,
          balanceAfterMinorUnits: balanceAfter,
          method: dto.method ?? 'CASH',
          externalReference: dto.externalReference,
          description: dto.description,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          createdById: actorId,
          createdByName: actorName,
        },
      });
      await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });
      return movement;
    });
  }

  /**
   * `BMV-00042` — the app-wide three-letters-five-digits scheme. Zero-padded
   * so a plain `desc` sort is genuinely the highest number issued.
   */
  private async nextMovementReference(tx: Prisma.TransactionClient) {
    const last = await tx.bankMovement.findFirst({
      where: { reference: { startsWith: 'BMV-' } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    const next = last ? parseInt(last.reference.slice(4), 10) + 1 : 1;
    return `BMV-${String(next).padStart(5, '0')}`;
  }
}
