-- Folders people make for themselves in Fleetin Drive.
--
-- Everything the drive showed until now was derived: a transporter's folder
-- exists because the transporter does, and holds the four papers the
-- catalogue asks for. That tree has no room for a signed contract, a tender,
-- or a photograph of a damaged box — the things people actually wanted to
-- file — so this is the other half of the drive: folders that exist because
-- somebody created them, nested as deep as they like.
--
-- The files inside are ordinary `documents` rows with `ownerType = 'FOLDER'`
-- and `ownerId` pointing here, so upload, download, preview and the download
-- log are the code that already exists. Sub-folders cascade at the database;
-- the files do not (documents never carry a foreign key) and are removed by
-- the service, storage and rows both.
CREATE TABLE `drive_folders` (
  `id`          VARCHAR(191) NOT NULL,
  `name`        VARCHAR(120) NOT NULL,
  `parentId`    VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL,

  INDEX `drive_folders_parentId_idx`(`parentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `drive_folders`
  ADD CONSTRAINT `drive_folders_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `drive_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
