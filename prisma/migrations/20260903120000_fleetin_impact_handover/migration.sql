-- Fleetin Impact: a pairing between two carriers saves road too.
--
-- The first cut counted only a continuation — one carrier's truck finishing
-- at the free zone and going straight to the port for its own next load. On
-- this book most pairings are between two carriers: carrier B's truck takes
-- carrier A's empty through the free zone on its way to the port, and A
-- never sends a truck for it. The user's ruling of 2026-09-03: count them.
--
-- A handover's saving is A's `Garage → Free Zone` and `Port → Garage`, less
-- the detour B drove to come through the free zone. Both halves and the
-- detour are kept so the net figure can be re-derived, and the record says
-- which kind of saving it is and whose factor priced it.
ALTER TABLE `empty_return_cycles`
    ADD COLUMN `impactModel`           VARCHAR(16)  NULL,
    ADD COLUMN `impactNextPartnerId`   VARCHAR(191) NULL,
    ADD COLUMN `impactNextPartnerName` VARCHAR(255) NULL,
    ADD COLUMN `avoidedDetourMeters`   INTEGER      NULL,
    ADD COLUMN `avoidedFactorBasis`    VARCHAR(24)  NULL;

-- Every saving counted so far was a continuation, priced by the truck that
-- gated in with the next load.
UPDATE `empty_return_cycles`
SET `impactModel` = 'continuation',
    `avoidedFactorBasis` = CASE WHEN `avoidedCo2FactorUsed` IS NULL THEN NULL ELSE 'next_load_truck' END
WHERE `impactStatus` = 'realized' AND `impactModel` IS NULL;
