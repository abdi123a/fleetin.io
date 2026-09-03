-- A folder can hang under a company instead of at the root of Files.
-- Both NULL keeps every existing row exactly where it is: the Files section.
ALTER TABLE `drive_folders`
  ADD COLUMN `ownerType` VARCHAR(16) NULL,
  ADD COLUMN `ownerId` VARCHAR(64) NULL;

CREATE INDEX `drive_folders_ownerType_ownerId_idx` ON `drive_folders`(`ownerType`, `ownerId`);
