-- AlterTable Organization
ALTER TABLE `Organization` ADD COLUMN `banner` VARCHAR(512) NULL AFTER `avatar`;

-- CreateTable OrganizationRolePreset
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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
