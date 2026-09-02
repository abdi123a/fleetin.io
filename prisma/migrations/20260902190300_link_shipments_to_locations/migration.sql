-- Point every existing shipment at the catalogue row it always meant.
--
-- WHY AN ALIAS TABLE AND NOT A `LIKE`: the live book does not spell these
-- places the way the catalogue does. 17 shipments say "SGTD Terminal", 13 say
-- "Port de Djibouti (PDSA)", 11 say "Horizon Terminal", 15 say
-- "DIFTZ — PK12 Freezone". A substring match catches some of those and quietly
-- misses the rest, and a half-linked book is worse than an unlinked one: the
-- tracking map draws half its routes and nobody can tell which half is missing.
-- So the mapping is written out, one row per spelling actually in the data.
--
-- WHAT THIS DOES NOT DO: it does not touch `estimatedDistanceKm`. Linking is a
-- statement about which place a shipment went to, and it is safe. Re-measuring
-- is a statement about how far that was, it needs the Routes API, and SQL
-- cannot make it — `scripts/backfill-shipment-distances.ts` does that, only
-- overwrites when Google actually answers with a road, and is dry-run by
-- default.
--
-- Idempotent: only NULL links are filled, so a second run changes nothing. A
-- spelling not listed here stays NULL, which is the correct outcome — the text
-- snapshot still reads, and `bi-geo.ts`'s gazetteer still resolves it.

-- The spellings the book actually uses, mapped to catalogue names. Rows whose
-- catalogue name is absent simply match nothing and are skipped.
CREATE TEMPORARY TABLE `_location_aliases` (
  `alias`     VARCHAR(255) NOT NULL,
  `canonical` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`alias`)
) ENGINE=MEMORY DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_location_aliases` (`alias`, `canonical`) VALUES
  -- Pickups
  ('SGTD Terminal',                    'Doraleh Container Terminal (SGTD)'),
  ('Doraleh Container Terminal',       'Doraleh Container Terminal (SGTD)'),
  ('Doraleh Container Terminal (DCT)', 'Doraleh Container Terminal (SGTD)'),
  ('Port de Djibouti (PDSA)',          'Port of Djibouti'),
  ('Port of Djibouti',                 'Port of Djibouti'),
  ('Horizon Terminal',                 'Doraleh Oil Terminal / SJTP'),
  ('Horizon Djibouti Terminals',       'Doraleh Oil Terminal / SJTP'),
  ('Doraleh Multipurpose Port (DMP)',  'Doraleh Multipurpose Port (DMP)'),
  ('Djibouti Multipurpose Port',       'Doraleh Multipurpose Port (DMP)'),
  ('Port of Tadjourah',                'Port of Tadjourah'),
  -- Drop-offs
  ('UKAB Free Zone',                   'UKAB Free Zone'),
  ('DIFTZ — PK12 Freezone',            'Djibouti International Free Trade Zone (DIFTZ)'),
  ('DIFTZ - PK12 Freezone',            'Djibouti International Free Trade Zone (DIFTZ)'),
  ('Djibouti International Free Trade Zone (DIFTZ)',
                                       'Djibouti International Free Trade Zone (DIFTZ)'),
  ('Djibouti Free Zone (DFZ)',         'Djibouti Free Zone (DFZ)'),
  ('Damerjog Industrial Park',         'Damerjog Industrial Park'),
  ('Jaban''as Free Zone',              'Jaban''as Free Zone'),
  ('Nagad Free Zone',                  'Nagad Free Zone');

-- Pickup side.
UPDATE `shipments` s
JOIN `_location_aliases` a ON a.`alias` = s.`pickupLocationName`
JOIN `locations` l ON l.`name` = a.`canonical` AND l.`deletedAt` IS NULL
SET s.`pickupLocationId` = l.`id`
WHERE s.`pickupLocationId` IS NULL;

-- Drop-off side.
UPDATE `shipments` s
JOIN `_location_aliases` a ON a.`alias` = s.`deliveryLocationName`
JOIN `locations` l ON l.`name` = a.`canonical` AND l.`deletedAt` IS NULL
SET s.`deliveryLocationId` = l.`id`
WHERE s.`deliveryLocationId` IS NULL;

-- An exact name match catches anything the alias table missed but the
-- catalogue happens to spell identically — a place added by hand since, for
-- instance. Cheap, and it keeps the alias table to the spellings that genuinely
-- differ rather than growing a row for every location that already agrees.
UPDATE `shipments` s
JOIN `locations` l ON l.`name` = s.`pickupLocationName` AND l.`deletedAt` IS NULL
SET s.`pickupLocationId` = l.`id`
WHERE s.`pickupLocationId` IS NULL;

UPDATE `shipments` s
JOIN `locations` l ON l.`name` = s.`deliveryLocationName` AND l.`deletedAt` IS NULL
SET s.`deliveryLocationId` = l.`id`
WHERE s.`deliveryLocationId` IS NULL;

DROP TEMPORARY TABLE `_location_aliases`;
