-- +goose Up
-- ============================================================================
-- MIGRATION: add_org_banner_and_presets (20261015023500)
-- Target: MariaDB Galera (InnoDB, utf8mb4_unicode_ci)
-- ============================================================================

ALTER TABLE `Organization` ADD COLUMN IF NOT EXISTS `banner` VARCHAR(512) NULL AFTER `avatar`;

CREATE TABLE IF NOT EXISTS `OrganizationRolePreset` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NULL,
  `permissions` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `color` VARCHAR(255) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  INDEX `OrganizationRolePreset_orgId_idx` (`orgId`),
  CONSTRAINT `OrganizationRolePreset_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose Down
DROP TABLE IF EXISTS `OrganizationRolePreset`;
ALTER TABLE `Organization` DROP COLUMN IF EXISTS `banner`;
