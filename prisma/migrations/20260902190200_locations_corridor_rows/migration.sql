-- Put the corridor's places into the catalogue, on every database.
--
-- WHY THIS FILE EXISTS: `deploy.sh` runs `prisma migrate deploy` and never
-- `db seed` — and `seed-locations.ts` refuses any non-local DATABASE_URL by
-- design. So the previous migration shipped a `locations` TABLE and no ROWS:
-- an empty Locations page and two empty pickers in the shipment wizard, which
-- reads as a broken feature rather than an unseeded one. Same lesson as
-- `20260831090100_workspace_permissions`: a feature that needs data reaches
-- production only if a migration carries that data.
--
-- These are real published coordinates for real places — reference geography,
-- not invented business data. They are marked `manual` rather than `google`,
-- honestly: nobody has checked them against Places yet. Running
-- `pnpm prisma:seed:locations` with a key set is what upgrades them, and the
-- Locations page shows which is which ("Verified on Google" / "Position set by
-- hand").
--
-- Idempotent by construction: every row is guarded by NOT EXISTS on its name,
-- so a second run inserts nothing, and a database that already ran the seed
-- gets only the rows the seed did not have.

-- References are minted from the current high-water mark, read BEFORE the
-- insert so no user variable is assigned inside a SELECT (whose evaluation
-- order MySQL does not guarantee). ROW_NUMBER() then numbers only the rows
-- that survive the NOT EXISTS guard, so a partially-populated catalogue gets a
-- contiguous run rather than a gap.
SET @loc_base := (
  SELECT COALESCE(MAX(CAST(REGEXP_SUBSTR(`reference`, '[0-9]+$') AS UNSIGNED)), 0)
  FROM `locations`
);

INSERT INTO `locations`
  (`id`, `reference`, `name`, `kind`, `city`, `country`, `countryCode`,
   `latitude`, `longitude`, `source`, `active`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  -- CAST is load-bearing: `@loc_base` comes back from its SELECT typed as
  -- DECIMAL, so the sum is `1.0000` and LPAD pads THAT — minting `LOC-1.000`
  -- instead of `LOC-00001` and putting a malformed reference on every row of a
  -- fresh database. Caught on a scratch DB; do not remove it.
  CONCAT('LOC-', LPAD(CAST(@loc_base + ROW_NUMBER() OVER (ORDER BY src.sort) AS UNSIGNED), 5, '0')),
  src.name,
  src.kind,
  'Djibouti',
  'Djibouti',
  'DJ',
  src.lat,
  src.lng,
  'manual',
  1,
  NOW(3),
  NOW(3)
FROM (
  -- Ports: where a box comes off a ship.
              SELECT  1 AS sort, 'Port of Djibouti'                             AS name, 'port'      AS kind, 11.5951 AS lat, 43.1437 AS lng
  UNION ALL   SELECT  2,         'Doraleh Container Terminal (SGTD)',                 'port',            11.6094,        43.0567
  UNION ALL   SELECT  3,         'Doraleh Multipurpose Port (DMP)',                   'port',            11.6021,        43.0473
  UNION ALL   SELECT  4,         'Doraleh Oil Terminal / SJTP',                       'port',            11.5931,        43.0722
  UNION ALL   SELECT  5,         'Port of Tadjourah',                                 'port',            11.7869,        42.8822
  UNION ALL   SELECT  6,         'Damerjog / DDID port infrastructure',               'port',            11.4322,        43.2408
  UNION ALL   SELECT  7,         'Damerjog Liquid Bulk Port (DLBP)',                  'port',            11.4322,        43.2408
  UNION ALL   SELECT  8,         'Port of Ghoubet',                                   'port',            11.5203,        42.4494
  -- Free zones: where it is delivered.
  UNION ALL   SELECT  9,         'Djibouti International Free Trade Zone (DIFTZ)',    'free_zone',       11.5364,        43.0244
  UNION ALL   SELECT 10,         'Djibouti Free Zone (DFZ)',                          'free_zone',       11.5731,        43.1069
  UNION ALL   SELECT 11,         'UKAB Free Zone',                                    'free_zone',       11.5563,        43.0958
  UNION ALL   SELECT 12,         'Jaban''as Free Zone',                               'free_zone',       11.5178,        42.9891
  UNION ALL   SELECT 13,         'Nagad Free Zone',                                   'free_zone',       11.5472,        43.1225
  -- Eleven shipments on the live book deliver here and it was in no list the
  -- system had — not the frozen drop-off constants, not the gazetteer. The
  -- coordinate is Damerjog's own; the park sits beside the port, and refining
  -- it is a job for whoever first opens it with a Google key set.
  UNION ALL   SELECT 14,         'Damerjog Industrial Park',                          'free_zone',       11.4322,        43.2408
  -- Depots: where the empty goes back.
  UNION ALL   SELECT 15,         'Doraleh Empty Depot',                               'depot',           11.5983,        43.0611
  UNION ALL   SELECT 16,         'PK12 Dry Port',                                     'depot',           11.5364,        43.0244
) AS src
WHERE NOT EXISTS (
  SELECT 1 FROM `locations` existing
  WHERE existing.`name` = src.name AND existing.`deletedAt` IS NULL
);
