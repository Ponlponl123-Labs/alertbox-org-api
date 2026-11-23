-- +goose Up
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Purpose: Add Violation table for user accounts, organizations, and streamers.

CREATE TABLE IF NOT EXISTS `Violation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `targetType` ENUM('USER', 'ORG', 'STREAMER') NOT NULL,
  `targetId` BIGINT UNSIGNED NOT NULL,
  `level` INT UNSIGNED NOT NULL DEFAULT 1,
  `message` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Violation_targetType_targetId_createdAt_idx`(`targetType`, `targetId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose Down
DROP TABLE IF EXISTS `Violation`;
