-- Who recorded the delivery debrief, and when. The name is denormalised on
-- purpose: it is what the sheet prints, and a debrief should keep saying who
-- wrote it after that user is renamed or deactivated.
ALTER TABLE `bookings`
  ADD COLUMN `driverRatedById` VARCHAR(191) NULL,
  ADD COLUMN `driverRatedByName` VARCHAR(255) NULL,
  ADD COLUMN `driverRatedAt` DATETIME(3) NULL;
