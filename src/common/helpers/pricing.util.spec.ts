import { resolveCommission, splitCommission } from './pricing.util';
import type { PrismaService } from '../../modules/prisma/prisma.service';

/** A deal as the two counterparty tables store one. */
type Deal = { mode: string | null; pct?: number | null; fixed?: bigint | null };

const NO_DEAL: Deal = { mode: null };

function row(deal: Deal | undefined) {
  if (!deal) return null;
  return {
    commissionMode: deal.mode,
    commissionPct: deal.pct ?? null,
    commissionFixedMinorUnits: deal.fixed ?? null,
  };
}

function prismaStub(opts: { shipper?: Deal; partner?: Deal; housePct?: number | null }): PrismaService {
  return {
    shipper: { findUnique: async () => row(opts.shipper) },
    partner: { findUnique: async () => row(opts.partner) },
    appSettings: {
      findUnique: async () =>
        opts.housePct === undefined ? null : { fleetinCommissionPct: opts.housePct },
    },
  } as unknown as PrismaService;
}

const IDS = { shipperId: 'shp-1', partnerId: 'ptr-1' };

describe('resolveCommission', () => {
  it('uses the house rate when neither party has a deal', async () => {
    const prisma = prismaStub({ shipper: NO_DEAL, partner: NO_DEAL, housePct: 10 });
    await expect(resolveCommission(prisma, IDS)).resolves.toEqual({
      mode: 'percent',
      pct: 10,
      fixedMinorUnits: 0n,
      source: 'house',
    });
  });

  it("prefers the client's deal over everything else", async () => {
    const prisma = prismaStub({
      shipper: { mode: 'percent', pct: 6 },
      partner: { mode: 'percent', pct: 8 },
      housePct: 10,
    });
    await expect(resolveCommission(prisma, IDS)).resolves.toMatchObject({ pct: 6, source: 'shipper' });
  });

  it("falls through to the haulier's deal when the client has none", async () => {
    const prisma = prismaStub({ shipper: NO_DEAL, partner: { mode: 'percent', pct: 8 }, housePct: 10 });
    await expect(resolveCommission(prisma, IDS)).resolves.toMatchObject({ pct: 8, source: 'transporter' });
  });

  it('carries a fixed per-container fee through', async () => {
    const prisma = prismaStub({ shipper: { mode: 'fixed', fixed: 5_000n }, housePct: 10 });
    await expect(resolveCommission(prisma, IDS)).resolves.toEqual({
      mode: 'fixed',
      pct: 0,
      fixedMinorUnits: 5_000n,
      source: 'shipper',
    });
  });

  /*
   * The distinction the nullable MODE exists for. A negotiated 0% — or a
   * 0-franc fee — is a real commercial decision and must not be mistaken for
   * an unset field falling back to the house rate. The mode is what says a
   * deal exists; the amount never is.
   */
  it('treats a negotiated 0% as a real deal, not as unset', async () => {
    const prisma = prismaStub({ shipper: { mode: 'percent', pct: 0 }, partner: { mode: 'percent', pct: 8 }, housePct: 10 });
    await expect(resolveCommission(prisma, IDS)).resolves.toMatchObject({ pct: 0, source: 'shipper' });
  });

  it('treats a negotiated 0-franc fee as a real deal too', async () => {
    const prisma = prismaStub({ shipper: { mode: 'fixed', fixed: 0n }, housePct: 10 });
    await expect(resolveCommission(prisma, IDS)).resolves.toMatchObject({
      mode: 'fixed',
      fixedMinorUnits: 0n,
      source: 'shipper',
    });
  });

  it('still resolves when there is no transporter on the shipment yet', async () => {
    const prisma = prismaStub({ shipper: NO_DEAL, housePct: 10 });
    await expect(
      resolveCommission(prisma, { shipperId: 'shp-1', partnerId: null }),
    ).resolves.toMatchObject({ pct: 10, source: 'house' });
  });

  it('reports 0% rather than guessing when nobody has ever set a house rate', async () => {
    const prisma = prismaStub({ shipper: NO_DEAL, partner: NO_DEAL });
    await expect(resolveCommission(prisma, IDS)).resolves.toMatchObject({ pct: 0, source: 'house' });
  });
});

const PERCENT = (pct: number) => ({ mode: 'percent' as const, pct, fixedMinorUnits: 0n });
const FIXED = (fee: bigint) => ({ mode: 'fixed' as const, pct: 0, fixedMinorUnits: fee });

describe('splitCommission', () => {
  it("takes a percentage out of the shipper's total", () => {
    expect(splitCommission(1_000_000n, PERCENT(10), 4)).toEqual({
      totalMinorUnits: 1_000_000n,
      fleetinMinorUnits: 100_000n,
      transporterMinorUnits: 900_000n,
    });
  });

  /* The whole point of the fixed mode: the fee is per CONTAINER, so a
     twenty-box shipment owes twenty fees, not one. */
  it('charges a fixed fee once per container', () => {
    expect(splitCommission(1_000_000n, FIXED(5_000n), 20)).toMatchObject({
      fleetinMinorUnits: 100_000n,
      transporterMinorUnits: 900_000n,
    });
    expect(splitCommission(1_000_000n, FIXED(5_000n), 1).fleetinMinorUnits).toBe(5_000n);
  });

  /* A flat fee bigger than the job would otherwise pay the transporter a
     negative amount. Capping is also wrong, but it is wrong where an operator
     can see it. */
  it('never pays the transporter a negative amount', () => {
    const split = splitCommission(10_000n, FIXED(9_000n), 5);
    expect(split.fleetinMinorUnits).toBe(10_000n);
    expect(split.transporterMinorUnits).toBe(0n);
  });

  it('never loses a franc to rounding', () => {
    for (const pct of [7.5, 3.33, 12.7, 0.1]) {
      for (const total of [45_000n, 133_337n, 1n, 999_999n]) {
        const split = splitCommission(total, PERCENT(pct), 3);
        expect(split.fleetinMinorUnits + split.transporterMinorUnits).toBe(total);
      }
    }
    for (const fee of [1_000n, 7_777n, 0n]) {
      for (const boxes of [1, 3, 17]) {
        const split = splitCommission(500_000n, FIXED(fee), boxes);
        expect(split.fleetinMinorUnits + split.transporterMinorUnits).toBe(500_000n);
      }
    }
  });

  it('clamps a nonsense rate instead of inverting the payout', () => {
    expect(splitCommission(1000n, PERCENT(-5), 1).fleetinMinorUnits).toBe(0n);
    expect(splitCommission(1000n, PERCENT(250), 1).transporterMinorUnits).toBe(0n);
    expect(splitCommission(1000n, PERCENT(NaN), 1).fleetinMinorUnits).toBe(0n);
    expect(splitCommission(1000n, FIXED(-50n), 1).fleetinMinorUnits).toBe(0n);
    /* A shipment with no containers counted still charges one fee, never zero
       and never a division by nothing. */
    expect(splitCommission(1000n, FIXED(100n), 0).fleetinMinorUnits).toBe(100n);
  });
});
