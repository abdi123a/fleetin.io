-- Drop the standing vehicle→driver pairing.
--
-- `vehicles.assignedDriverId` was a second answer to a question `bookings`
-- already answers per trip (it names both the driver and the vehicle that ran
-- it). Nothing reconciled the two, so a vehicle could show one driver on the
-- fleet page while every booking on the road named someone else. Dispatch
-- happens on the shipment; the fleet directories now report trips instead.
--
-- Destructive: the stored pairings are not recoverable from this migration.
-- They were never used to dispatch anything — no query outside the Vehicles
-- and Drivers pages read the column — so nothing downstream loses a fact.
ALTER TABLE `vehicles` DROP FOREIGN KEY `vehicles_assignedDriverId_fkey`;
DROP INDEX `vehicles_assignedDriverId_key` ON `vehicles`;
ALTER TABLE `vehicles` DROP COLUMN `assignedDriverId`;
