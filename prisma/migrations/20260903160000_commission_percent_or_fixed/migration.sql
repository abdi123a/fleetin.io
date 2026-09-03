-- A negotiated rate is a percentage OR a fixed fee per container.
--
-- The first cut of this only allowed a percentage. Both shapes are really in
-- use: some clients agree a share of the job, others a flat fee per box, and
-- the same is true of hauliers. So the deal gains a MODE, and the amount it
-- needs:
--
--   mode = 'percent'  →  commissionPct            (7.5 means 7.5%)
--   mode = 'fixed'    →  commissionFixedMinorUnits (per BOOKING, i.e. per container)
--
-- `commissionMode` NULL on a shipper or partner still means what a NULL
-- `commissionPct` meant before: no special deal, use the house rate.
--
-- On an invoice all four figures are snapshots, and `commissionSource` is
-- added beside them so a document records WHICH deal won — the client's, the
-- haulier's, or the house rate — rather than leaving a reader to re-derive it
-- from records that may since have changed.
--
-- Backfill: any shipper or partner that already carries a percentage is
-- marked `percent`, so no existing deal changes meaning. Existing invoices are
-- already percent-mode by column default and keep the figures they were
-- issued with.

-- ── The deal, on both counterparties ───────────────────────────────────────
ALTER TABLE `shippers`
  ADD COLUMN `commissionMode` VARCHAR(8) NULL,
  ADD COLUMN `commissionFixedMinorUnits` BIGINT NULL;

ALTER TABLE `partners`
  ADD COLUMN `commissionMode` VARCHAR(8) NULL,
  ADD COLUMN `commissionFixedMinorUnits` BIGINT NULL;

UPDATE `shippers` SET `commissionMode` = 'percent' WHERE `commissionPct` IS NOT NULL;
UPDATE `partners` SET `commissionMode` = 'percent' WHERE `commissionPct` IS NOT NULL;

-- ── The snapshot, on the document ──────────────────────────────────────────
ALTER TABLE `invoices`
  ADD COLUMN `commissionMode` VARCHAR(8) NOT NULL DEFAULT 'percent',
  ADD COLUMN `commissionSource` VARCHAR(12) NOT NULL DEFAULT 'house',
  ADD COLUMN `commissionFixedMinorUnits` BIGINT NOT NULL DEFAULT 0;
