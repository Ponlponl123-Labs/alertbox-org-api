-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
ALTER TABLE `OrganizationMember`
  ADD COLUMN IF NOT EXISTS `isDeleted` DATETIME(0) NULL AFTER `permissions`,
  ALGORITHM=INPLACE, LOCK=NONE;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
ALTER TABLE `OrganizationMember`
  DROP COLUMN IF EXISTS `isDeleted`,
  ALGORITHM=INPLACE, LOCK=NONE;
