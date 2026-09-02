-- Adds the shipper's expected delivery date to a shipment.
-- Nullable with no backfill: every existing row genuinely has no agreed
-- delivery date, and inventing one from the pickup would be a guess that
-- reads as a commitment.
ALTER TABLE `shipments` ADD COLUMN `scheduledDeliveryTime` DATETIME(3) NULL;
