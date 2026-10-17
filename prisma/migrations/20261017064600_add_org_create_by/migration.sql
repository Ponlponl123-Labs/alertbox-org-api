-- AlterTable Organization
ALTER TABLE `Organization` ADD COLUMN `createBy` BIGINT UNSIGNED NULL AFTER `ownerId`;

-- Backfill existing organizations with their current ownerId
UPDATE `Organization` SET `createBy` = `ownerId` WHERE `createBy` IS NULL;

-- Enforce NOT NULL constraint
ALTER TABLE `Organization` MODIFY COLUMN `createBy` BIGINT UNSIGNED NOT NULL;

-- CreateIndex
CREATE INDEX `Organization_createBy_idx` ON `Organization`(`createBy`);

-- AddForeignKey
ALTER TABLE `Organization` ADD CONSTRAINT `Organization_createBy_fkey` FOREIGN KEY (`createBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
