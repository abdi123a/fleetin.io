-- Grant `locations.*` to the roles that already exist.
--
-- WHY THIS FILE EXISTS: `roles.permissions` is a JSON column, not a table. A
-- permission string added to the catalogue in TypeScript reaches nobody — the
-- guard reads the row, the row has not changed, and the feature ships as a 403
-- for every account except ADMIN (who holds the `*` wildcard). Re-running
-- `seed.ts` is not the fix either: it must never touch a populated database.
--
-- WHY IT EXCLUDES RATHER THAN INCLUDES: naming the roles that GET the grant
-- means every role created afterwards in Administration silently does not, and
-- the symptom is a person who cannot see a page their colleague can. Naming the
-- roles that don't is the safer default. Same reasoning as
-- `20260831090100_workspace_permissions`, which learned it the hard way.
--
-- Excluded, deliberately:
--   ADMIN                 — already holds `*`
--   SHIPPER, TRANSPORTER,
--   CLIENT                — portal logins; they consume the corridor, they do
--                           not curate it
--   DRIVER, EMPLOYEE      — field and self-service staff. Both get the read
--                           below instead: a driver reads a drop-off address,
--                           a driver does not add one.
--
-- Idempotent by construction: JSON_CONTAINS is checked before every append, so
-- a second run changes zero rows.

-- Every internal desk: the full grant.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'locations.*')
WHERE `name` NOT IN ('SHIPPER', 'TRANSPORTER', 'CLIENT', 'DRIVER', 'EMPLOYEE', 'ADMIN')
  AND NOT JSON_CONTAINS(`permissions`, '"locations.*"');

-- Everyone else who logs in at all: read the catalogue, change nothing in it.
-- A drop-off address on a job sheet is not privileged information.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'locations.view')
WHERE `name` IN ('SHIPPER', 'TRANSPORTER', 'CLIENT', 'DRIVER', 'EMPLOYEE')
  AND NOT JSON_CONTAINS(`permissions`, '"locations.view"')
  AND NOT JSON_CONTAINS(`permissions`, '"locations.*"');
