-- Internal expenses: what it costs to run Fleetin.
--
-- The two tables have existed since `init` and were never given a module — a
-- leftover of the working-capital engine removed on 2026-09-03. Rather than
-- drop and recreate them, this widens them into the record the desk actually
-- needs: a receipt stored the way every other file is, a payee, a claim that
-- somebody approves and somebody else pays, and templates that carry their own
-- reference and posting history.
--
-- Safe on a populated database, but in practice both tables are empty:
-- `seed-volume.ts --reset` has always cleared `expense_entries`, and nothing
-- has ever written a template.

-- ─── expense_entries ────────────────────────────────────────────────────────

ALTER TABLE `expense_entries`
  ADD COLUMN `vendorOrPayee`    VARCHAR(255) NULL,
  ADD COLUMN `reimbursable`     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN `receiptKey`       VARCHAR(512) NULL,
  ADD COLUMN `receiptName`      VARCHAR(255) NULL,
  ADD COLUMN `receiptMime`      VARCHAR(120) NULL,
  ADD COLUMN `receiptSizeBytes` INTEGER      NULL,
  ADD COLUMN `periodLabel`      VARCHAR(32)  NULL,
  ADD COLUMN `rejectionReason`  TEXT         NULL;

-- `receiptUrl` was a bare text column nothing ever wrote. A pasted link is not
-- evidence of a purchase; the storage key above is.
ALTER TABLE `expense_entries` DROP COLUMN `receiptUrl`;

-- The ladder is Submitted → Approved → Paid, with Rejected off the side.
-- "Pending" named the first rung ambiguously — pending what, approval or
-- payment? Existing rows (there are none in practice) move with it.
UPDATE `expense_entries` SET `status` = 'Submitted' WHERE `status` = 'Pending';
ALTER TABLE `expense_entries` MODIFY COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'Submitted';

CREATE INDEX `expense_entries_createdById_idx` ON `expense_entries`(`createdById`);
CREATE INDEX `expense_entries_incurredAt_idx` ON `expense_entries`(`incurredAt`);
CREATE INDEX `expense_entries_recurringTemplateId_periodLabel_idx`
  ON `expense_entries`(`recurringTemplateId`, `periodLabel`);

-- ─── recurring_expense_templates ────────────────────────────────────────────

ALTER TABLE `recurring_expense_templates`
  ADD COLUMN `reference`     VARCHAR(32)  NULL,
  ADD COLUMN `method`        VARCHAR(32)  NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN `lastPostedAt`  DATETIME(3)  NULL,
  ADD COLUMN `endsAt`        DATETIME(3)  NULL,
  ADD COLUMN `notes`         TEXT         NULL,
  ADD COLUMN `createdById`   VARCHAR(191) NULL,
  ADD COLUMN `createdByName` VARCHAR(255) NULL,
  ADD COLUMN `updatedAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Every row gets a `REX-#####` before the column is made unique and required —
-- an empty table makes this a no-op, a populated one is numbered by age.
SET @row := 0;
UPDATE `recurring_expense_templates`
SET `reference` = CONCAT('REX-', LPAD((@row := @row + 1), 5, '0'))
WHERE `reference` IS NULL
ORDER BY `createdAt`;

ALTER TABLE `recurring_expense_templates` MODIFY COLUMN `reference` VARCHAR(32) NOT NULL;
CREATE UNIQUE INDEX `recurring_expense_templates_reference_key`
  ON `recurring_expense_templates`(`reference`);
CREATE INDEX `recurring_expense_templates_isActive_nextDueAt_idx`
  ON `recurring_expense_templates`(`isActive`, `nextDueAt`);
