-- CreateTable
CREATE TABLE `bookings` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'Pending',
    `cargoType` VARCHAR(120) NOT NULL,
    `shipmentCategory` VARCHAR(24) NULL,
    `containerNumber` VARCHAR(64) NULL,
    `shippingLine` VARCHAR(64) NULL,
    `partnerId` VARCHAR(191) NULL,
    `vehicleId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `containerReturnDepot` VARCHAR(255) NULL,
    `containerReturnDeadline` DATETIME(3) NULL,
    `containerReturnFreeDays` INTEGER NULL,
    `scheduledPickupTime` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `bookings_reference_key`(`reference`),
    INDEX `bookings_shipmentId_idx`(`shipmentId`),
    INDEX `bookings_partnerId_idx`(`partnerId`),
    INDEX `bookings_vehicleId_idx`(`vehicleId`),
    INDEX `bookings_driverId_idx`(`driverId`),
    INDEX `bookings_status_idx`(`status`),
    INDEX `bookings_containerNumber_idx`(`containerNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_timeline_steps` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
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

    INDEX `booking_timeline_steps_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empty_return_cycles` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `nextBookingId` VARCHAR(191) NULL,
    `chainId` VARCHAR(191) NULL,
    `seq` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'preparing',
    `exception` VARCHAR(64) NULL,
    `emptyReadyAt` DATETIME(3) NULL,
    `returnedAt` DATETIME(3) NULL,
    `deadline` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `empty_return_cycles_reference_key`(`reference`),
    UNIQUE INDEX `empty_return_cycles_bookingId_key`(`bookingId`),
    UNIQUE INDEX `empty_return_cycles_nextBookingId_key`(`nextBookingId`),
    INDEX `empty_return_cycles_chainId_idx`(`chainId`),
    INDEX `empty_return_cycles_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empty_return_chains` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `empty_return_chains_reference_key`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `partners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_timeline_steps` ADD CONSTRAINT `booking_timeline_steps_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empty_return_cycles` ADD CONSTRAINT `empty_return_cycles_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empty_return_cycles` ADD CONSTRAINT `empty_return_cycles_nextBookingId_fkey` FOREIGN KEY (`nextBookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empty_return_cycles` ADD CONSTRAINT `empty_return_cycles_chainId_fkey` FOREIGN KEY (`chainId`) REFERENCES `empty_return_chains`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
