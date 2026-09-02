-- Compliance documents get a registration date, and the catalog gets closed.
--
-- WHAT A DOCUMENT NOW CARRIES
--
-- Every compliance paper in the system is the same shape: a file, the day it
-- was issued, and the day it stops being valid. `expiryDate` already existed;
-- `issueDate` did not, so the only date a grey card carried was the day
-- somebody happened to upload it — which is a fact about the office, not about
-- the vehicle. Both dates are asked for at upload now.
ALTER TABLE `documents`
  ADD COLUMN `issueDate` DATETIME(3) NULL,
  ADD COLUMN `issuer` VARCHAR(160) NULL;

-- WHO ISSUED IT
--
-- One paper cares: a vehicle's insurance. A certificate is worth whatever the
-- company behind it is worth, and a claim is made against the company, so the
-- insurer is asked for alongside the two dates. The column is generic because
-- the question is ("who issued this?"), not because every paper will be asked.
--
-- The vehicle keeps its own copy, written from the document, so a fleet list
-- can show cover without joining the document table.
ALTER TABLE `vehicles`
  ADD COLUMN `insuranceProvider` VARCHAR(160) NULL;

-- THE CLOSED CATALOG
--
-- The catalog was open: anyone could define a new document type from the
-- onboarding wizard, and the seeds had accumulated seven of them across four
-- owners, several in the wrong place — the grey card sat on the TRANSPORTER
-- when a grey card is a vehicle's registration and belongs to the vehicle.
--
-- The list is now fixed at four papers, one per thing that can expire:
--
--   TRANSPORTER  Business License
--   VEHICLE      Grey Card · Insurance
--   DRIVER       Driver License
--   SHIPPER      Business License
--
-- Renames first, so the documents already filed under the old labels are kept
-- and simply answer to the new name — a truck's insurance certificate is the
-- same certificate whether the row says "Fleet Insurance" or "Insurance".
UPDATE `documents` SET `category` = 'Grey Card'
  WHERE `ownerType` = 'VEHICLE' AND `category` IN ('Vehicle Registration', 'Grey Card (Carte Grise)');
UPDATE `documents` SET `category` = 'Insurance'
  WHERE `ownerType` = 'VEHICLE' AND `category` = 'Fleet Insurance';

-- Then the catalog itself. Delete before insert so a label that moved owner
-- (the grey card) does not survive in both places, and INSERT IGNORE so an
-- environment already holding the closed list is untouched.
DELETE FROM `document_types` WHERE `ownerType` IN ('SHIPPER', 'PARTNER', 'VEHICLE', 'DRIVER');

INSERT IGNORE INTO `document_types` (`id`, `ownerType`, `label`, `required`, `createdAt`) VALUES
  (UUID(), 'SHIPPER', 'Business License', 1, NOW(3)),
  (UUID(), 'PARTNER', 'Business License', 1, NOW(3)),
  (UUID(), 'VEHICLE', 'Grey Card',        1, NOW(3)),
  (UUID(), 'VEHICLE', 'Insurance',        1, NOW(3)),
  (UUID(), 'DRIVER',  'Driver License',   1, NOW(3));
