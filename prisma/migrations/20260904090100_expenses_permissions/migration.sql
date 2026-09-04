-- Grant the `expenses` vocabulary to the roles that already exist.
--
-- WHY THIS FILE EXISTS: `roles.permissions` is a JSON column, not a table. A
-- permission string added to the catalogue in TypeScript reaches nobody — the
-- guard reads the row, the row has not changed, and the feature ships as a 403
-- for every account except ADMIN (who holds the `*` wildcard). Same reasoning
-- as `20260902190100_locations_permissions`; see its note in full.
--
-- WHY IT EXCLUDES RATHER THAN INCLUDES: naming the roles that GET the grant
-- means every role created afterwards in Administration silently does not.
--
-- The split here is the point of the feature. **Anybody on the payroll files
-- an expense** — that is what stops receipts living in a drawer until month
-- end — so DRIVER and EMPLOYEE get `expenses.create`, which raises a claim and
-- (through the row-level scope in `ExpensesService.findAll`) shows them their
-- own and nobody else's. Approving, paying and owning the recurring book stay
-- with the desks.
--
-- Portal logins — SHIPPER, TRANSPORTER, CLIENT — get nothing at all. They are
-- counterparties, not staff; Fleetin's cost base is none of their business.
--
-- Idempotent by construction: JSON_CONTAINS is checked before every append.

-- Every internal desk: the full grant.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'expenses.*')
WHERE `name` NOT IN ('SHIPPER', 'TRANSPORTER', 'CLIENT', 'DRIVER', 'EMPLOYEE', 'ADMIN')
  AND NOT JSON_CONTAINS(`permissions`, '"expenses.*"');

-- Field and self-service staff: file your own, see your own.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'expenses.create')
WHERE `name` IN ('DRIVER', 'EMPLOYEE')
  AND NOT JSON_CONTAINS(`permissions`, '"expenses.create"')
  AND NOT JSON_CONTAINS(`permissions`, '"expenses.*"');
