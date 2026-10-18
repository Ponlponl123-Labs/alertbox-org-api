-- +goose Up
-- ============================================================================
-- BASELINE SCHEMA AT 20261008043500_migrate_all_models_to_bigint
-- Target: MariaDB Galera (InnoDB, utf8mb4_unicode_ci)
-- All tables created with IF NOT EXISTS for idempotent no-op on existing DBs
-- ============================================================================

CREATE TABLE IF NOT EXISTS `User` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(256) NOT NULL,
  `createWith` VARCHAR(50) NOT NULL,
  `secret` VARCHAR(255) NOT NULL,
  `disabledAt` TIMESTAMP(0) NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  UNIQUE KEY `User_secret_key` (`secret`),
  UNIQUE KEY `User_id_secret_key` (`id`, `secret`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Profile` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `displayName` VARCHAR(64) NOT NULL,
  `bio` TEXT NULL,
  `avatar` VARCHAR(512) NULL,
  `banner` VARCHAR(512) NULL,
  `options` INT UNSIGNED NOT NULL DEFAULT 0,
  `badges` INT UNSIGNED NOT NULL DEFAULT 0,
  `accentColor` INT UNSIGNED NOT NULL DEFAULT 0,
  `uri` VARCHAR(64) NULL,
  `uriCooldownEnd` TIMESTAMP(0) NULL,
  `publishedAt` TIMESTAMP(0) NULL,
  `twitch` VARCHAR(48) NULL,
  `youtube` VARCHAR(48) NULL,
  `twitter` VARCHAR(48) NULL,
  `facebook` VARCHAR(64) NULL,
  `reddit` VARCHAR(48) NULL,
  `discord` VARCHAR(32) NULL,
  `defaultDonorName` VARCHAR(48) NOT NULL DEFAULT 'Anonymous',
  `defaultDonorAmount` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `defaultDonorAvatar` VARCHAR(512) NULL,
  `isDonorCanCustomAvatar` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `currency` SMALLINT UNSIGNED NULL,
  `minTipAmount` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `maxTipAmount` SMALLINT UNSIGNED NOT NULL DEFAULT 10000,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Profile_userId_key` (`userId`),
  UNIQUE KEY `Profile_uri_key` (`uri`),
  KEY `Profile_displayName_idx` (`displayName`),
  CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Widget` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('ALERTBOX', 'TIPJAR', 'GOALBAR') NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Widget_token_key` (`token`),
  KEY `Widget_userId_type_deletedAt_idx` (`userId`, `type`, `deletedAt`),
  CONSTRAINT `Widget_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AlertboxSetting` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `widgetId` BIGINT UNSIGNED NOT NULL,
  `globalVolume` TINYINT UNSIGNED DEFAULT 50,
  PRIMARY KEY (`id`),
  UNIQUE KEY `AlertboxSetting_widgetId_key` (`widgetId`),
  CONSTRAINT `AlertboxSetting_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AlertboxEvent` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alertboxId` BIGINT UNSIGNED NOT NULL,
  `eventType` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
  `isEnabled` TINYINT(1) NOT NULL DEFAULT 1,
  `prefix` VARCHAR(64) NULL,
  `subfix` VARCHAR(64) NULL,
  `messageLayout` SMALLINT UNSIGNED DEFAULT 0,
  `minVisibleDuration` SMALLINT UNSIGNED DEFAULT 3000,
  `animIn` SMALLINT UNSIGNED DEFAULT 0,
  `animOut` SMALLINT UNSIGNED DEFAULT 1,
  `animInDuration` SMALLINT UNSIGNED DEFAULT 1000,
  `animOutDuration` SMALLINT UNSIGNED DEFAULT 1000,
  `image` VARCHAR(512) NULL,
  `sound` VARCHAR(512) NULL,
  `soundVolume` TINYINT UNSIGNED DEFAULT 50,
  `fontFamily` TINYINT UNSIGNED DEFAULT 0,
  `fontSize` TINYINT UNSIGNED NOT NULL DEFAULT 20,
  `fontWeight` SMALLINT UNSIGNED NOT NULL DEFAULT 600,
  `textColor` INT UNSIGNED NOT NULL DEFAULT 16777215,
  `accentColor` INT UNSIGNED NOT NULL DEFAULT 6723532,
  `subfixColor` INT UNSIGNED NOT NULL DEFAULT 13369548,
  `donorColor` INT UNSIGNED NOT NULL DEFAULT 6723532,
  `amountColor` INT UNSIGNED NOT NULL DEFAULT 13369548,
  `textShadowColor` INT UNSIGNED NOT NULL DEFAULT 0,
  `textShadowSize` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `outlineColor` INT UNSIGNED NOT NULL DEFAULT 0,
  `outlineSize` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `ttsEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `ttsMinTip` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `ttsVoice` TINYINT UNSIGNED DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `AlertboxEvent_alertboxId_eventType_key` (`alertboxId`, `eventType`),
  CONSTRAINT `AlertboxEvent_alertboxId_fkey` FOREIGN KEY (`alertboxId`) REFERENCES `AlertboxSetting` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Integration` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `stripeSecret` VARCHAR(512) NULL,
  `stripeOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `bmacSecret` VARCHAR(512) NULL,
  `bmacOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `kofiSecret` VARCHAR(512) NULL,
  `kofiOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `xenditSecret` VARCHAR(512) NULL,
  `xenditOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `ffpSecret` VARCHAR(512) NULL,
  `ffpOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `streamlabsSecret` VARCHAR(2048) NULL,
  `streamlabsRefreshToken` VARCHAR(2048) NULL,
  `streamlabsOptions` INT UNSIGNED NOT NULL DEFAULT 0,
  `deletedAt` TIMESTAMP(0) NULL,
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  `bmacUsername` VARCHAR(64) NULL,
  `kofiUsername` VARCHAR(64) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Integration_userId_key` (`userId`),
  KEY `Integration_kofiSecret_deletedAt_idx` (`kofiSecret`, `deletedAt`),
  KEY `Integration_bmacSecret_deletedAt_idx` (`bmacSecret`, `deletedAt`),
  CONSTRAINT `Integration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Session` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `userSecret` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `method` VARCHAR(255) NOT NULL,
  `userAgent` TEXT NOT NULL,
  `os` VARCHAR(128) NULL,
  `osVersion` VARCHAR(128) NULL,
  `platform` VARCHAR(128) NULL,
  `platformType` VARCHAR(128) NULL,
  `platformMajor` VARCHAR(128) NULL,
  `platformVersion` VARCHAR(128) NULL,
  `deviceModel` VARCHAR(128) NULL,
  `deviceType` VARCHAR(128) NULL,
  `deviceVendor` VARCHAR(128) NULL,
  `cpuArchitecture` VARCHAR(128) NULL,
  `ipAddress` VARCHAR(50) NOT NULL,
  `ipVersion` TINYINT NULL,
  `isMobile` TINYINT(1) DEFAULT 0,
  `isProxy` TINYINT(1) DEFAULT 0,
  `isHosting` TINYINT(1) DEFAULT 0,
  `isAnonymous` TINYINT(1) DEFAULT 0,
  `isAnycast` TINYINT(1) DEFAULT 0,
  `isSatellite` TINYINT(1) DEFAULT 0,
  `isRelay` TINYINT(1) DEFAULT 0,
  `isTor` TINYINT(1) DEFAULT 0,
  `isVpn` TINYINT(1) DEFAULT 0,
  `isResProxy` TINYINT(1) DEFAULT 0,
  `timezone` VARCHAR(128) NULL,
  `country` VARCHAR(256) NULL,
  `countryCode` VARCHAR(2) NULL,
  `countryCodeIso3` VARCHAR(3) NULL,
  `continent` VARCHAR(256) NULL,
  `continentCode` VARCHAR(3) NULL,
  `postal` VARCHAR(32) NULL,
  `city` VARCHAR(512) NULL,
  `region` VARCHAR(512) NULL,
  `regionCode` VARCHAR(3) NULL,
  `latitude` DECIMAL(9,6) NULL,
  `longitude` DECIMAL(9,6) NULL,
  `isp` VARCHAR(512) NULL,
  `asn` VARCHAR(50) NULL,
  `expiresAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `disabledAt` TIMESTAMP(0) NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Session_token_key` (`token`),
  KEY `Session_userId_userSecret_idx` (`userId`, `userSecret`),
  KEY `Session_userId_disabledAt_expiresAt_idx` (`userId`, `disabledAt`, `expiresAt`),
  KEY `Session_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `Session_userId_userSecret_fkey` FOREIGN KEY (`userId`, `userSecret`) REFERENCES `User` (`id`, `secret`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SessionUsage` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sessionId` BIGINT UNSIGNED NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL,
  `ipAddress` VARCHAR(50) NOT NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  KEY `SessionUsage_userId_createdAt_idx` (`userId`, `createdAt`),
  KEY `SessionUsage_sessionId_id_idx` (`sessionId`, `id`),
  CONSTRAINT `SessionUsage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SessionUsage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ReservedUri` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `uri` VARCHAR(50) NOT NULL,
  `reservedByToken` VARCHAR(255) NOT NULL,
  `disabledAt` TIMESTAMP(0) NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ReservedUri_uri_key` (`uri`),
  KEY `ReservedUri_userId_deletedAt_createdAt_idx` (`userId`, `deletedAt`, `createdAt`),
  CONSTRAINT `ReservedUri_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WebhookLog` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(100) NOT NULL,
  `eventType` VARCHAR(50) NOT NULL,
  `rawPayload` LONGTEXT NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `processedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  KEY `WebhookLog_provider_processedAt_idx` (`provider`, `processedAt`),
  KEY `WebhookLog_processedAt_idx` (`processedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TransactionLog` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `providerTxId` VARCHAR(255) NULL,
  `type` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  `isTest` TINYINT(1) NOT NULL DEFAULT 0,
  `amount` INT UNSIGNED NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `senderName` VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
  `senderEmail` VARCHAR(256) NULL,
  `message` TEXT NULL,
  `rawPayload` LONGTEXT NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `TransactionLog_provider_providerTxId_key` (`provider`, `providerTxId`),
  KEY `TransactionLog_userId_createdAt_idx` (`userId`, `createdAt`),
  CONSTRAINT `TransactionLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WidgetTokenLog` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `widgetId` BIGINT UNSIGNED NOT NULL,
  `oldToken` VARCHAR(255) NOT NULL,
  `newToken` VARCHAR(255) NOT NULL,
  `ipAddress` VARCHAR(50) NOT NULL,
  `userAgent` TEXT NOT NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  KEY `WidgetTokenLog_widgetId_createdAt_idx` (`widgetId`, `createdAt`),
  CONSTRAINT `WidgetTokenLog_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `StreamlabsRelayLog` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `providerTxId` VARCHAR(255) NULL,
  `type` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  `amount` INT UNSIGNED NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `senderName` VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
  `senderEmail` VARCHAR(256) NULL,
  `message` TEXT NULL,
  `rawPayload` LONGTEXT NULL,
  `errorMessage` TEXT NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `StreamlabsRelayLog_provider_providerTxId_key` (`provider`, `providerTxId`),
  KEY `StreamlabsRelayLog_userId_createdAt_idx` (`userId`, `createdAt`),
  CONSTRAINT `StreamlabsRelayLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +goose Down
DROP TABLE IF EXISTS `StreamlabsRelayLog`;
DROP TABLE IF EXISTS `WidgetTokenLog`;
DROP TABLE IF EXISTS `TransactionLog`;
DROP TABLE IF EXISTS `WebhookLog`;
DROP TABLE IF EXISTS `ReservedUri`;
DROP TABLE IF EXISTS `SessionUsage`;
DROP TABLE IF EXISTS `Session`;
DROP TABLE IF EXISTS `Integration`;
DROP TABLE IF EXISTS `AlertboxEvent`;
DROP TABLE IF EXISTS `AlertboxSetting`;
DROP TABLE IF EXISTS `Widget`;
DROP TABLE IF EXISTS `Profile`;
DROP TABLE IF EXISTS `User`;
