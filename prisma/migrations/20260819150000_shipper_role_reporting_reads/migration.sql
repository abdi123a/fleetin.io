-- Data migration, no schema change.
--
-- The SHIPPER role predates the commit that gave it `bookings.view` and
-- `empty-returns.view`. `prisma/seed.ts` has granted both since — with the
-- note "the shipment report reads per-booking timelines and empty-return
-- cycles" — but seeds never run against a deployed database, so the live role
-- kept the five permissions it was first created with.
--
-- The effect was a shipper portal that renders its BI dashboard from
-- `/bi/shipper/:id/dataset` (permitted) while every call the shipment report
-- and the Empty Returns page make came back 403: `GET /bookings/:id`, one per
-- mission, and `GET /empty-returns/*`. Those panels showed nothing at all,
-- because `useShipperReporting` counts a failed fetch as loaded and then drops
-- every mission it has no booking for.
--
-- Additive and idempotent: each statement is a no-op where the permission is
-- already present, so it is safe on an environment already seeded from the
-- current `seed.ts`, and it leaves every other permission on the role alone.
--
-- Read together with `bookingOwnerScope`/`cycleOwnerScope`
-- (`src/common/helpers/row-scope.util.ts`), which land in the same release:
-- until those, neither endpoint filtered by company, so this grant on its own
-- would have opened every shipper's bookings to every other shipper.

UPDATE `roles`
SET `permissions` = JSON_MERGE_PRESERVE(`permissions`, JSON_ARRAY('bookings.view'))
WHERE `name` = 'SHIPPER'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('bookings.view'));

UPDATE `roles`
SET `permissions` = JSON_MERGE_PRESERVE(`permissions`, JSON_ARRAY('empty-returns.view'))
WHERE `name` = 'SHIPPER'
  AND NOT JSON_CONTAINS(`permissions`, JSON_QUOTE('empty-returns.view'));
