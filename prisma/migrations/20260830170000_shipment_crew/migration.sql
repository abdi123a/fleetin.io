-- Shipment crew: the Fleetin staff working one shipment.
--
-- A join table rather than a column on `shipments`, because a real job has
-- more than one person on it. `is_lead` marks whoever is on point; the
-- application keeps it to at most one row per shipment (MySQL has no partial
-- unique index, so this is not enforced here).
CREATE TABLE `shipment_assignees` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedById` VARCHAR(191) NULL,

    INDEX `shipment_assignees_userId_idx`(`userId`),
    INDEX `shipment_assignees_shipmentId_idx`(`shipmentId`),
    UNIQUE INDEX `shipment_assignees_shipmentId_userId_key`(`shipmentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shipment_assignees`
    ADD CONSTRAINT `shipment_assignees_shipmentId_fkey`
    FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shipment_assignees`
    ADD CONSTRAINT `shipment_assignees_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shipment_assignees`
    ADD CONSTRAINT `shipment_assignees_assignedById_fkey`
    FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
