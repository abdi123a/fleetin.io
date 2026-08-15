-- AlterTable
ALTER TABLE `bank_accounts` ADD COLUMN `logoKey` VARCHAR(512) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `bank_movements` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `direction` VARCHAR(4) NOT NULL,
    `amountMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `balanceAfterMinorUnits` BIGINT NOT NULL,
    `counterpartyAccountId` VARCHAR(191) NULL,
    `groupId` VARCHAR(191) NULL,
    `method` VARCHAR(24) NULL,
    `externalReference` VARCHAR(128) NULL,
    `description` TEXT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bank_movements_reference_key`(`reference`),
    INDEX `bank_movements_bankAccountId_idx`(`bankAccountId`),
    INDEX `bank_movements_groupId_idx`(`groupId`),
    INDEX `bank_movements_occurredAt_idx`(`occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bank_movements` ADD CONSTRAINT `bank_movements_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
