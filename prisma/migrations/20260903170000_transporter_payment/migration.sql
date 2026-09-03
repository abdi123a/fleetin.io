-- Paying the haulier.
--
-- The money runs one way: the shipper pays Fleetin, Fleetin pays the
-- transporter. `invoices.paidAt` already records the first half; nothing
-- recorded the second once the payout-order module was removed, so the Billing
-- screen could show what was owed but never what had been settled.
--
-- One payment per shipment, never per booking — a haulier who carried ten of a
-- shipment's containers is paid once, which is the rule the deleted module got
-- wrong and this one keeps.
--
-- The amount is stored, not derived: it is what actually left the account, and
-- renegotiating a commission next month must not restate a transfer that has
-- already happened.
--
-- The old `payoutReleased*` columns are deliberately LEFT IN PLACE. They hold
-- real historical dates and dropping them would destroy them; nothing reads
-- them any more.

ALTER TABLE `shipments`
  ADD COLUMN `transporterPaidAt` DATETIME(3) NULL,
  ADD COLUMN `transporterPaidMinorUnits` BIGINT NULL,
  ADD COLUMN `transporterPaidById` VARCHAR(191) NULL,
  ADD COLUMN `transporterPaidByName` VARCHAR(255) NULL;

CREATE INDEX `shipments_transporterPaidAt_idx` ON `shipments`(`transporterPaidAt`);
