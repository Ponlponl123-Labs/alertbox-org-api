-- Production GitOps Migration: CUID to BigInt with Embedded Safe Data Backfill
-- Executed automatically by ArgoCD via `prisma migrate deploy`

-- 1. Drop existing foreign keys (idempotent)
ALTER TABLE `AlertboxEvent` DROP FOREIGN KEY IF EXISTS `AlertboxEvent_alertboxId_fkey`;
ALTER TABLE `AlertboxSetting` DROP FOREIGN KEY IF EXISTS `AlertboxSetting_widgetId_fkey`;
ALTER TABLE `Integration` DROP FOREIGN KEY IF EXISTS `Integration_userId_fkey`;
ALTER TABLE `Profile` DROP FOREIGN KEY IF EXISTS `Profile_userId_fkey`;
ALTER TABLE `ReservedUri` DROP FOREIGN KEY IF EXISTS `ReservedUri_userId_fkey`;
ALTER TABLE `Session` DROP FOREIGN KEY IF EXISTS `Session_userId_userSecret_fkey`;
ALTER TABLE `SessionUsage` DROP FOREIGN KEY IF EXISTS `SessionUsage_sessionId_fkey`;
ALTER TABLE `SessionUsage` DROP FOREIGN KEY IF EXISTS `SessionUsage_userId_fkey`;
ALTER TABLE `StreamlabsRelayLog` DROP FOREIGN KEY IF EXISTS `StreamlabsRelayLog_userId_fkey`;
ALTER TABLE `TransactionLog` DROP FOREIGN KEY IF EXISTS `TransactionLog_userId_fkey`;
ALTER TABLE `Widget` DROP FOREIGN KEY IF EXISTS `Widget_userId_fkey`;
ALTER TABLE `WidgetTokenLog` DROP FOREIGN KEY IF EXISTS `WidgetTokenLog_widgetId_fkey`;

-- 1.1 Drop obsolete indexes referencing old columns (prevents Error 1072)
ALTER TABLE `User` DROP INDEX IF EXISTS `User_id_secret_key`;
ALTER TABLE `Profile` DROP INDEX IF EXISTS `Profile_userId_key`;
ALTER TABLE `Widget` DROP INDEX IF EXISTS `Widget_userId_idx`;
ALTER TABLE `AlertboxSetting` DROP INDEX IF EXISTS `AlertboxSetting_widgetId_key`;
ALTER TABLE `AlertboxEvent` DROP INDEX IF EXISTS `AlertboxEvent_alertboxId_eventType_key`;
ALTER TABLE `Integration` DROP INDEX IF EXISTS `Integration_userId_key`;
ALTER TABLE `Session` DROP INDEX IF EXISTS `Session_userId_userSecret_idx`;
ALTER TABLE `SessionUsage` DROP INDEX IF EXISTS `SessionUsage_userId_idx`;
ALTER TABLE `SessionUsage` DROP INDEX IF EXISTS `SessionUsage_sessionId_idx`;
ALTER TABLE `ReservedUri` DROP INDEX IF EXISTS `ReservedUri_userId_idx`;
ALTER TABLE `TransactionLog` DROP INDEX IF EXISTS `TransactionLog_userId_idx`;
ALTER TABLE `WidgetTokenLog` DROP INDEX IF EXISTS `WidgetTokenLog_widgetId_idx`;
ALTER TABLE `StreamlabsRelayLog` DROP INDEX IF EXISTS `StreamlabsRelayLog_userId_idx`;

-- 2. Add temporary BigInt columns for tables (idempotent)
ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE;

ALTER TABLE `Profile` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `Widget` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `AlertboxSetting` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_widgetId` BIGINT UNSIGNED NULL;

ALTER TABLE `AlertboxEvent` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_alertboxId` BIGINT UNSIGNED NULL;

ALTER TABLE `Integration` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `Session` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `SessionUsage` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_sessionId` BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `ReservedUri` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `WebhookLog` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE;

ALTER TABLE `TransactionLog` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

ALTER TABLE `WidgetTokenLog` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_widgetId` BIGINT UNSIGNED NULL;

