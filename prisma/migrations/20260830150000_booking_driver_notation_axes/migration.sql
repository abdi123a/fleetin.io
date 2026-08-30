-- The debrief asks the same three questions the computed rating measures
-- (see the frontend's `lib/rating.ts`), so the human read is comparable with
-- the derived one axis for axis. `driverRating` stays as their mean.
ALTER TABLE `bookings`
  ADD COLUMN `driverRatingReliability` TINYINT NULL,
  ADD COLUMN `driverRatingPunctuality` TINYINT NULL,
  ADD COLUMN `driverRatingProfessionalism` TINYINT NULL;
