-- AlterTable
ALTER TABLE `users` ADD COLUMN `partnerId` VARCHAR(191) NULL,
    ADD COLUMN `shipperId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `shippers` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `companyLegalName` VARCHAR(255) NOT NULL,
    `registrationNumber` VARCHAR(64) NOT NULL,
    `industry` VARCHAR(120) NOT NULL,
    `companySize` VARCHAR(32) NOT NULL,
    `country` VARCHAR(120) NOT NULL,
    `address` TEXT NOT NULL,
    `projectsCount` INTEGER NOT NULL DEFAULT 0,
    `approvalStatus` VARCHAR(16) NOT NULL DEFAULT 'Pending',
    `registrationDate` DATETIME(3) NOT NULL,
    `logoKey` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `shippers_reference_key`(`reference`),
    INDEX `shippers_approvalStatus_idx`(`approvalStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partners` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `companyLegalName` VARCHAR(255) NOT NULL,
    `registrationNumber` VARCHAR(64) NOT NULL,
    `businessLicenseNumber` VARCHAR(64) NULL,
    `operatingRegions` JSON NOT NULL,
    `serviceCategories` JSON NOT NULL,
    `fleetSize` INTEGER NOT NULL DEFAULT 0,
    `vehicleTypes` JSON NOT NULL,
    `country` VARCHAR(120) NOT NULL,
    `address` TEXT NOT NULL,
    `insuranceProvider` VARCHAR(255) NULL,
    `insurancePolicyNumber` VARCHAR(120) NULL,
    `insuranceExpiry` DATETIME(3) NULL,
    `partnerStatus` VARCHAR(16) NOT NULL DEFAULT 'Pending',
    `logoKey` VARCHAR(512) NULL,
    `registrationDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `partners_reference_key`(`reference`),
    INDEX `partners_partnerStatus_idx`(`partnerStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(16) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contacts_ownerType_ownerId_idx`(`ownerType`, `ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pricing_tiers` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `vehicleType` VARCHAR(64) NOT NULL,
    `basePriceMinorUnits` BIGINT NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `fxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `baseAmountMinorUnits` BIGINT NOT NULL,
    `pricePerKmMinorUnits` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pricing_tiers_partnerId_idx`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(255) NOT NULL,
    `accountHolder` VARCHAR(255) NOT NULL,
    `accountNumber` VARCHAR(64) NOT NULL,
    `iban` VARCHAR(64) NULL,
    `swiftCode` VARCHAR(32) NULL,
    `currency` VARCHAR(8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `partner_bank_accounts_partnerId_key`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicles` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `plateNumber` VARCHAR(32) NOT NULL,
    `truckType` VARCHAR(32) NOT NULL,
    `containerCapacity` VARCHAR(32) NULL,
    `trailerInfo` VARCHAR(120) NULL,
    `ownershipType` VARCHAR(16) NOT NULL,
    `insuranceStartDate` DATETIME(3) NULL,
    `insuranceExpiry` DATETIME(3) NOT NULL,
    `registrationExpiry` DATETIME(3) NOT NULL,
    `hasGPS` BOOLEAN NOT NULL DEFAULT false,
    `gpsDeviceId` VARCHAR(64) NULL,
    `operationalStatus` VARCHAR(24) NOT NULL DEFAULT 'Available',
    `assignedDriverId` VARCHAR(191) NULL,
    `year` INTEGER NULL,
    `make` VARCHAR(64) NULL,
    `model` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `vehicles_reference_key`(`reference`),
    UNIQUE INDEX `vehicles_plateNumber_key`(`plateNumber`),
    UNIQUE INDEX `vehicles_assignedDriverId_key`(`assignedDriverId`),
    INDEX `vehicles_partnerId_idx`(`partnerId`),
    INDEX `vehicles_operationalStatus_idx`(`operationalStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drivers` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `nationalId` VARCHAR(64) NOT NULL,
    `drivingLicenseNumber` VARCHAR(64) NOT NULL,
    `licenseExpiry` DATETIME(3) NOT NULL,
    `nationalIdExpiry` DATETIME(3) NULL,
    `profilePictureKey` VARCHAR(512) NULL,
    `accessCards` JSON NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'Available',
    `joinDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `drivers_reference_key`(`reference`),
    INDEX `drivers_partnerId_idx`(`partnerId`),
    INDEX `drivers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_types` (
    `id` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(16) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_types_ownerType_label_key`(`ownerType`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(16) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(120) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `fileSizeBytes` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Pending Review',
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedById` VARCHAR(191) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `downloadCount` INTEGER NOT NULL DEFAULT 0,

    INDEX `documents_ownerType_ownerId_idx`(`ownerType`, `ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(255) NOT NULL,
    `referenceNumber` VARCHAR(64) NOT NULL,
    `dpcsReference` VARCHAR(64) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'Pending',
    `paymentStatus` VARCHAR(24) NOT NULL DEFAULT 'Pending',
    `shipperId` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(255) NOT NULL,
    `customerCompany` VARCHAR(255) NOT NULL,
    `customerPhone` VARCHAR(32) NOT NULL,
    `customerEmail` VARCHAR(255) NOT NULL,
    `customerRating` DOUBLE NOT NULL DEFAULT 4.5,
    `partnerId` VARCHAR(191) NOT NULL,
    `transporterName` VARCHAR(255) NOT NULL,
    `transporterCompany` VARCHAR(255) NOT NULL,
    `transporterPhone` VARCHAR(32) NOT NULL,
    `transporterFleetCode` VARCHAR(32) NOT NULL,
    `transporterRating` DOUBLE NOT NULL DEFAULT 4.5,
    `driverId` VARCHAR(191) NULL,
    `driverName` VARCHAR(255) NULL,
    `driverPhone` VARCHAR(32) NULL,
    `driverLicenseNumber` VARCHAR(64) NULL,
    `driverRating` DOUBLE NULL,
    `driverVerified` BOOLEAN NULL,
    `vehicleId` VARCHAR(191) NULL,
    `vehicleRegistrationNumber` VARCHAR(32) NULL,
    `vehicleTypeSnapshot` VARCHAR(64) NULL,
    `vehicleCapacity` VARCHAR(64) NULL,
    `vehicleVerified` BOOLEAN NULL,
    `pickupLocationName` VARCHAR(255) NOT NULL,
    `pickupLocationAddress` TEXT NOT NULL,
    `pickupLocationCity` VARCHAR(120) NOT NULL,
    `pickupGateOrTerminal` VARCHAR(120) NULL,
    `pickupContactPerson` VARCHAR(255) NULL,
    `pickupContactPhone` VARCHAR(32) NULL,
    `deliveryLocationName` VARCHAR(255) NOT NULL,
    `deliveryLocationAddress` TEXT NOT NULL,
    `deliveryLocationCity` VARCHAR(120) NOT NULL,
    `deliveryGateOrTerminal` VARCHAR(120) NULL,
    `deliveryContactPerson` VARCHAR(255) NULL,
    `deliveryContactPhone` VARCHAR(32) NULL,
    `estimatedDistanceKm` DOUBLE NOT NULL,
    `estimatedDurationHours` VARCHAR(32) NOT NULL,
    `cargoType` VARCHAR(120) NOT NULL,
    `shipmentCategory` VARCHAR(24) NULL,
    `containerNumber` VARCHAR(64) NULL,
    `shippingLine` VARCHAR(64) NULL,
    `containerReturnDepot` VARCHAR(255) NULL,
    `containerReturnDeadline` DATETIME(3) NULL,
    `containerReturnFreeDays` INTEGER NULL,
    `goodsDescription` TEXT NOT NULL,
    `totalWeightKg` DOUBLE NOT NULL,
    `dimensions` VARCHAR(120) NULL,
    `equipmentType` VARCHAR(120) NULL,
    `bulkCommodity` VARCHAR(120) NULL,
    `bulkHandlingMethod` VARCHAR(120) NULL,
    `machineryType` VARCHAR(120) NULL,
    `lashingStandard` VARCHAR(120) NULL,
    `requiredDocuments` JSON NULL,
    `scheduledPickupTime` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `rateMinorUnits` BIGINT NOT NULL,
    `rateCurrency` VARCHAR(8) NOT NULL DEFAULT 'DJF',
    `rateFxRate` DOUBLE NOT NULL DEFAULT 1.0,
    `rateBaseAmountMinorUnits` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `shipments_reference_key`(`reference`),
    INDEX `shipments_shipperId_idx`(`shipperId`),
    INDEX `shipments_partnerId_idx`(`partnerId`),
    INDEX `shipments_driverId_idx`(`driverId`),
    INDEX `shipments_vehicleId_idx`(`vehicleId`),
    INDEX `shipments_status_idx`(`status`),
    INDEX `shipments_scheduledPickupTime_idx`(`scheduledPickupTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipment_timeline_steps` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `timestamp` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL,
    `actor` VARCHAR(255) NULL,
    `location` VARCHAR(255) NULL,
    `podFileUrl` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shipment_timeline_steps_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_shipperId_idx` ON `users`(`shipperId`);

-- CreateIndex
CREATE INDEX `users_partnerId_idx` ON `users`(`partnerId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_shipperId_fkey` FOREIGN KEY (`shipperId`) REFERENCES `shippers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pricing_tiers` ADD CONSTRAINT `pricing_tiers_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_bank_accounts` ADD CONSTRAINT `partner_bank_accounts_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_shipperId_fkey` FOREIGN KEY (`shipperId`) REFERENCES `shippers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipment_timeline_steps` ADD CONSTRAINT `shipment_timeline_steps_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
