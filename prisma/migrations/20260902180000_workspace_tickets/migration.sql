-- A problem reported from outside Fleetin, and the one task that answers it.
--
-- `task_id` is nullable (a ticket is logged before anybody is given the work)
-- and unique (exactly one task closes a ticket). ON DELETE SET NULL rather
-- than CASCADE: deleting the work must not delete the account of the problem.
CREATE TABLE `workspace_tickets` (
  `id` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(32) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('OPEN','IN_PROGRESS','WAITING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `channel` ENUM('PHONE','EMAIL','WHATSAPP','IN_PERSON','PORTAL') NOT NULL DEFAULT 'PHONE',
  `reporterName` VARCHAR(160) NULL,
  `reporterContact` VARCHAR(160) NULL,
  `recordType` ENUM('SHIPMENT','BOOKING','VEHICLE','DRIVER','PARTNER','SHIPPER','INVOICE','PAYOUT_HOLD','EMPTY_RETURN_CYCLE','EMPTY_RETURN_CHAIN') NULL,
  `recordId` VARCHAR(64) NULL,
  `recordRef` VARCHAR(64) NULL,
  `recordLabel` VARCHAR(160) NULL,
  `taskId` VARCHAR(191) NULL,
  `openedById` VARCHAR(191) NOT NULL,
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `workspace_tickets_reference_key`(`reference`),
  UNIQUE INDEX `workspace_tickets_taskId_key`(`taskId`),
  INDEX `workspace_tickets_status_priority_idx`(`status`, `priority`),
  INDEX `workspace_tickets_recordType_recordId_idx`(`recordType`, `recordId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workspace_tickets`
  ADD CONSTRAINT `workspace_tickets_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workspace_tickets`
  ADD CONSTRAINT `workspace_tickets_openedById_fkey`
  FOREIGN KEY (`openedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
