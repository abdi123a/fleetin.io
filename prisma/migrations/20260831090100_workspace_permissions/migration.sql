-- Grant `workspace.*` to the roles that already exist.
--
-- WHY THIS FILE EXISTS: `roles.permissions` is a JSON column, not a table. A
-- permission string added to the catalogue in TypeScript reaches nobody — the
-- guard reads the row, the row has not changed, and the feature ships as a 403
-- for every account except ADMIN (who holds the `*` wildcard). Re-running
-- `seed.ts` is not the fix either: it must never touch a populated database.
--
-- WHY IT EXCLUDES RATHER THAN INCLUDES: the first draft listed the five roles
-- in `seed.ts` by name and missed `EMTYMANAGER`, which exists in the database
-- and not in the seed — somebody made it in Administration. Naming the roles
-- that get the grant means every role created after this migration silently
-- does not, and the symptom is a person who cannot see a page their colleague
-- can. Naming the roles that DON'T is the safer default: a new internal role
-- can open Workspace, and Administration is where that gets tuned.
--
-- Excluded, deliberately:
--   SHIPPER, TRANSPORTER  — portal logins; blocked at the service layer too
--   CLIENT                — portal-shaped
--   DRIVER                — field staff. A driver updates a shipment and
--                           uploads a PoD; an internal work board is not their
--                           surface.
--   EMPLOYEE              — gets the narrow pair below instead
--   ADMIN                 — already holds `*`
--
-- Idempotent by construction: JSON_CONTAINS is checked before every append, so
-- a second run changes zero rows. Verified by H2.

-- Every internal desk: the full grant.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'workspace.*')
WHERE `name` NOT IN ('SHIPPER', 'TRANSPORTER', 'CLIENT', 'DRIVER', 'EMPLOYEE', 'ADMIN')
  AND NOT JSON_CONTAINS(`permissions`, '"workspace.*"');

-- Self-service staff: raise work and be given it, but never hand it on.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'workspace.view')
WHERE `name` = 'EMPLOYEE'
  AND NOT JSON_CONTAINS(`permissions`, '"workspace.view"')
  AND NOT JSON_CONTAINS(`permissions`, '"workspace.*"');

UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'workspace.create')
WHERE `name` = 'EMPLOYEE'
  AND NOT JSON_CONTAINS(`permissions`, '"workspace.create"')
  AND NOT JSON_CONTAINS(`permissions`, '"workspace.*"');
