import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AppendLedgerEntry {
  entryDate: Date;
  type: string;
  direction: 'IN' | 'OUT';
  amountMinorUnits: bigint;
  currency: string;
  fxRate: number;
  baseAmountMinorUnits: bigint;
  counterpartyType: 'SHIPPER' | 'TRANSPORTER' | 'BANK' | 'EMPLOYEE' | 'VENDOR';
  counterpartyId: string;
  counterpartyName: string;
  bankAccountId?: string;
  sourceType: 'invoice' | 'payment' | 'drawdown' | 'payment_order' | 'expense' | 'credit_note';
  sourceId: string;
  missionId?: string;
  description: string;
  createdById: string;
  createdByName: string;
}

/**
 * Append-only, single source of truth — every money-moving action in
 * `invoices`/`payment-orders`/`funding` calls `append()` once, as the last
 * step after its own write. No update/delete method exists on purpose;
 * correcting an entry means posting a new one and setting
 * `reversedByEntryId` on the old one, never editing history in place.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Callers running inside a `$transaction` pass their transaction client so the entry commits (or rolls back) with the money move it records. */
  async append(entry: AppendLedgerEntry, client: Prisma.TransactionClient = this.prisma) {
    return client.ledgerEntry.create({ data: entry });
  }

  async findAll(params: { counterpartyId?: string; sourceType?: string; missionId?: string; page: number; limit: number }) {
    const { counterpartyId, sourceType, missionId, page, limit } = params;
    const where = {
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(missionId ? { missionId } : {}),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where, skip, take: limit, orderBy: { entryDate: 'desc' } }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
