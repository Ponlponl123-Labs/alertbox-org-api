-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
ALTER TABLE `User`
  ADD COLUMN IF NOT EXISTS `displayName` VARCHAR(64) NULL AFTER `name`,
  ALGORITHM=INPLACE, LOCK=NONE;

-- Seamless backfill from existing username to preserve data safety
UPDATE `User` SET `displayName` = `name` WHERE `displayName` IS NULL AND `name` IS NOT NULL;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
ALTER TABLE `User`
  DROP COLUMN IF EXISTS `displayName`,
  ALGORITHM=INPLACE, LOCK=NONE;
