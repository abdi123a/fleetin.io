/*
  Warnings:

  - You are about to drop the column `deadline` on the `empty_return_cycles` table. All the data in the column will be lost.
  - You are about to drop the column `exception` on the `empty_return_cycles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `emptyReturnException` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `empty_return_cycles` DROP COLUMN `deadline`,
    DROP COLUMN `exception`;
