-- AlterTable
-- `bookingId` and `containerNumber` on `shipments` are comma-joined rollups of
-- every booking underneath. At VarChar(255)/VarChar(64) a shipment with more
-- than a handful of containers overflowed them, and because the rollup is
-- written inside the booking-status write, the overflow failed the whole write.
ALTER TABLE `shipments` MODIFY COLUMN `bookingId` VARCHAR(1024) NOT NULL;
ALTER TABLE `shipments` MODIFY COLUMN `containerNumber` VARCHAR(1024) NULL;
