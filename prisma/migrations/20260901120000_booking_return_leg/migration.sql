-- The empty return is a container's SECOND leg, and often a second crew.
--
-- The transporter sends a truck and a driver to deliver the load; days later,
-- after the consignee has stripped the box, it sends a truck and a driver again
-- to fetch the empty. Frequently not the same pair. Until now the second pair
-- was not recorded anywhere, so the empty leg was silently credited to whoever
-- had driven the delivery — the wrong person's trip count, and the wrong
-- person's stars.
--
-- All nullable, no backfill: null means the empty went back with the delivery
-- crew, which is the honest reading of every row that already exists. Same
-- transporter for both legs, so there is no `returnPartnerId` — a carrier that
-- delivered a box is the carrier that owes its return.
ALTER TABLE `bookings`
  ADD COLUMN `returnDriverId` VARCHAR(191) NULL,
  ADD COLUMN `returnVehicleId` VARCHAR(191) NULL,
  ADD COLUMN `returnDriverRating` TINYINT NULL,
  ADD COLUMN `returnDriverRatingReliability` TINYINT NULL,
  ADD COLUMN `returnDriverRatingPunctuality` TINYINT NULL,
  ADD COLUMN `returnDriverRatingProfessionalism` TINYINT NULL,
  ADD COLUMN `returnDriverNote` TEXT NULL,
  ADD COLUMN `returnDriverRatedById` VARCHAR(191) NULL,
  ADD COLUMN `returnDriverRatedByName` VARCHAR(255) NULL,
  ADD COLUMN `returnDriverRatedAt` DATETIME(3) NULL;

-- Queried the same way the delivery leg is: "what has this driver done", "what
-- has this truck run".
CREATE INDEX `bookings_returnVehicleId_idx` ON `bookings`(`returnVehicleId`);
CREATE INDEX `bookings_returnDriverId_idx` ON `bookings`(`returnDriverId`);

-- `SET NULL`, matching `driverId`/`vehicleId`: deleting a driver must never
-- delete the trip they ran.
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_returnDriverId_fkey` FOREIGN KEY (`returnDriverId`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_returnVehicleId_fkey` FOREIGN KEY (`returnVehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
