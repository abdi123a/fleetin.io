-- How the delivery actually went, captured when a booking is marked Delivered.
-- Kept beside the computed rating (see the frontend's `lib/rating.ts`) rather
-- than blended into it, so neither number stops being explainable.
ALTER TABLE `bookings`
  ADD COLUMN `driverRating` TINYINT NULL,
  ADD COLUMN `driverNote` TEXT NULL;
