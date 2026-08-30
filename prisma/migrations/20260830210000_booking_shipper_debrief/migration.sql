-- The shipper's half of the round trip.
--
-- The debrief dialog has asked "How was the shipper?" since it shipped, and
-- every answer was discarded: the frontend sent `shipperRating*`, the DTO
-- dropped it, and there was no column behind it. These are those columns.
--
-- Same three axes and same 1-5 as the driver debrief, because it is the same
-- question asked of the other counterparty — and because as of 2026-08-30 a
-- person's answer is the ONLY thing that may become a star anywhere in this
-- app. The system still measures the mission window, the turnaround and the
-- container's return, and still reports them; it no longer converts any of
-- them into a rating.
ALTER TABLE `bookings`
  ADD COLUMN `shipperRating` TINYINT NULL,
  ADD COLUMN `shipperRatingReliability` TINYINT NULL,
  ADD COLUMN `shipperRatingPunctuality` TINYINT NULL,
  ADD COLUMN `shipperRatingProfessionalism` TINYINT NULL,
  ADD COLUMN `shipperNote` TEXT NULL,
  ADD COLUMN `shipperRatedById` VARCHAR(191) NULL,
  ADD COLUMN `shipperRatedByName` VARCHAR(255) NULL,
  ADD COLUMN `shipperRatedAt` DATETIME(3) NULL;
