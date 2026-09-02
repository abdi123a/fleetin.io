-- Who opened a document, and when.
--
-- `documents.downloadCount` counted downloads and recorded nothing else, so the
-- only answer available was "seven times" — which is not the question anyone
-- asks about an insurance certificate. These files are a haulier's trading
-- licence, a driver's ID and a policy naming a company; who pulled a copy is an
-- audit fact, not a popularity metric.
--
-- The counter stays. It is the only record of the downloads that happened
-- before this table existed, and zeroing it to make the two agree would be
-- destroying the older, cruder log to tidy up the newer one. The UI reports the
-- difference honestly instead.
CREATE TABLE `document_downloads` (
  `id`         VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `userId`     VARCHAR(191) NOT NULL,
  `at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `document_downloads_documentId_at_idx`(`documentId`, `at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
