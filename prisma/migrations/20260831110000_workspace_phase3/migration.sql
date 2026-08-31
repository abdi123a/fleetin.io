-- Workspace, Phase 3 — productivity.
--
-- Checklists, followers, templates and recurrence.
--
-- The table worth reading twice is `workspace_task_occurrences`. Its
-- `@@unique(recurrenceId, occurrenceOn)` IS the duplicate guard for recurring
-- tasks: the second attempt at the same occurrence fails on the index rather
-- than on a check the code has to remember to run, so a processor that fires
-- twice, a BullMQ retry after a partial failure, and two workers racing all
-- converge on one task instead of three.
--
-- Comparing titles would not do: two people can legitimately raise "Review
-- vehicle documents" on the same morning, and a rule must not be fooled by
-- either of them.
--
-- `nextRunOn` and `occurrenceOn` are DATE, not DATETIME. "Every Monday" is a
-- calendar fact; storing an instant would let the schedule drift with whatever
-- clock the worker happens to run on.

-- AlterTable
ALTER TABLE `workspace_task_events` MODIFY `kind` ENUM('CREATED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'DUE_CHANGED', 'LINKED', 'UNLINKED', 'CHECKLIST_ADDED', 'CHECKLIST_DONE', 'CHECKLIST_REOPENED', 'FOLLOWER_ADDED', 'FOLLOWER_REMOVED', 'TEMPLATE_USED', 'RECURRENCE_GENERATED') NOT NULL;

-- CreateTable
CREATE TABLE `workspace_task_checklist_items` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `text` VARCHAR(255) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_task_checklist_items_taskId_position_idx`(`taskId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_followers` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_task_followers_userId_idx`(`userId`),
    UNIQUE INDEX `workspace_task_followers_taskId_userId_key`(`taskId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `dueInDays` INTEGER NULL,
    `createdById` VARCHAR(191) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `workspace_task_templates_archivedAt_idx`(`archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_template_items` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `text` VARCHAR(255) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `workspace_task_template_items_templateId_position_idx`(`templateId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_recurrences` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
    `interval` INTEGER NOT NULL DEFAULT 1,
    `weekday` INTEGER NULL,
    `dayOfMonth` INTEGER NULL,
    `assigneeId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `nextRunOn` DATE NOT NULL,
    `lastRunOn` DATE NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `workspace_task_recurrences_enabled_nextRunOn_idx`(`enabled`, `nextRunOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_task_occurrences` (
    `id` VARCHAR(191) NOT NULL,
    `recurrenceId` VARCHAR(191) NOT NULL,
    `occurrenceOn` DATE NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `workspace_task_occurrences_taskId_key`(`taskId`),
    UNIQUE INDEX `workspace_task_occurrences_recurrenceId_occurrenceOn_key`(`recurrenceId`, `occurrenceOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workspace_task_checklist_items` ADD CONSTRAINT `workspace_task_checklist_items_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_checklist_items` ADD CONSTRAINT `workspace_task_checklist_items_doneById_fkey` FOREIGN KEY (`doneById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_followers` ADD CONSTRAINT `workspace_task_followers_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_followers` ADD CONSTRAINT `workspace_task_followers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_templates` ADD CONSTRAINT `workspace_task_templates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_template_items` ADD CONSTRAINT `workspace_task_template_items_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `workspace_task_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_recurrences` ADD CONSTRAINT `workspace_task_recurrences_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `workspace_task_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_recurrences` ADD CONSTRAINT `workspace_task_recurrences_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_recurrences` ADD CONSTRAINT `workspace_task_recurrences_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_occurrences` ADD CONSTRAINT `workspace_task_occurrences_recurrenceId_fkey` FOREIGN KEY (`recurrenceId`) REFERENCES `workspace_task_recurrences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_task_occurrences` ADD CONSTRAINT `workspace_task_occurrences_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `workspace_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

