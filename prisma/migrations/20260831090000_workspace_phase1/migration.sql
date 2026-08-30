-- Workspace, Phase 1.
--
-- The work layer. Six tables that hold pointers at the domain and never a copy
-- of it: no shipment status, no rate, no detention day lives in here.
--
-- `workspace_task_links.recordId` is deliberately NOT a foreign key. Ten
-- nullable FKs on one table to say "points at exactly one of these" would be
-- ten indexes and ten joins to render one chip; existence and read-permission
-- are checked in the service instead, batched per record type.

-- CreateTable
CREATE TABLE `workspace_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `assigneeId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `workspace_tasks_reference_key`(`reference`),
    INDEX `workspace_tasks_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `workspace_tasks_createdById_status_idx`(`createdById`, `status`),
    INDEX `workspace_tasks_status_dueAt_idx`(`status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_links` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `recordType` ENUM('SHIPMENT', 'BOOKING', 'VEHICLE', 'DRIVER', 'PARTNER', 'SHIPPER', 'INVOICE', 'PAYOUT_HOLD', 'EMPTY_RETURN_CYCLE', 'EMPTY_RETURN_CHAIN') NOT NULL,
    `recordId` VARCHAR(64) NOT NULL,
    `recordRef` VARCHAR(64) NOT NULL,
    `label` VARCHAR(160) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_task_links_recordType_recordId_idx`(`recordType`, `recordId`),
    UNIQUE INDEX `workspace_task_links_taskId_recordType_recordId_key`(`taskId`, `recordType`, `recordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_messages` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `recordType` ENUM('SHIPMENT', 'BOOKING', 'VEHICLE', 'DRIVER', 'PARTNER', 'SHIPPER', 'INVOICE', 'PAYOUT_HOLD', 'EMPTY_RETURN_CYCLE', 'EMPTY_RETURN_CHAIN') NULL,
    `recordId` VARCHAR(64) NULL,
    `recordRef` VARCHAR(64) NULL,
    `body` TEXT NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `parentMessageId` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `assignedById` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `workspace_messages_taskId_createdAt_idx`(`taskId`, `createdAt`),
    INDEX `workspace_messages_recordType_recordId_createdAt_idx`(`recordType`, `recordId`, `createdAt`),
    INDEX `workspace_messages_authorId_idx`(`authorId`),
    INDEX `workspace_messages_parentMessageId_idx`(`parentMessageId`),
    INDEX `workspace_messages_assigneeId_resolvedAt_idx`(`assigneeId`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_mentions` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_mentions_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `workspace_mentions_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_events` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `kind` ENUM('CREATED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'DUE_CHANGED', 'LINKED', 'UNLINKED') NOT NULL,
    `fromValue` VARCHAR(255) NULL,
    `toValue` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_task_events_taskId_createdAt_idx`(`taskId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('MENTIONED', 'ASSIGNED', 'UNASSIGNED', 'TASK_UPDATED', 'COMMENT_ADDED', 'REPLY_ADDED', 'COMMENT_ASSIGNED', 'COMMENT_RESOLVED') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_notifications_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workspace_tasks` ADD CONSTRAINT `workspace_tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_tasks` ADD CONSTRAINT `workspace_tasks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_links` ADD CONSTRAINT `workspace_task_links_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_parentMessageId_fkey` FOREIGN KEY (`parentMessageId`) REFERENCES `workspace_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_mentions` ADD CONSTRAINT `workspace_mentions_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `workspace_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_mentions` ADD CONSTRAINT `workspace_mentions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_events` ADD CONSTRAINT `workspace_task_events_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_events` ADD CONSTRAINT `workspace_task_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_notifications` ADD CONSTRAINT `workspace_notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_notifications` ADD CONSTRAINT `workspace_notifications_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_notifications` ADD CONSTRAINT `workspace_notifications_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_notifications` ADD CONSTRAINT `workspace_notifications_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `workspace_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ── The "exactly one anchor" invariant ──────────────────────────────────────
--
-- A message hangs off a task, OR off a record directly — never both, never
-- neither. That is NOT a CHECK constraint here, and not for want of trying:
-- MySQL rejects one (error 3823) because `taskId` already carries a cascading
-- foreign key, and a column cannot appear in both a CHECK and an FK with a
-- referential action.
--
-- So the invariant lives in `messages.service.ts`, which is where this
-- codebase already keeps this class of rule — `shipment-crew.util.ts` enforces
-- "at most one lead per shipment" the same way, for the same reason.
