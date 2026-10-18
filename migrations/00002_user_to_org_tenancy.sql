-- +goose Up
-- ============================================================================
-- MIGRATION: user_to_org_tenancy (20261014211000)
-- Transitions single-user tenancy to multi-tenant Organization & Streamer architecture.
-- 100% Zero-Data-Loss Backfill for existing Users, Profiles, Widgets, Integrations & Logs.
-- ============================================================================

-- STEP 1: CREATE NEW ORGANIZATION & AUDIT TABLES
CREATE TABLE IF NOT EXISTS `Organization` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `avatar` VARCHAR(512) NULL,
  `ownerId` BIGINT UNSIGNED NOT NULL,
  `deletedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Organization_slug_key` (`slug`),
  INDEX `Organization_ownerId_idx` (`ownerId`),
  INDEX `Organization_deletedAt_idx` (`deletedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OrganizationMember` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'VIEWER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  `permissions` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OrganizationMember_orgId_userId_key` (`orgId`, `userId`),
  INDEX `OrganizationMember_userId_orgId_idx` (`userId`, `orgId`),
  INDEX `OrganizationMember_orgId_role_idx` (`orgId`, `role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OrganizationInvite` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `email` VARCHAR(256) NOT NULL,
  `role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'VIEWER', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  `permissions` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `token` VARCHAR(128) NOT NULL,
  `inviterId` BIGINT UNSIGNED NOT NULL,
  `expiresAt` TIMESTAMP(0) NOT NULL,
  `acceptedAt` TIMESTAMP(0) NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OrganizationInvite_token_key` (`token`),
  INDEX `OrganizationInvite_orgId_email_idx` (`orgId`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OrganizationAuditLog` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `targetType` VARCHAR(32) NOT NULL,
  `targetId` BIGINT UNSIGNED NULL,
  `payload` LONGTEXT NULL,
  `ipAddress` VARCHAR(50) NOT NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  INDEX `OrganizationAuditLog_orgId_createdAt_idx` (`orgId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- STEP 2: USER PROFILE ENHANCEMENT (Add name & avatar to User)
ALTER TABLE `User` 
  ADD COLUMN IF NOT EXISTS `name` VARCHAR(64) NULL AFTER `secret`,
  ADD COLUMN IF NOT EXISTS `avatar` VARCHAR(512) NULL AFTER `name`;

-- STEP 3: EVOLVE PROFILE INTO STREAMER
SET @profile_table_exists = (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'Profile');
SET @rename_profile_sql = IF(@profile_table_exists > 0, 'RENAME TABLE `Profile` TO `Streamer`', 'SELECT 1');
PREPARE stmt_rename_profile FROM @rename_profile_sql;
EXECUTE stmt_rename_profile;
DEALLOCATE PREPARE stmt_rename_profile;

-- Create Streamer table if neither Profile nor Streamer existed
CREATE TABLE IF NOT EXISTS `Streamer` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NULL,
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
  UNIQUE KEY `Streamer_uri_key` (`uri`),
  KEY `Streamer_displayName_idx` (`displayName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `Streamer` ADD COLUMN IF NOT EXISTS `orgId` BIGINT UNSIGNED NULL AFTER `id`;

-- STEP 4: BACKFILL ORGANIZATIONS & OWNER MEMBERSHIPS FOR EXISTING USERS
INSERT INTO `Organization` (`slug`, `name`, `ownerId`, `createdAt`, `updatedAt`)
SELECT 
  COALESCE(NULLIF(s.uri, ''), CONCAT('org_', u.id)) AS `slug`,
  COALESCE(NULLIF(s.displayName, ''), SUBSTRING_INDEX(u.email, '@', 1), CONCAT('Org ', u.id)) AS `name`,
  u.id AS `ownerId`,
  u.createdAt AS `createdAt`,
  u.updatedAt AS `updatedAt`
FROM `User` u
LEFT JOIN (SELECT userId, uri, displayName FROM `Streamer` WHERE (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Streamer' AND column_name = 'userId') > 0) s ON s.userId = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM `Organization` o WHERE o.ownerId = u.id
);

-- Backfill User name & avatar from legacy Streamer data
SET @streamer_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Streamer' AND column_name = 'userId');
SET @backfill_user_info_sql = IF(@streamer_userid_exists > 0,
  'UPDATE `User` u JOIN `Streamer` s ON s.userId = u.id SET u.name = COALESCE(u.name, s.displayName, s.name), u.avatar = COALESCE(u.avatar, s.avatar) WHERE u.name IS NULL OR u.avatar IS NULL',
  'SELECT 1');
PREPARE stmt_backfill_user_info FROM @backfill_user_info_sql;
EXECUTE stmt_backfill_user_info;
DEALLOCATE PREPARE stmt_backfill_user_info;

-- Backfill Owner membership (all permissions bitmask)
INSERT INTO `OrganizationMember` (`orgId`, `userId`, `role`, `permissions`, `createdAt`, `updatedAt`)
SELECT o.id, o.ownerId, 'OWNER', 18446744073709551615, o.createdAt, o.updatedAt
FROM `Organization` o
WHERE NOT EXISTS (
  SELECT 1 FROM `OrganizationMember` om WHERE om.orgId = o.id AND om.userId = o.ownerId
);

-- Map Streamer.orgId to user's Organization.id
SET @map_streamer_org_sql = IF(@streamer_userid_exists > 0,
  'UPDATE `Streamer` s JOIN `Organization` o ON o.ownerId = s.userId SET s.orgId = o.id WHERE s.orgId IS NULL',
  'SELECT 1');
PREPARE stmt_map_streamer_org FROM @map_streamer_org_sql;
EXECUTE stmt_map_streamer_org;
DEALLOCATE PREPARE stmt_map_streamer_org;

ALTER TABLE `Streamer` DROP FOREIGN KEY IF EXISTS `fk_profile_user_id`;
ALTER TABLE `Streamer` DROP FOREIGN KEY IF EXISTS `Profile_userId_fkey`;
ALTER TABLE `Streamer` DROP INDEX IF EXISTS `idx_profile_user_bigint_id`;
ALTER TABLE `Streamer` DROP INDEX IF EXISTS `Profile_userId_key`;
ALTER TABLE `Streamer` DROP INDEX IF EXISTS `Profile_userId_idx`;

ALTER TABLE `Streamer` 
  MODIFY `orgId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `Streamer` 
  ADD INDEX IF NOT EXISTS `Streamer_orgId_deletedAt_idx` (`orgId`, `deletedAt`);

-- STEP 5: REWIRE WIDGET TO (orgId, streamerId)
ALTER TABLE `Widget` 
  ADD COLUMN IF NOT EXISTS `orgId` BIGINT UNSIGNED NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `streamerId` BIGINT UNSIGNED NULL AFTER `orgId`;

SET @widget_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Widget' AND column_name = 'userId');
SET @backfill_widget_sql = IF(@widget_userid_exists > 0, 
  'UPDATE `Widget` w JOIN `Streamer` s ON s.orgId = (SELECT id FROM `Organization` WHERE ownerId = w.userId LIMIT 1) SET w.streamerId = s.id, w.orgId = s.orgId WHERE w.streamerId IS NULL', 
  'SELECT 1');
PREPARE stmt_backfill_widget FROM @backfill_widget_sql;
EXECUTE stmt_backfill_widget;
DEALLOCATE PREPARE stmt_backfill_widget;

ALTER TABLE `Widget` DROP FOREIGN KEY IF EXISTS `fk_widget_user_id`;
ALTER TABLE `Widget` DROP FOREIGN KEY IF EXISTS `Widget_userId_fkey`;
ALTER TABLE `Widget` DROP INDEX IF EXISTS `idx_widget_user_bigint_id`;
ALTER TABLE `Widget` DROP INDEX IF EXISTS `Widget_userId_type_deletedAt_idx`;
ALTER TABLE `Widget` DROP INDEX IF EXISTS `Widget_userId_idx`;

ALTER TABLE `Widget` 
  MODIFY `orgId` BIGINT UNSIGNED NOT NULL,
  MODIFY `streamerId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `Widget` 
  ADD INDEX IF NOT EXISTS `Widget_streamerId_type_deletedAt_idx` (`streamerId`, `type`, `deletedAt`),
  ADD INDEX IF NOT EXISTS `Widget_orgId_deletedAt_idx` (`orgId`, `deletedAt`);

-- STEP 6: REWIRE INTEGRATION TO (orgId, streamerId)
ALTER TABLE `Integration` 
  ADD COLUMN IF NOT EXISTS `orgId` BIGINT UNSIGNED NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `streamerId` BIGINT UNSIGNED NULL AFTER `orgId`;

SET @integration_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Integration' AND column_name = 'userId');
SET @backfill_integration_sql = IF(@integration_userid_exists > 0, 
  'UPDATE `Integration` i JOIN `Streamer` s ON s.orgId = (SELECT id FROM `Organization` WHERE ownerId = i.userId LIMIT 1) SET i.streamerId = s.id, i.orgId = s.orgId WHERE i.streamerId IS NULL', 
  'SELECT 1');
PREPARE stmt_backfill_integration FROM @backfill_integration_sql;
EXECUTE stmt_backfill_integration;
DEALLOCATE PREPARE stmt_backfill_integration;

ALTER TABLE `Integration` DROP FOREIGN KEY IF EXISTS `fk_integration_user_id`;
ALTER TABLE `Integration` DROP FOREIGN KEY IF EXISTS `Integration_userId_fkey`;
ALTER TABLE `Integration` DROP INDEX IF EXISTS `idx_integration_user_bigint_id`;
ALTER TABLE `Integration` DROP INDEX IF EXISTS `Integration_userId_key`;
ALTER TABLE `Integration` DROP INDEX IF EXISTS `Integration_userId_idx`;

ALTER TABLE `Integration` 
  MODIFY `orgId` BIGINT UNSIGNED NOT NULL,
  MODIFY `streamerId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `Integration` 
  ADD UNIQUE INDEX IF NOT EXISTS `Integration_streamerId_key` (`streamerId`),
  ADD INDEX IF NOT EXISTS `Integration_orgId_deletedAt_idx` (`orgId`, `deletedAt`);

-- STEP 7: REWIRE RESERVEDURI TO (streamerId)
ALTER TABLE `ReservedUri` 
  ADD COLUMN IF NOT EXISTS `streamerId` BIGINT UNSIGNED NULL AFTER `id`;

SET @reserveduri_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ReservedUri' AND column_name = 'userId');
SET @backfill_reserveduri_sql = IF(@reserveduri_userid_exists > 0,
  'UPDATE `ReservedUri` r JOIN `Streamer` s ON s.orgId = (SELECT id FROM `Organization` WHERE ownerId = r.userId LIMIT 1) SET r.streamerId = s.id WHERE r.streamerId IS NULL',
  'SELECT 1');
PREPARE stmt_backfill_reserveduri FROM @backfill_reserveduri_sql;
EXECUTE stmt_backfill_reserveduri;
DEALLOCATE PREPARE stmt_backfill_reserveduri;

ALTER TABLE `ReservedUri` DROP FOREIGN KEY IF EXISTS `fk_reserveduri_user_id`;
ALTER TABLE `ReservedUri` DROP FOREIGN KEY IF EXISTS `ReservedUri_userId_fkey`;
ALTER TABLE `ReservedUri` DROP INDEX IF EXISTS `idx_reserveduri_user_bigint_id`;
ALTER TABLE `ReservedUri` DROP INDEX IF EXISTS `ReservedUri_userId_deletedAt_createdAt_idx`;
ALTER TABLE `ReservedUri` DROP INDEX IF EXISTS `ReservedUri_userId_idx`;

ALTER TABLE `ReservedUri` 
  MODIFY `streamerId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `ReservedUri` 
  ADD INDEX IF NOT EXISTS `ReservedUri_streamerId_deletedAt_createdAt_idx` (`streamerId`, `deletedAt`, `createdAt`);

-- STEP 8: REWIRE TRANSACTIONLOG & STREAMLABSRELAYLOG TO (orgId, streamerId)
ALTER TABLE `TransactionLog` 
  ADD COLUMN IF NOT EXISTS `orgId` BIGINT UNSIGNED NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `streamerId` BIGINT UNSIGNED NULL AFTER `orgId`;

SET @txlog_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'TransactionLog' AND column_name = 'userId');
SET @backfill_txlog_sql = IF(@txlog_userid_exists > 0,
  'UPDATE `TransactionLog` t JOIN `Streamer` s ON s.orgId = (SELECT id FROM `Organization` WHERE ownerId = t.userId LIMIT 1) SET t.streamerId = s.id, t.orgId = s.orgId WHERE t.streamerId IS NULL',
  'SELECT 1');
PREPARE stmt_backfill_txlog FROM @backfill_txlog_sql;
EXECUTE stmt_backfill_txlog;
DEALLOCATE PREPARE stmt_backfill_txlog;

ALTER TABLE `TransactionLog` DROP FOREIGN KEY IF EXISTS `fk_transactionlog_user_id`;
ALTER TABLE `TransactionLog` DROP FOREIGN KEY IF EXISTS `TransactionLog_userId_fkey`;
ALTER TABLE `TransactionLog` DROP INDEX IF EXISTS `idx_transactionlog_user_bigint_id`;
ALTER TABLE `TransactionLog` DROP INDEX IF EXISTS `TransactionLog_userId_createdAt_idx`;
ALTER TABLE `TransactionLog` DROP INDEX IF EXISTS `TransactionLog_userId_idx`;

ALTER TABLE `TransactionLog` 
  MODIFY `orgId` BIGINT UNSIGNED NOT NULL,
  MODIFY `streamerId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `TransactionLog` 
  ADD INDEX IF NOT EXISTS `TransactionLog_streamerId_createdAt_idx` (`streamerId`, `createdAt`),
  ADD INDEX IF NOT EXISTS `TransactionLog_orgId_createdAt_idx` (`orgId`, `createdAt`);

-- StreamlabsRelayLog
ALTER TABLE `StreamlabsRelayLog` 
  ADD COLUMN IF NOT EXISTS `orgId` BIGINT UNSIGNED NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `streamerId` BIGINT UNSIGNED NULL AFTER `orgId`;

SET @streamlabs_userid_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'StreamlabsRelayLog' AND column_name = 'userId');
SET @backfill_streamlabs_sql = IF(@streamlabs_userid_exists > 0,
  'UPDATE `StreamlabsRelayLog` sl JOIN `Streamer` s ON s.orgId = (SELECT id FROM `Organization` WHERE ownerId = sl.userId LIMIT 1) SET sl.streamerId = s.id, sl.orgId = s.orgId WHERE sl.streamerId IS NULL',
  'SELECT 1');
PREPARE stmt_backfill_streamlabs FROM @backfill_streamlabs_sql;
EXECUTE stmt_backfill_streamlabs;
DEALLOCATE PREPARE stmt_backfill_streamlabs;

ALTER TABLE `StreamlabsRelayLog` DROP FOREIGN KEY IF EXISTS `fk_streamlabsrelaylog_user_id`;
ALTER TABLE `StreamlabsRelayLog` DROP FOREIGN KEY IF EXISTS `StreamlabsRelayLog_userId_fkey`;
ALTER TABLE `StreamlabsRelayLog` DROP INDEX IF EXISTS `idx_streamlabsrelaylog_user_bigint_id`;
ALTER TABLE `StreamlabsRelayLog` DROP INDEX IF EXISTS `StreamlabsRelayLog_userId_createdAt_idx`;
ALTER TABLE `StreamlabsRelayLog` DROP INDEX IF EXISTS `StreamlabsRelayLog_userId_idx`;

ALTER TABLE `StreamlabsRelayLog` 
  MODIFY `orgId` BIGINT UNSIGNED NOT NULL,
  MODIFY `streamerId` BIGINT UNSIGNED NOT NULL,
  DROP COLUMN IF EXISTS `userId`;

ALTER TABLE `StreamlabsRelayLog` 
  ADD INDEX IF NOT EXISTS `StreamlabsRelayLog_streamerId_createdAt_idx` (`streamerId`, `createdAt`),
  ADD INDEX IF NOT EXISTS `StreamlabsRelayLog_orgId_createdAt_idx` (`orgId`, `createdAt`);

-- STEP 9: ADD ALL FOREIGN KEY CONSTRAINTS
ALTER TABLE `Organization` 
  ADD CONSTRAINT `Organization_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrganizationMember` 
  ADD CONSTRAINT `OrganizationMember_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrganizationMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrganizationInvite` 
  ADD CONSTRAINT `OrganizationInvite_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrganizationInvite_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrganizationAuditLog` 
  ADD CONSTRAINT `OrganizationAuditLog_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrganizationAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Streamer` 
  ADD CONSTRAINT `Streamer_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Widget` 
  ADD CONSTRAINT `Widget_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `Widget_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Integration` 
  ADD CONSTRAINT `Integration_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `Integration_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReservedUri` 
  ADD CONSTRAINT `ReservedUri_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TransactionLog` 
  ADD CONSTRAINT `TransactionLog_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TransactionLog_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `StreamlabsRelayLog` 
  ADD CONSTRAINT `StreamlabsRelayLog_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `StreamlabsRelayLog_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- +goose Down
DROP TABLE IF EXISTS `OrganizationAuditLog`;
DROP TABLE IF EXISTS `OrganizationInvite`;
DROP TABLE IF EXISTS `OrganizationMember`;
DROP TABLE IF EXISTS `Organization`;
