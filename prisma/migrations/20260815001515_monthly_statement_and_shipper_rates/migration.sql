-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `periodEnd` DATETIME(3) NULL,
    ADD COLUMN `periodStart` DATETIME(3) NULL,
    ADD COLUMN `projectId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `monthlyEstimateBaseAmountMinorUnits` BIGINT NULL,
    ADD COLUMN `monthlyEstimateCurrency` VARCHAR(8) NULL DEFAULT 'DJF',
    ADD COLUMN `monthlyEstimateFxRate` DOUBLE NULL DEFAULT 1.0,
    ADD COLUMN `monthlyEstimateMinorUnits` BIGINT NULL;

-- CreateTable
CREATE TABLE `shipper_rates` (
    `id` VARCHAR(191) NOT NULL,
    `shipperId` VARCHAR(191) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `vehicleType` VARCHAR(64) NOT NULL,
    `basePriceMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `pricePerKmMinorUnits` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipper_rates_shipperId_idx`(`shipperId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `invoices_shipperId_periodStart_idx` ON `invoices`(`shipperId`, `periodStart`);

-- CreateIndex
CREATE INDEX `invoices_projectId_idx` ON `invoices`(`projectId`);

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipper_rates` ADD CONSTRAINT `shipper_rates_shipperId_fkey` FOREIGN KEY (`shipperId`) REFERENCES `shippers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
