-- Fleetin Impact: the repositioning a realized match did not drive.
--
-- Two questions, kept apart everywhere:
--
--   "How much CO₂ did the trucks actually put out?"     → bookings.co2EmissionsKg (untouched here)
--   "How much empty driving did Fleetin eliminate?"     → what this migration adds
--
-- ## The model
--
-- Without Fleetin, a truck that has just finished at a free zone goes home and
-- comes back out for its next job:
--
--     Free Zone → Garage → Port
--
-- A realized match lets it continue instead:
--
--     Free Zone → Port
--
-- so what Fleetin eliminates is the garage round trip — `Free Zone → Garage`
-- plus `Garage → Port` — and nothing else. Not the shipment's lane, not a
-- percentage, not a theoretical match. Only a continuation that physically
-- happened counts, and it counts exactly once.
--
-- ## What this does
--
--   1. A transporter gains a garage: the catalogue location its trucks are
--      based at, which is the only way the two avoided legs can be measured
--      rather than guessed. Nullable; never derived from the address.
--   2. A cycle — already the link between the operation that ended at the
--      free zone and the one that continued from it — gains the evidence
--      record of what that continuation avoided: the lifecycle word, the
--      moment, the transporter and (when established) the truck, the three
--      places, both half-distances with who measured them, the factor and
--      the carbon, and the one stamp that lets it into a total.
--   3. Every cycle that already has a next load is marked `matched`. Nothing
--      is marked realized here: that verdict needs the bookings' rungs and
--      the road cache, and belongs to `CarbonImpactService`, which
--      `POST /emissions/impact/rebuild` runs over the whole book.
--
-- Idempotent: additive columns, guarded backfill.

-- ── 1. The transporter's garage ─────────────────────────────────────────────
ALTER TABLE `partners`
    ADD COLUMN `garageLocationId` VARCHAR(191) NULL;

CREATE INDEX `partners_garageLocationId_idx` ON `partners`(`garageLocationId`);

-- `SET NULL`: retiring a yard from the catalogue must not delete a carrier.
ALTER TABLE `partners`
    ADD CONSTRAINT `partners_garageLocationId_fkey`
    FOREIGN KEY (`garageLocationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. The evidence record, on the match it belongs to ──────────────────────
ALTER TABLE `empty_return_cycles`
    ADD COLUMN `impactStatus`              VARCHAR(16)    NULL,
    ADD COLUMN `impactEvaluatedAt`         DATETIME(3)    NULL,
    ADD COLUMN `impactSource`              VARCHAR(16)    NULL,
    ADD COLUMN `impactDecidedBy`           VARCHAR(120)   NULL,
    ADD COLUMN `impactNote`                VARCHAR(255)   NULL,
    ADD COLUMN `impactRealizedAt`          DATETIME(3)    NULL,
    ADD COLUMN `impactContinuationMinutes` INTEGER        NULL,
    ADD COLUMN `impactPartnerId`           VARCHAR(191)   NULL,
    ADD COLUMN `impactPartnerName`         VARCHAR(255)   NULL,
    ADD COLUMN `impactVehicleId`           VARCHAR(191)   NULL,
    ADD COLUMN `impactVehiclePlate`        VARCHAR(32)    NULL,
    ADD COLUMN `impactFromLocationId`      VARCHAR(191)   NULL,
    ADD COLUMN `impactFromName`            VARCHAR(255)   NULL,
    ADD COLUMN `impactGarageLocationId`    VARCHAR(191)   NULL,
    ADD COLUMN `impactGarageName`          VARCHAR(255)   NULL,
    ADD COLUMN `impactToLocationId`        VARCHAR(191)   NULL,
    ADD COLUMN `impactToName`              VARCHAR(255)   NULL,
    ADD COLUMN `avoidedToGarageMeters`     INTEGER        NULL,
    ADD COLUMN `avoidedFromGarageMeters`   INTEGER        NULL,
    ADD COLUMN `avoidedDistanceKm`         DECIMAL(9, 2)  NULL,
    ADD COLUMN `avoidedDistanceProvider`   VARCHAR(16)    NULL,
    ADD COLUMN `avoidedCo2FactorUsed`      DECIMAL(6, 3)  NULL,
    ADD COLUMN `avoidedCo2Kg`              DECIMAL(10, 2) NULL,
    ADD COLUMN `impactCountedAt`           DATETIME(3)    NULL;

CREATE INDEX `empty_return_cycles_impactStatus_idx`     ON `empty_return_cycles`(`impactStatus`);
CREATE INDEX `empty_return_cycles_impactCountedAt_idx`  ON `empty_return_cycles`(`impactCountedAt`);
CREATE INDEX `empty_return_cycles_impactRealizedAt_idx` ON `empty_return_cycles`(`impactRealizedAt`);
CREATE INDEX `empty_return_cycles_impactPartnerId_idx`  ON `empty_return_cycles`(`impactPartnerId`);

-- The location and vehicle columns carry NO foreign key, deliberately — the
-- same rule as `booking_route_legs`. A saving is a record of something that
-- happened; retiring a depot or a truck must not cascade it away, and the
-- names beside the ids are what the record prints.

-- ── 3. Every existing pairing is a match, and only a match ──────────────────
--
-- A cycle with a next load is an opportunity Operations took. Whether the
-- truck then really continued is a separate question with a separate answer,
-- read off the bookings' rungs by the service — so this says `matched` and
-- nothing more. A cycle with no next load (a standalone return) has no
-- continuation to judge and stays NULL.
UPDATE `empty_return_cycles`
SET `impactStatus` = 'matched'
WHERE `nextBookingId` IS NOT NULL
  AND `impactStatus` IS NULL;
