-- +goose Up
-- ============================================================================
-- DEDICATED INTEGRATION TABLE WITH PROVIDER ENUM & TOGGLE
-- Target: MariaDB Galera (InnoDB, utf8mb4_unicode_ci)
-- Minimal indexing: (streamerId, type) UNIQUE, (orgId), (type, secret(255))
-- ============================================================================

CREATE TABLE IF NOT EXISTS `IntegrationNew` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orgId` BIGINT UNSIGNED NOT NULL,
  `streamerId` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('STRIPE', 'BUYMEACOFFEE', 'KOFI', 'XENDIT', 'FEELFREEPAY', 'STREAMLABS', 'DISCORD') NOT NULL,
  `username` VARCHAR(64) NULL DEFAULT NULL,
  `secret` VARCHAR(2048) NULL DEFAULT NULL,
  `refreshToken` VARCHAR(2048) NULL DEFAULT NULL,
  `options` INT UNSIGNED NOT NULL DEFAULT 0,
  `disabledAt` TIMESTAMP(0) NULL DEFAULT NULL,
  `deletedAt` TIMESTAMP(0) NULL DEFAULT NULL,
  `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Integration_streamerId_type_key` (`streamerId`, `type`),
  KEY `Integration_orgId_idx` (`orgId`),
  KEY `Integration_type_secret_idx` (`type`, `secret`(255)),
  CONSTRAINT `IntegrationNew_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `IntegrationNew_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

DROP PROCEDURE IF EXISTS `migrate_integration_to_dedicated`;

-- +goose StatementBegin
CREATE PROCEDURE `migrate_integration_to_dedicated`()
BEGIN
  DECLARE has_legacy_integration INT DEFAULT 0;
  DECLARE has_type_col INT DEFAULT 0;

  SELECT COUNT(*) INTO has_legacy_integration
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'Integration';

  IF has_legacy_integration > 0 THEN
    SELECT COUNT(*) INTO has_type_col
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Integration' AND column_name = 'type';

    IF has_type_col = 0 THEN
      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `secret`, `refreshToken`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'STREAMLABS', `streamlabsSecret`, `streamlabsRefreshToken`, `streamlabsOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `streamlabsSecret` IS NOT NULL;

      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `username`, `secret`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'KOFI', `kofiUsername`, `kofiSecret`, `kofiOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `kofiSecret` IS NOT NULL;

      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `username`, `secret`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'BUYMEACOFFEE', `bmacUsername`, `bmacSecret`, `bmacOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `bmacSecret` IS NOT NULL;

      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `secret`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'STRIPE', `stripeSecret`, `stripeOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `stripeSecret` IS NOT NULL;

      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `secret`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'XENDIT', `xenditSecret`, `xenditOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `xenditSecret` IS NOT NULL;

      INSERT IGNORE INTO `IntegrationNew` (`orgId`, `streamerId`, `type`, `secret`, `options`, `deletedAt`, `updatedAt`)
      SELECT `orgId`, `streamerId`, 'FEELFREEPAY', `ffpSecret`, `ffpOptions`, `deletedAt`, `updatedAt`
      FROM `Integration` WHERE `ffpSecret` IS NOT NULL;

      DROP TABLE IF EXISTS `Integration`;
    END IF;
  END IF;

  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'Integration') = 0 THEN
    RENAME TABLE `IntegrationNew` TO `Integration`;
  ELSE
    DROP TABLE IF EXISTS `IntegrationNew`;
  END IF;
END;
-- +goose StatementEnd

CALL `migrate_integration_to_dedicated`();
DROP PROCEDURE IF EXISTS `migrate_integration_to_dedicated`;

-- +goose Down
DROP PROCEDURE IF EXISTS `rollback_dedicated_to_legacy`;

