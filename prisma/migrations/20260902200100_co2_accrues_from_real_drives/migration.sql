-- Carbon accrues from drives that happened. It is never forecast.
--
-- ## What was wrong
--
-- The previous migration's first draft priced every booking as
-- `shipment.estimatedDistanceKm × vehicle.co2PerKm`. That put a carbon figure
-- against containers that had not moved — a booking sitting at "Assigned" was
-- reported as having emitted 27 kg, and a shipment created this morning was
-- reported as having emitted at all. It also counted the outbound hop only,
-- so a container that had already gone out AND come back was under-counted by
-- roughly half.
--
-- The rule, stated once: **a leg counts once it has been driven.**
--
--   | Rung reached      | What became true              | Leg counted    |
--   |-------------------|-------------------------------|----------------|
--   | `Arrived`         | the box reached the consignee | `loaded`       |
--   | `Empty Picked Up` | a truck has the empty         | `empty_return` |
--
-- Below `Arrived` a booking has no figure at all — NULL, not 0. Zero reads as
-- "measured, and found to be nothing", which is a different and false claim.
--
-- ## What this does
--
--   1. Gives a shipment the rollup columns its list row prints.
--   2. Clears the estimate-based figures from every booking.
--   3. Writes a real `loaded` route leg for the bookings that were actually
--      delivered, using the shipment's own Google-measured pickup→delivery
--      distance — that drive did happen, and that is its measured length.
--   4. Re-prices those bookings from their legs, and rolls the totals up.
--
-- The empty-return leg is deliberately NOT backfilled: its length depends on
-- which depot each box went back to, which is a Routes API measurement per
-- pair rather than a column already in the database. Those legs arrive as
-- `EmissionsService.rebuildRoute` runs — on the rung, or from the "Re-measure"
-- button on the booking. The distance source stays honest in the meantime.
--
-- Idempotent: step 3 inserts only where no leg exists, and the recompute in
-- step 4 is a pure function of the legs.

-- ── 1. The shipment's rollup ────────────────────────────────────────────────
ALTER TABLE `shipments`
    ADD COLUMN `co2EmissionsKg` DECIMAL(12, 2) NULL,
    ADD COLUMN `co2DistanceKm`  DECIMAL(11, 2) NULL;

-- ── 2. Unsay what was never true ────────────────────────────────────────────
UPDATE `bookings`
SET `actualDistanceKm`  = NULL,
    `co2EmissionsKg`    = NULL,
    `co2DistanceSource` = NULL,
    `co2ComputedAt`     = NULL
WHERE `co2DistanceSource` = 'shipment_estimate';

-- ── 3. One real leg per drive that was actually made ────────────────────────
--
-- `estimatedDistanceKm` is the road between this shipment's pickup and
-- delivery, measured by the Routes API and cached per directed pair (see
-- `location_distances`). For a container that was delivered, that drive
-- happened and this is its measured length — so it becomes a leg, marked
-- `google` because that is who measured it, exactly as a live rebuild would.
--
-- Only shipments linked to catalogue locations qualify. An unlinked one has no
-- pair to name the leg's ends with, and a leg with no ends is not a record of
-- anything.
INSERT INTO `booking_route_legs`
  (`id`, `bookingId`, `sequence`, `originLocationId`, `destinationLocationId`,
   `originName`, `destinationName`, `distanceMeters`, `durationSeconds`,
   `provider`, `purpose`, `createdAt`)
SELECT
  UUID(),
  b.`id`,
  1,
  s.`pickupLocationId`,
  s.`deliveryLocationId`,
  s.`pickupLocationName`,
  s.`deliveryLocationName`,
  ROUND(s.`estimatedDistanceKm` * 1000),
  NULL,
  'google',
  'loaded',
  NOW(3)
FROM `bookings` b
JOIN `shipments` s ON s.`id` = b.`shipmentId`
WHERE b.`deletedAt` IS NULL
  AND b.`status` IN ('Arrived', 'Unloading', 'POD Submitted', 'Empty Ready', 'Empty Picked Up', 'Completed')
  AND s.`pickupLocationId`   IS NOT NULL
  AND s.`deliveryLocationId` IS NOT NULL
  AND s.`estimatedDistanceKm` > 0
  AND NOT EXISTS (SELECT 1 FROM `booking_route_legs` l WHERE l.`bookingId` = b.`id`);

-- ── 4. Price them from those legs, and roll up ──────────────────────────────
UPDATE `bookings` b
JOIN (
  SELECT `bookingId`, SUM(`distanceMeters`) AS metres
  FROM `booking_route_legs`
  GROUP BY `bookingId`
) l ON l.`bookingId` = b.`id`
SET
  b.`actualDistanceKm`  = ROUND(l.metres / 1000, 2),
  b.`co2EmissionsKg`    = CASE WHEN b.`co2FactorUsed` IS NULL THEN NULL
                               ELSE ROUND((l.metres / 1000) * b.`co2FactorUsed`, 2) END,
  b.`co2DistanceSource` = 'legs',
  b.`co2ComputedAt`     = NOW(3)
WHERE b.`deletedAt` IS NULL;

-- Every shipment's total, from the bookings that now carry one. A shipment
-- with nothing driven under it stays NULL, which is what keeps its list row
-- silent rather than claiming a zero.
UPDATE `shipments` s
LEFT JOIN (
  SELECT `shipmentId`,
         SUM(`co2EmissionsKg`)   AS co2,
         SUM(`actualDistanceKm`) AS km
  FROM `bookings`
  WHERE `deletedAt` IS NULL AND `status` NOT IN ('Cancelled', 'Failed')
  GROUP BY `shipmentId`
) b ON b.`shipmentId` = s.`id`
SET s.`co2EmissionsKg` = b.co2,
    s.`co2DistanceKm`  = b.km;
