-- Refresh tokens: store a digest instead of the token, and group tokens into
-- session families so reuse of a rotated token can be detected.
--
-- `token` is dropped rather than migrated: it held raw tokens, there is no way
-- to derive the new hash column from rows we intend to stop trusting, and the
-- table was empty when this ran. Any pre-existing session must re-authenticate.

-- DropIndex
DROP INDEX `refresh_tokens_token_key` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `refresh_tokens` DROP COLUMN `token`,
    ADD COLUMN `familyId` VARCHAR(36) NOT NULL,
    ADD COLUMN `replacedById` VARCHAR(36) NULL,
    ADD COLUMN `revokedAt` DATETIME(3) NULL,
    ADD COLUMN `tokenHash` VARCHAR(64) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `refresh_tokens_tokenHash_key` ON `refresh_tokens`(`tokenHash`);

-- CreateIndex
CREATE INDEX `refresh_tokens_familyId_idx` ON `refresh_tokens`(`familyId`);
