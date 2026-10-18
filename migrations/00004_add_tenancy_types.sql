-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
ALTER TABLE `User`
  ADD COLUMN IF NOT EXISTS `type` ENUM('REGULAR', 'SUPPORTER', 'OPERATOR') NOT NULL DEFAULT 'REGULAR' AFTER `email`,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `Organization`
  ADD COLUMN IF NOT EXISTS `type` ENUM('COMMUNITY', 'ENTERPRISE') NOT NULL DEFAULT 'COMMUNITY' AFTER `id`,
  ALGORITHM=INPLACE, LOCK=NONE;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
ALTER TABLE `Organization`
  DROP COLUMN IF EXISTS `type`,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE `User`
  DROP COLUMN IF EXISTS `type`,
  ALGORITHM=INPLACE, LOCK=NONE;
