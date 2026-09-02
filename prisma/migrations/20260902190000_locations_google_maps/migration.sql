-- Locations, distances between them, and the link from a shipment to both.
--
-- Replaces three disconnected sources of geography: six hardcoded rows in the
-- frontend's Locations page, a list of bare strings in localStorage that the
-- shipment wizard picked from, and the `bi-geo.ts` gazetteer. See the model
-- comments in schema.prisma for the full account.

-- CreateTable
CREATE TABLE `locations` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `kind` VARCHAR(24) NOT NULL DEFAULT 'other',
    `googlePlaceId` VARCHAR(255) NULL,
    `formattedAddress` TEXT NULL,
    `city` VARCHAR(120) NOT NULL DEFAULT 'Djibouti',
    `country` VARCHAR(120) NOT NULL DEFAULT 'Djibouti',
    `countryCode` VARCHAR(2) NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
    `gateOrTerminal` VARCHAR(120) NULL,
    `contactPerson` VARCHAR(255) NULL,
    `contactPhone` VARCHAR(32) NULL,
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `locations_reference_key`(`reference`),
    UNIQUE INDEX `locations_googlePlaceId_key`(`googlePlaceId`),
    INDEX `locations_kind_idx`(`kind`),
    INDEX `locations_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location_distances` (
    `id` VARCHAR(191) NOT NULL,
    `originId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `distanceMeters` INTEGER NOT NULL,
    `durationSeconds` INTEGER NOT NULL,
    `provider` VARCHAR(16) NOT NULL DEFAULT 'google',
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `location_distances_destinationId_idx`(`destinationId`),
    UNIQUE INDEX `location_distances_originId_destinationId_key`(`originId`, `destinationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `location_distances` ADD CONSTRAINT `location_distances_originId_fkey` FOREIGN KEY (`originId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `location_distances` ADD CONSTRAINT `location_distances_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: link shipments to the catalogue, and record how the distance was
-- arrived at. Every existing row keeps its text snapshot and gets a NULL link;
-- `estimatedDistanceSource` defaults to 'estimate', which is the honest label
-- for the substring-match guess every pre-existing row's distance came from.
ALTER TABLE `shipments`
    ADD COLUMN `pickupLocationId` VARCHAR(191) NULL,
    ADD COLUMN `deliveryLocationId` VARCHAR(191) NULL,
    ADD COLUMN `estimatedDistanceSource` VARCHAR(16) NOT NULL DEFAULT 'estimate';

-- CreateIndex
CREATE INDEX `shipments_pickupLocationId_idx` ON `shipments`(`pickupLocationId`);

-- CreateIndex
CREATE INDEX `shipments_deliveryLocationId_idx` ON `shipments`(`deliveryLocationId`);

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_pickupLocationId_fkey` FOREIGN KEY (`pickupLocationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_deliveryLocationId_fkey` FOREIGN KEY (`deliveryLocationId`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
