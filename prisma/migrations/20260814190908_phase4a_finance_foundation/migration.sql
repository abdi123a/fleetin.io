-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `transporterCostBaseAmountMinorUnits` BIGINT NULL,
    ADD COLUMN `transporterCostCurrency` VARCHAR(8) NULL DEFAULT 'DJF',
    ADD COLUMN `transporterCostFxRate` DOUBLE NULL DEFAULT 1.0,
    ADD COLUMN `transporterCostMinorUnits` BIGINT NULL;

-- AlterTable
ALTER TABLE `shipments` ADD COLUMN `clientRateBaseAmountMinorUnits` BIGINT NULL,
    ADD COLUMN `clientRateCurrency` VARCHAR(8) NULL DEFAULT 'DJF',
    ADD COLUMN `clientRateFxRate` DOUBLE NULL DEFAULT 1.0,
    ADD COLUMN `clientRateMinorUnits` BIGINT NULL,
    ADD COLUMN `payoutReleasedAt` DATETIME(3) NULL,
    ADD COLUMN `payoutReleasedById` VARCHAR(191) NULL,
    ADD COLUMN `payoutReleasedByName` VARCHAR(255) NULL,
    ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `shipperId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `contractEndAt` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `projects_reference_key`(`reference`),
    INDEX `projects_shipperId_idx`(`shipperId`),
    INDEX `projects_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payout_holds` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NULL,
    `category` VARCHAR(32) NOT NULL,
    `reason` TEXT NOT NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `raisedByName` VARCHAR(255) NOT NULL,
    `raisedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `clearedAt` DATETIME(3) NULL,
    `clearedById` VARCHAR(191) NULL,
    `clearedByName` VARCHAR(255) NULL,
    `note` TEXT NULL,

    INDEX `payout_holds_shipmentId_idx`(`shipmentId`),
    INDEX `payout_holds_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `shipments_projectId_idx` ON `shipments`(`projectId`);

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_shipperId_fkey` FOREIGN KEY (`shipperId`) REFERENCES `shippers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payout_holds` ADD CONSTRAINT `payout_holds_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payout_holds` ADD CONSTRAINT `payout_holds_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
