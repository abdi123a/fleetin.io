-- Carbon: the columns, and every truck's factor.
--
--   1. A vehicle gains a fuel type and a *computed* CO₂ factor. Nobody types
--      the factor in — it falls out of type × fuel × age, and the model that
--      derives it lives in `src/common/helpers/co2.util.ts`.
--   2. A booking gains a distance, a snapshot of the factor it ran under, and
--      the emissions those two make. The snapshot is the point: a finished
--      trip must keep reporting the number it was reported with, even after
--      somebody corrects the truck's model year.
--   3. A booking gains a route: the list of drives its distance is the sum of.
--
-- The fleet's factors are backfilled here. The bookings' carbon is not — it
-- accrues from drives that actually happened, which the next migration sets up
-- properly.
--
-- Idempotent: the backfill is guarded on the column still being NULL, so a
-- second run changes nothing.

-- ── Vehicle: what it burns, and what that costs ─────────────────────────────
ALTER TABLE `vehicles`
    ADD COLUMN `photoKey`        VARCHAR(255) NULL,
    ADD COLUMN `fuelType`        VARCHAR(24)  NOT NULL DEFAULT 'Diesel',
    ADD COLUMN `co2PerKm`        DECIMAL(6, 3) NULL,
    ADD COLUMN `co2FactorBasis`  VARCHAR(255) NULL,
    ADD COLUMN `co2ModelVersion` VARCHAR(32)  NULL,
    ADD COLUMN `co2FactorAt`     DATETIME(3)  NULL;

-- ── Booking: the distance driven, the factor used, the carbon produced ──────
ALTER TABLE `bookings`
    ADD COLUMN `actualDistanceKm`  DECIMAL(9, 2)  NULL,
    ADD COLUMN `co2FactorUsed`     DECIMAL(6, 3)  NULL,
    ADD COLUMN `co2EmissionsKg`    DECIMAL(10, 2) NULL,
    ADD COLUMN `co2DistanceSource` VARCHAR(24)    NULL,
    ADD COLUMN `co2ComputedAt`     DATETIME(3)    NULL;

CREATE INDEX `bookings_co2ComputedAt_idx` ON `bookings`(`co2ComputedAt`);

-- ── The route a booking's distance is measured over ─────────────────────────
CREATE TABLE `booking_route_legs` (
    `id`                    VARCHAR(191) NOT NULL,
    `bookingId`             VARCHAR(191) NOT NULL,
    `sequence`              INTEGER      NOT NULL,
    `originLocationId`      VARCHAR(191) NULL,
    `destinationLocationId` VARCHAR(191) NULL,
    `originName`            VARCHAR(255) NOT NULL,
    `destinationName`       VARCHAR(255) NOT NULL,
    `distanceMeters`        INTEGER      NOT NULL,
    `durationSeconds`       INTEGER      NULL,
    `provider`              VARCHAR(16)  NOT NULL DEFAULT 'google',
    `purpose`               VARCHAR(24)  NOT NULL DEFAULT 'loaded',
    `createdAt`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_route_legs_bookingId_idx`(`bookingId`),
    UNIQUE INDEX `booking_route_legs_bookingId_sequence_key`(`bookingId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking_route_legs`
    ADD CONSTRAINT `booking_route_legs_bookingId_fkey`
    FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The location columns carry NO foreign key, deliberately. A leg is a record
-- of a drive that happened; retiring a depot from the catalogue must not
-- cascade away last year's kilometres. The names beside them are what a route
-- prints, which is why they are NOT NULL and the ids are not.

-- ── Backfill 1: every truck's factor ────────────────────────────────────────
--
-- This is `computeVehicleCo2Factor` written out in SQL: base × fuel × age.
-- Two copies of a model is normally a smell, and this is the exception that
-- earns it — the alternative is shipping a fleet of NULLs and asking somebody
-- to remember to run a script. The TypeScript copy stays authoritative: every
-- write after this migration goes through it, and a future change to the
-- table changes new writes only, exactly as the versioning intends.
--
-- Fuel is not backfilled — the column defaults to Diesel, which is what all
-- but a handful of trucks in this corridor burn, and the registration form
-- now asks outright.
UPDATE `vehicles`
SET
  `co2PerKm` = ROUND(
    (CASE `truckType`
       WHEN 'Low Loader'      THEN 1.10
       WHEN 'Refrigerated'    THEN 1.05
       WHEN '40ft Container'  THEN 1.00
       WHEN 'Tanker'          THEN 1.00
       WHEN 'Tipper'          THEN 0.95
       WHEN 'Flatbed'         THEN 0.90
       WHEN '20ft Container'  THEN 0.85
       WHEN 'Box Truck'       THEN 0.55
       ELSE 0.90
     END)
    * (CASE `fuelType`
         WHEN 'Petrol'   THEN 1.10
         WHEN 'CNG'      THEN 0.90
         WHEN 'LNG'      THEN 0.85
         WHEN 'Hybrid'   THEN 0.80
         WHEN 'Electric' THEN 0.00
         ELSE 1.00
       END)
    * (CASE
         WHEN `year` IS NULL  THEN 1.10
         WHEN `year` >= 2021  THEN 1.00
         WHEN `year` >= 2014  THEN 1.04
         WHEN `year` >= 2009  THEN 1.10
         WHEN `year` >= 2001  THEN 1.18
         ELSE 1.28
       END),
    3),
  `co2FactorBasis` = CONCAT(
    `truckType`, ' · ', `fuelType`, ' · ',
    CASE
      WHEN `year` IS NULL  THEN 'year not recorded'
      WHEN `year` >= 2021  THEN CONCAT(`year`, ' (Euro VI-E)')
      WHEN `year` >= 2014  THEN CONCAT(`year`, ' (Euro VI)')
      WHEN `year` >= 2009  THEN CONCAT(`year`, ' (Euro V)')
      WHEN `year` >= 2001  THEN CONCAT(`year`, ' (Euro IV/III)')
      ELSE CONCAT(`year`, ' (pre-Euro IV)')
    END),
  `co2ModelVersion` = 'ttw-2026.09',
  `co2FactorAt`     = NOW(3)
WHERE `co2PerKm` IS NULL;

-- Bookings are NOT backfilled here.
--
-- The first draft of this migration priced every booking from its shipment's
-- quoted lane, which put a carbon figure against containers that had not moved
-- yet. Carbon accrues from drives that happened — see the accrual table in
-- `emissions.service.ts` — so the booking backfill lives in the next migration,
-- where it can build real route legs for the trips that were actually made and
-- leave the rest empty.
