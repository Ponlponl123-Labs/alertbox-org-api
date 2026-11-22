-- +goose Up
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Purpose: Add UserFeedback and StreamerReport tables for user feedback and anonymous streamer reporting.

CREATE TABLE IF NOT EXISTS `UserFeedback` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT NULL,
  `reasons` JSON NULL,
  `message` TEXT NOT NULL,
  `pathname` VARCHAR(512) NOT NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `UserFeedback_userId_createdAt_idx`(`userId`, `createdAt`),
  CONSTRAINT `UserFeedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StreamerReport` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `streamerId` BIGINT UNSIGNED NOT NULL,
  `topic` VARCHAR(64) NOT NULL,
  `message` TEXT NOT NULL,
  `reporterEmail` VARCHAR(320) NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `StreamerReport_streamerId_createdAt_idx`(`streamerId`, `createdAt`),
  INDEX `StreamerReport_orgId_createdAt_idx`(`orgId`, `createdAt`),
  CONSTRAINT `StreamerReport_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StreamerReport_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose Down
DROP TABLE IF EXISTS `StreamerReport`;
DROP TABLE IF EXISTS `UserFeedback`;
