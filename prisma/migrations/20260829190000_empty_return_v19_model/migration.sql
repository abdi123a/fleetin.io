-- Empty Container Management → the v19 operating model.
--
-- Three shape changes, then a backfill so every existing cycle lands on the
-- new vocabulary instead of defaulting to "empty" and losing its history.
--
-- 1. A full load can now absorb SEVERAL empties. `nextBookingId` was unique,
--    which hard-coded 1:1; v19 gives a load `qty` slots and an `assigned[]`
--    list. The cap moves to `bookings.emptySlots`, enforced in the service.
-- 2. A cycle now STORES its stage/outcome instead of the UI re-deriving them.
-- 3. Pairing provenance, dispatch time and the settled detention fee become
--    real columns — v19 shows all three and none of them existed.

-- ── 1. Booking: v19's `qty` and `distKm` ────────────────────────────────────
ALTER TABLE `bookings`
  ADD COLUMN `emptySlots` INT NULL,
  ADD COLUMN `emptyReturnDistanceKm` DECIMAL(8,2) NULL;

-- ── 2. Cycle: new columns ───────────────────────────────────────────────────
ALTER TABLE `empty_return_cycles`
  ADD COLUMN `stage` VARCHAR(16) NOT NULL DEFAULT 'empty',
  ADD COLUMN `outcome` VARCHAR(16) NULL,
  ADD COLUMN `matchedAt` DATETIME(3) NULL,
  ADD COLUMN `matchedBy` VARCHAR(120) NULL,
  ADD COLUMN `matchSource` VARCHAR(64) NULL,
  ADD COLUMN `dispatchedAt` DATETIME(3) NULL,
  ADD COLUMN `detentionFee` DECIMAL(12,2) NULL;

-- ── 3. Drop the 1:1 constraint, keep the lookup ─────────────────────────────
-- MySQL refuses to drop an index a foreign key is resting on, so the FK comes
-- off first and goes straight back on afterwards against the plain index. The
-- referential guarantee is unchanged; only the uniqueness of the column goes.
ALTER TABLE `empty_return_cycles` DROP FOREIGN KEY `empty_return_cycles_nextBookingId_fkey`;
ALTER TABLE `empty_return_cycles` DROP INDEX `empty_return_cycles_nextBookingId_key`;
CREATE INDEX `empty_return_cycles_nextBookingId_idx` ON `empty_return_cycles`(`nextBookingId`);
CREATE INDEX `empty_return_cycles_stage_idx` ON `empty_return_cycles`(`stage`);
ALTER TABLE `empty_return_cycles`
  ADD CONSTRAINT `empty_return_cycles_nextBookingId_fkey`
  FOREIGN KEY (`nextBookingId`) REFERENCES `bookings`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4. Backfill — every existing cycle keeps its real history ───────────────
-- Closed: the box is physically back.
UPDATE `empty_return_cycles` SET `stage` = 'closed' WHERE `returnedAt` IS NOT NULL;

-- Paired: welded to an outbound load and not yet home.
UPDATE `empty_return_cycles`
  SET `stage` = 'paired'
  WHERE `returnedAt` IS NULL AND `nextBookingId` IS NOT NULL;

-- Return planned: a slot was chosen on the booking, nothing paired.
UPDATE `empty_return_cycles` c
  JOIN `bookings` b ON b.`id` = c.`bookingId`
  SET c.`stage` = 'return_planned'
  WHERE c.`returnedAt` IS NULL
    AND c.`nextBookingId` IS NULL
    AND b.`emptyReturnPlannedAt` IS NOT NULL;

-- Outcome, for the closed ones only. A pairing that beat the clock is the win
-- state; a standalone return is judged against its own deadline.
UPDATE `empty_return_cycles` SET `outcome` = 'paired'
  WHERE `stage` = 'closed' AND `nextBookingId` IS NOT NULL;

UPDATE `empty_return_cycles` c
  JOIN `bookings` b ON b.`id` = c.`bookingId`
  SET c.`outcome` = CASE
        WHEN b.`containerReturnDeadline` IS NOT NULL
         AND c.`returnedAt` > b.`containerReturnDeadline` THEN 'returned_late'
        ELSE 'returned'
      END
  WHERE c.`stage` = 'closed' AND c.`nextBookingId` IS NULL;

-- Provenance: the cycle row is created at the instant Operations confirms a
-- pairing, so its own createdAt IS the match stamp for every historic row.
UPDATE `empty_return_cycles`
  SET `matchedAt` = `createdAt`,
      `matchSource` = 'Migrated — pre-v19 pairing'
  WHERE `nextBookingId` IS NOT NULL;
