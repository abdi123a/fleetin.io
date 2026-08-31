-- Workspace, Phase 2 — channels and direct messages.
--
-- One `workspace_channels` table for both. A DM is a channel with
-- `kind = 'DIRECT'`, no name and exactly two members; everything downstream —
-- messages, threads, mentions, unread, membership — is then one code path
-- instead of two.
--
-- `key` is what makes a DM unique. Both sides compute `dm:<a>:<b>` from the
-- two user ids sorted, so two people opening each other at the same instant
-- collide on the unique index rather than ending up with two conversations
-- each holding half the history.
--
-- `workspace_messages.channelId` is a THIRD anchor beside task and record.
-- Still exactly one, still enforced in `messages.service.ts` — MySQL refuses a
-- CHECK on a column that also carries a cascading foreign key (error 3823).

-- AlterTable
ALTER TABLE `workspace_messages` ADD COLUMN `channelId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `workspace_channels` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `name` VARCHAR(120) NULL,
    `topic` VARCHAR(255) NULL,
    `kind` ENUM('CHANNEL', 'DIRECT') NOT NULL DEFAULT 'CHANNEL',
    `isPrivate` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspace_channels_key_key`(`key`),
    INDEX `workspace_channels_kind_archivedAt_idx`(`kind`, `archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_channel_members` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `lastReadAt` DATETIME(3) NULL,
    `mutedAt` DATETIME(3) NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_channel_members_userId_idx`(`userId`),
    UNIQUE INDEX `workspace_channel_members_channelId_userId_key`(`channelId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `workspace_messages_channelId_createdAt_idx` ON `workspace_messages`(`channelId`, `createdAt`);

-- CreateIndex
CREATE INDEX `workspace_messages_channelId_parentMessageId_createdAt_idx` ON `workspace_messages`(`channelId`, `parentMessageId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `workspace_messages` ADD CONSTRAINT `workspace_messages_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `workspace_channels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_channels` ADD CONSTRAINT `workspace_channels_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_channel_members` ADD CONSTRAINT `workspace_channel_members_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `workspace_channels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_channel_members` ADD CONSTRAINT `workspace_channel_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

