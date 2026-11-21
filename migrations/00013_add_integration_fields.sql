-- +goose Up
-- ============================================================================
-- ADD NULLABLE INTEGRATION CREDENTIAL & STATE FIELDS
-- Target: MariaDB Galera (InnoDB, utf8mb4_unicode_ci)
-- ============================================================================

ALTER TABLE `Integration`
  ADD COLUMN `secretType` VARCHAR(64) NULL DEFAULT NULL AFTER `secret`,
  ADD COLUMN `token` VARCHAR(2048) NULL DEFAULT NULL AFTER `secretType`,
  ADD COLUMN `state` VARCHAR(255) NULL DEFAULT NULL AFTER `token`,
  ADD COLUMN `payload` JSON NULL DEFAULT NULL AFTER `state`;

-- +goose Down
ALTER TABLE `Integration`
  DROP COLUMN `payload`,
  DROP COLUMN `state`,
  DROP COLUMN `token`,
  DROP COLUMN `secretType`;
