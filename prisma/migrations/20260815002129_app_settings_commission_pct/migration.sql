/*
  Warnings:

  - You are about to drop the `shipper_rates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `shipper_rates` DROP FOREIGN KEY `shipper_rates_shipperId_fkey`;

-- DropTable
DROP TABLE `shipper_rates`;

-- CreateTable
CREATE TABLE `app_settings` (
    `id` VARCHAR(16) NOT NULL DEFAULT 'SINGLETON',
    `fleetinCommissionPct` DOUBLE NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedByName` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
