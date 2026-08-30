-- Comments: what people say on a shipment, and on one of its containers.
--
-- `shipmentId` is always set, `bookingId` only when the comment is about one
-- container in particular — a scope inside the shipment's single thread, not
-- a second thread of its own. That is what lets the Shipment Overview page
-- read the whole conversation in one query and label the scoped rows.
--
-- The author is a live FK rather than a snapshotted name (the shape
-- `payout_holds` uses): a thread is read as a conversation between people who
-- are still here, so their current name and avatar is what belongs beside it.
-- ON DELETE RESTRICT — removing an account must not silently take half a
-- conversation with it.
CREATE TABLE `comments` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `comments_shipmentId_createdAt_idx`(`shipmentId`, `createdAt`),
    INDEX `comments_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    INDEX `comments_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `comments`
    ADD CONSTRAINT `comments_shipmentId_fkey`
    FOREIGN KEY (`shipmentId`) REFERENCES `shipments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `comments`
    ADD CONSTRAINT `comments_bookingId_fkey`
    FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `comments`
    ADD CONSTRAINT `comments_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