-- +goose StatementBegin
CREATE PROCEDURE `rollback_dedicated_to_legacy`()
BEGIN
  DECLARE has_integration INT DEFAULT 0;
  DECLARE has_type_col INT DEFAULT 0;

  SELECT COUNT(*) INTO has_integration
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'Integration';

  IF has_integration > 0 THEN
    SELECT COUNT(*) INTO has_type_col
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'Integration' AND column_name = 'type';

    IF has_type_col > 0 THEN
      CREATE TABLE IF NOT EXISTS `IntegrationLegacy` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `orgId` BIGINT UNSIGNED NOT NULL,
        `streamerId` BIGINT UNSIGNED NOT NULL,
        `stripeSecret` VARCHAR(512) NULL DEFAULT NULL,
        `stripeOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `bmacSecret` VARCHAR(512) NULL DEFAULT NULL,
        `bmacOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `kofiSecret` VARCHAR(512) NULL DEFAULT NULL,
        `kofiOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `xenditSecret` VARCHAR(512) NULL DEFAULT NULL,
        `xenditOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `ffpSecret` VARCHAR(512) NULL DEFAULT NULL,
        `ffpOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `streamlabsSecret` VARCHAR(2048) NULL DEFAULT NULL,
        `streamlabsRefreshToken` VARCHAR(2048) NULL DEFAULT NULL,
        `streamlabsOptions` INT UNSIGNED NOT NULL DEFAULT 0,
        `bmacUsername` VARCHAR(64) NULL DEFAULT NULL,
        `kofiUsername` VARCHAR(64) NULL DEFAULT NULL,
        `deletedAt` TIMESTAMP(0) NULL DEFAULT NULL,
        `updatedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
        PRIMARY KEY (`id`),
        UNIQUE KEY `Integration_streamerId_key` (`streamerId`),
        KEY `Integration_orgId_deletedAt_idx` (`orgId`, `deletedAt`),
        KEY `Integration_kofiSecret_deletedAt_idx` (`kofiSecret`, `deletedAt`),
        KEY `Integration_bmacSecret_deletedAt_idx` (`bmacSecret`, `deletedAt`),
        CONSTRAINT `IntegrationLegacy_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Organization` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT `IntegrationLegacy_streamerId_fkey` FOREIGN KEY (`streamerId`) REFERENCES `Streamer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- Seed streamer rows from current Integration
      INSERT IGNORE INTO `IntegrationLegacy` (`orgId`, `streamerId`, `updatedAt`)
      SELECT DISTINCT `orgId`, `streamerId`, `updatedAt` FROM `Integration`;

      -- Fold Streamlabs
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'STREAMLABS'
      SET l.streamlabsSecret = i.secret, l.streamlabsRefreshToken = i.refreshToken, l.streamlabsOptions = i.options, l.deletedAt = i.deletedAt;

      -- Fold Ko-fi
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'KOFI'
      SET l.kofiUsername = i.username, l.kofiSecret = i.secret, l.kofiOptions = i.options, l.deletedAt = i.deletedAt;

      -- Fold BMAC
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'BUYMEACOFFEE'
      SET l.bmacUsername = i.username, l.bmacSecret = i.secret, l.bmacOptions = i.options, l.deletedAt = i.deletedAt;

      -- Fold Stripe
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'STRIPE'
      SET l.stripeSecret = i.secret, l.stripeOptions = i.options, l.deletedAt = i.deletedAt;

      -- Fold Xendit
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'XENDIT'
      SET l.xenditSecret = i.secret, l.xenditOptions = i.options, l.deletedAt = i.deletedAt;

      -- Fold FeelFreePay
      UPDATE `IntegrationLegacy` l
      JOIN `Integration` i ON l.streamerId = i.streamerId AND i.type = 'FEELFREEPAY'
      SET l.ffpSecret = i.secret, l.ffpOptions = i.options, l.deletedAt = i.deletedAt;

      DROP TABLE IF EXISTS `Integration`;
      RENAME TABLE `IntegrationLegacy` TO `Integration`;
    END IF;
  END IF;
END;
-- +goose StatementEnd

CALL `rollback_dedicated_to_legacy`();
DROP PROCEDURE IF EXISTS `rollback_dedicated_to_legacy`;
