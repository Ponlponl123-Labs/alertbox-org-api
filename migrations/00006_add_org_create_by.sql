-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
ALTER TABLE `Organization`
  ADD COLUMN IF NOT EXISTS `createBy` BIGINT UNSIGNED NULL AFTER `ownerId`,
  ALGORITHM=INPLACE, LOCK=NONE;

UPDATE `Organization` SET `createBy` = `ownerId` WHERE `createBy` IS NULL;

ALTER TABLE `Organization`
  MODIFY COLUMN `createBy` BIGINT UNSIGNED NOT NULL;

CREATE INDEX IF NOT EXISTS `Organization_createBy_idx` ON `Organization`(`createBy`);

ALTER TABLE `Organization`
  ADD CONSTRAINT `Organization_createBy_fkey` FOREIGN KEY IF NOT EXISTS (`createBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
ALTER TABLE `Organization` DROP FOREIGN KEY `Organization_createBy_fkey`;
DROP INDEX IF EXISTS `Organization_createBy_idx` ON `Organization`;
ALTER TABLE `Organization` DROP COLUMN IF EXISTS `createBy`, ALGORITHM=INPLACE, LOCK=NONE;
