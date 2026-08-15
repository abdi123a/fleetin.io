/**
 * Money columns (LedgerEntry.amountMinorUnits, PricingTier.basePriceMinorUnits,
 * Shipment.rateMinorUnits, etc.) are Prisma BigInt — JSON.stringify throws on
 * a bare BigInt with no toJSON. This is the standard fix, applied once,
 * globally, rather than hand-converting every money field at every call site.
 * Money crossing the wire as a decimal-safe string (not a JS number) is also
 * the right behaviour — a JS number can't hold every BigInt value exactly.
 *
 * Side-effect-only import: `import '../common/bigint-json.patch'`. Applied in
 * both main.ts (real boot) and test/setup-app.ts (e2e tests boot the app a
 * different way and would otherwise not get it).
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};