ALTER TABLE `StreamlabsRelayLog` 
  ADD COLUMN IF NOT EXISTS `new_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD COLUMN IF NOT EXISTS `new_userId` BIGINT UNSIGNED NULL;

-- 3. Backfill all relational mappings in pure SQL
UPDATE `Profile` p JOIN `User` u ON p.userId = u.id SET p.new_userId = u.new_id WHERE p.new_userId IS NULL;
UPDATE `Widget` w JOIN `User` u ON w.userId = u.id SET w.new_userId = u.new_id WHERE w.new_userId IS NULL;
UPDATE `Integration` i JOIN `User` u ON i.userId = u.id SET i.new_userId = u.new_id WHERE i.new_userId IS NULL;
UPDATE `Session` s JOIN `User` u ON s.userId = u.id SET s.new_userId = u.new_id WHERE s.new_userId IS NULL;
UPDATE `ReservedUri` r JOIN `User` u ON r.userId = u.id SET r.new_userId = u.new_id WHERE r.new_userId IS NULL;
UPDATE `TransactionLog` t JOIN `User` u ON t.userId = u.id SET t.new_userId = u.new_id WHERE t.new_userId IS NULL;
UPDATE `StreamlabsRelayLog` sl JOIN `User` u ON sl.userId = u.id SET sl.new_userId = u.new_id WHERE sl.new_userId IS NULL;

UPDATE `AlertboxSetting` a JOIN `Widget` w ON a.widgetId = w.id SET a.new_widgetId = w.new_id WHERE a.new_widgetId IS NULL;
UPDATE `AlertboxEvent` ae JOIN `AlertboxSetting` a ON ae.alertboxId = a.id SET ae.new_alertboxId = a.new_id WHERE ae.new_alertboxId IS NULL;
UPDATE `WidgetTokenLog` wt JOIN `Widget` w ON wt.widgetId = w.id SET wt.new_widgetId = w.new_id WHERE wt.new_widgetId IS NULL;
UPDATE `SessionUsage` su JOIN `Session` s ON su.sessionId = s.id SET su.new_sessionId = s.new_id WHERE su.new_sessionId IS NULL;
UPDATE `SessionUsage` su JOIN `User` u ON su.userId = u.id SET su.new_userId = u.new_id WHERE su.new_userId IS NULL;

-- 4. Promote and swap User
ALTER TABLE `User`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- 5. Promote and swap Leaf & Relational tables
ALTER TABLE `Profile`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `Widget`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `AlertboxSetting`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `widgetId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_widgetId` `widgetId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `AlertboxEvent`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `alertboxId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_alertboxId` `alertboxId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `Integration`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `Session`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `SessionUsage`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `sessionId`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_sessionId` `sessionId` BIGINT UNSIGNED NOT NULL,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `ReservedUri`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `WebhookLog`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY;

ALTER TABLE `TransactionLog`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `WidgetTokenLog`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `widgetId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_widgetId` `widgetId` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `StreamlabsRelayLog`
  DROP INDEX IF EXISTS `new_id`,
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  DROP COLUMN IF EXISTS `userId`,
  CHANGE COLUMN `new_id` `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  CHANGE COLUMN `new_userId` `userId` BIGINT UNSIGNED NOT NULL;

-- 6. Add Unique Constraints & Indexes
CREATE UNIQUE INDEX `User_id_secret_key` ON `User`(`id`, `secret`);
CREATE UNIQUE INDEX `Profile_userId_key` ON `Profile`(`userId`);
CREATE UNIQUE INDEX `AlertboxSetting_widgetId_key` ON `AlertboxSetting`(`widgetId`);
CREATE UNIQUE INDEX `AlertboxEvent_alertboxId_eventType_key` ON `AlertboxEvent`(`alertboxId`, `eventType`);
CREATE UNIQUE INDEX `Integration_userId_key` ON `Integration`(`userId`);

CREATE INDEX `Widget_userId_type_deletedAt_idx` ON `Widget`(`userId`, `type`, `deletedAt`);
CREATE INDEX `WidgetTokenLog_widgetId_createdAt_idx` ON `WidgetTokenLog`(`widgetId`, `createdAt`);
CREATE INDEX `Session_userId_userSecret_idx` ON `Session`(`userId`, `userSecret`);
CREATE INDEX `Session_userId_disabledAt_expiresAt_idx` ON `Session`(`userId`, `disabledAt`, `expiresAt`);
CREATE INDEX `SessionUsage_userId_createdAt_idx` ON `SessionUsage`(`userId`, `createdAt`);
CREATE INDEX `SessionUsage_sessionId_id_idx` ON `SessionUsage`(`sessionId`, `id`);
CREATE INDEX `ReservedUri_userId_deletedAt_createdAt_idx` ON `ReservedUri`(`userId`, `deletedAt`, `createdAt`);
CREATE INDEX `TransactionLog_userId_createdAt_idx` ON `TransactionLog`(`userId`, `createdAt`);
CREATE INDEX `StreamlabsRelayLog_userId_createdAt_idx` ON `StreamlabsRelayLog`(`userId`, `createdAt`);

-- 7. Bind Foreign Key Constraints
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Widget` ADD CONSTRAINT `Widget_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AlertboxSetting` ADD CONSTRAINT `AlertboxSetting_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AlertboxEvent` ADD CONSTRAINT `AlertboxEvent_alertboxId_fkey` FOREIGN KEY (`alertboxId`) REFERENCES `AlertboxSetting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_userSecret_fkey` FOREIGN KEY (`userId`, `userSecret`) REFERENCES `User`(`id`, `secret`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SessionUsage` ADD CONSTRAINT `SessionUsage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SessionUsage` ADD CONSTRAINT `SessionUsage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ReservedUri` ADD CONSTRAINT `ReservedUri_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TransactionLog` ADD CONSTRAINT `TransactionLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WidgetTokenLog` ADD CONSTRAINT `WidgetTokenLog_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StreamlabsRelayLog` ADD CONSTRAINT `StreamlabsRelayLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
