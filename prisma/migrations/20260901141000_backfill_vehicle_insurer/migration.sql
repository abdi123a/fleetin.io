-- Data migration, no schema change.
--
-- Every truck already in the book gets an insurer, read off the transporter
-- that owns it. Before insurance moved onto the vehicle's own certificate, a
-- fleet was covered by one policy recorded on the TRANSPORTER — so the company
-- named there is, for every one of its trucks, the company that actually
-- covered them. Copying it forward is a restatement of what the record already
-- said, not a guess.
--
-- Only where the vehicle has none: an operator who has since set a truck's own
-- insurer knows something the fleet policy does not, and must not be overwritten.
UPDATE `vehicles` v
  JOIN `partners` p ON p.`id` = v.`partnerId`
  SET v.`insuranceProvider` = p.`insuranceProvider`
  WHERE v.`insuranceProvider` IS NULL AND p.`insuranceProvider` IS NOT NULL;
