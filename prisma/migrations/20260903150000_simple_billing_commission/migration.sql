-- Simple billing: one document per shipment, and a percentage per counterparty.
--
-- The schema half of dropping the working-capital finance module.
--
--   1. A negotiated commission percentage on BOTH the shipper and the
--      transporter. NULL on both is the normal state and means "no deal" — the
--      house rate in `app_settings.fleetinCommissionPct` applies. Nullable
--      rather than defaulted to the house figure on purpose: a copied default
--      would stop tracking the house rate the moment somebody changed it.
--      Resolution order is shipper → transporter → house, because the client's
--      number is the one printed on the invoice.
--
--   2. An invoice becomes one of two documents — a `proforma` (a quote, before
--      the work) or an `invoice` (the bill, after it) — built from exactly ONE
--      shipment and its bookings. `shipmentId` is the new link; the
--      `missionIds` JSON array stays for the monthly statements written under
--      the old model and is never written with more than one id again.
--
--   3. `lines`, `commissionPct` and `commissionMinorUnits` are SNAPSHOTS taken
--      at issue. A container added to the shipment next week, or a renegotiated
--      percentage, must never silently restate a document the client has
--      already been sent and may already have paid.
--
-- Nothing is dropped: existing invoices keep their rows and read as
-- `kind = 'invoice'`. No table from the deleted modules is touched — the
-- ledger, facility, drawdown and payment-order tables are left standing and
-- simply stop being written to.

-- ── 1. The negotiated rates ────────────────────────────────────────────────
ALTER TABLE `shippers` ADD COLUMN `commissionPct` DOUBLE NULL;
ALTER TABLE `partners` ADD COLUMN `commissionPct` DOUBLE NULL;

-- ── 2 & 3. The document ────────────────────────────────────────────────────
ALTER TABLE `invoices`
  ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'invoice',
  ADD COLUMN `shipmentId` VARCHAR(191) NULL,
  ADD COLUMN `lines` JSON NULL,
  ADD COLUMN `commissionPct` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `commissionMinorUnits` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `paidAt` DATETIME(3) NULL,
  ADD COLUMN `proformaId` VARCHAR(191) NULL;

CREATE INDEX `invoices_shipmentId_idx` ON `invoices`(`shipmentId`);
CREATE INDEX `invoices_kind_idx` ON `invoices`(`kind`);

ALTER TABLE `invoices`
  ADD CONSTRAINT `invoices_shipmentId_fkey`
  FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every historical single-shipment invoice gains its shipment link.
-- Monthly statements (more than one id in `missionIds`) are deliberately left
-- unlinked — there is no single shipment they belong to, and inventing one
-- would misreport what was billed.
UPDATE `invoices` i
JOIN `shipments` s
  ON s.`id` = JSON_UNQUOTE(JSON_EXTRACT(i.`missionIds`, '$[0]'))
SET i.`shipmentId` = s.`id`
WHERE i.`shipmentId` IS NULL
  AND JSON_LENGTH(i.`missionIds`) = 1;

-- A paid invoice from the old model gets an honest `paidAt`: we know it was
-- settled, and `updatedAt` is the closest recorded moment. Draft and sent rows
-- are left NULL rather than dated.
UPDATE `invoices` SET `paidAt` = `updatedAt` WHERE `status` = 'Paid' AND `paidAt` IS NULL;
