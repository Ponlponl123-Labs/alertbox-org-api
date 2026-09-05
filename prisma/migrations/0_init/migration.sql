-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(256) NOT NULL,
    `createWith` VARCHAR(50) NOT NULL,
    `secret` VARCHAR(255) NOT NULL,
    `disabledAt` TIMESTAMP(0) NULL,
    `deletedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_secret_key`(`secret`),
    INDEX `User_email_idx`(`email`),
    UNIQUE INDEX `User_id_secret_key`(`id`, `secret`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Profile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `displayName` VARCHAR(64) NOT NULL,
    `bio` TEXT NULL,
    `avatar` VARCHAR(512) NULL,
    `banner` VARCHAR(512) NULL,
    `options` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `badges` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `accentColor` INTEGER UNSIGNED NOT NULL DEFAULT 0,
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
    `updatedAt` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `Profile_userId_key`(`userId`),
    UNIQUE INDEX `Profile_uri_key`(`uri`),
    INDEX `Profile_displayName_idx`(`displayName`),
    INDEX `Profile_uri_idx`(`uri`),
    FULLTEXT INDEX `Profile_bio_idx`(`bio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Widget` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ALERTBOX', 'TIPJAR', 'GOALBAR') NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `deletedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `Widget_token_key`(`token`),
    INDEX `Widget_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertboxSetting` (
    `id` VARCHAR(191) NOT NULL,
    `widgetId` VARCHAR(191) NOT NULL,
    `globalVolume` FLOAT NOT NULL DEFAULT 0.5,

    UNIQUE INDEX `AlertboxSetting_widgetId_key`(`widgetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertboxEvent` (
    `id` VARCHAR(191) NOT NULL,
    `alertboxId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `prefix` VARCHAR(64) NULL,
    `subfix` VARCHAR(64) NULL,
    `messageLayout` VARCHAR(32) NULL DEFAULT 'image-above',
    `minVisibleDuration` FLOAT NOT NULL DEFAULT 3,
    `animIn` VARCHAR(64) NULL DEFAULT 'fade_in_up',
    `animOut` VARCHAR(64) NULL DEFAULT 'fade_out_up',
    `animInDuration` FLOAT NOT NULL DEFAULT 1,
    `animOutDuration` FLOAT NOT NULL DEFAULT 1,
    `image` VARCHAR(512) NULL,
    `sound` VARCHAR(512) NULL,
    `soundVolume` FLOAT NOT NULL DEFAULT 0.5,
    `fontFamily` VARCHAR(64) NULL DEFAULT 'Open Sans',
    `fontSize` TINYINT UNSIGNED NOT NULL DEFAULT 32,
    `fontWeight` SMALLINT UNSIGNED NOT NULL DEFAULT 600,
    `textColor` INTEGER UNSIGNED NOT NULL DEFAULT 16777215,
    `accentColor` INTEGER UNSIGNED NOT NULL DEFAULT 6723532,
    `subfixColor` INTEGER UNSIGNED NOT NULL DEFAULT 13369548,
    `donorColor` INTEGER UNSIGNED NOT NULL DEFAULT 6723532,
    `amountColor` INTEGER UNSIGNED NOT NULL DEFAULT 13369548,
    `textShadowColor` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `textShadowSize` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `outlineColor` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `outlineSize` TINYINT UNSIGNED NOT NULL DEFAULT 3,
    `ttsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `ttsMinTip` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `ttsVoice` VARCHAR(64) NULL,
    `ttsVolume` FLOAT NOT NULL DEFAULT 0.5,
    `ttsSpeed` FLOAT NOT NULL DEFAULT 0.5,
    `ttsPitch` FLOAT NOT NULL DEFAULT 0.5,
    `ttsDelay` FLOAT NOT NULL DEFAULT 0,
    `ttsOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updatedAt` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `AlertboxEvent_alertboxId_eventType_key`(`alertboxId`, `eventType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Integration` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stripeSecret` VARCHAR(512) NULL,
    `stripeOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `bmacSecret` VARCHAR(512) NULL,
    `bmacOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `kofiSecret` VARCHAR(512) NULL,
    `kofiOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `xenditSecret` VARCHAR(512) NULL,
    `xenditOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `ffpSecret` VARCHAR(512) NULL,
    `ffpOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `streamlabsSecret` VARCHAR(2048) NULL,
    `streamlabsRefreshToken` VARCHAR(2048) NULL,
    `streamlabsOptions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `deletedAt` TIMESTAMP(0) NULL,
    `updatedAt` TIMESTAMP(0) NOT NULL,
    `bmacUsername` VARCHAR(64) NULL,
    `kofiUsername` VARCHAR(64) NULL,

    UNIQUE INDEX `Integration_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userSecret` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `method` VARCHAR(255) NOT NULL,
    `userAgent` LONGTEXT NOT NULL,
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
    `country` VARCHAR(64) NULL,
    `countryCode` VARCHAR(2) NULL,
    `countryCodeIso3` VARCHAR(3) NULL,
    `continentCode` VARCHAR(3) NULL,
    `postal` VARCHAR(32) NULL,
    `city` VARCHAR(512) NULL,
    `region` VARCHAR(512) NULL,
    `regionCode` VARCHAR(3) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `isp` VARCHAR(512) NULL,
    `asn` VARCHAR(50) NULL,
    `expiresAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `disabledAt` TIMESTAMP(0) NULL,
    `deletedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Session_token_key`(`token`),
    INDEX `Session_userId_userSecret_idx`(`userId`, `userSecret`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SessionUsage` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(50) NOT NULL,
    `deletedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `SessionUsage_userId_idx`(`userId`),
    INDEX `SessionUsage_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReservedUri` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `uri` VARCHAR(50) NOT NULL,
    `reservedByToken` VARCHAR(255) NOT NULL,
    `disabledAt` TIMESTAMP(0) NULL,
    `deletedAt` TIMESTAMP(0) NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `ReservedUri_uri_key`(`uri`),
    INDEX `ReservedUri_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransactionLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `providerTxId` VARCHAR(255) NULL,
    `type` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `isTest` BOOLEAN NOT NULL DEFAULT false,
    `amount` INTEGER UNSIGNED NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `senderName` VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
    `senderEmail` VARCHAR(256) NULL,
    `message` TEXT NULL,
    `rawPayload` LONGTEXT NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` TIMESTAMP(0) NOT NULL,

    INDEX `TransactionLog_userId_idx`(`userId`),
    INDEX `TransactionLog_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `TransactionLog_provider_providerTxId_key`(`provider`, `providerTxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WidgetTokenLog` (
    `id` VARCHAR(191) NOT NULL,
    `widgetId` VARCHAR(191) NOT NULL,
    `oldToken` VARCHAR(255) NOT NULL,
    `newToken` VARCHAR(255) NOT NULL,
    `ipAddress` VARCHAR(50) NOT NULL,
    `userAgent` LONGTEXT NOT NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `WidgetTokenLog_widgetId_idx`(`widgetId`),
    INDEX `WidgetTokenLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StreamlabsRelayLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `providerTxId` VARCHAR(255) NULL,
    `type` ENUM('TIP', 'MEMBERSHIP', 'MERCH', 'FOLLOW') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `amount` INTEGER UNSIGNED NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `senderName` VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
    `senderEmail` VARCHAR(256) NULL,
    `message` TEXT NULL,
    `errorMessage` TEXT NULL,
    `createdAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` TIMESTAMP(0) NOT NULL,

    INDEX `StreamlabsRelayLog_userId_idx`(`userId`),
    INDEX `StreamlabsRelayLog_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `StreamlabsRelayLog_provider_providerTxId_key`(`provider`, `providerTxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Widget` ADD CONSTRAINT `Widget_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertboxSetting` ADD CONSTRAINT `AlertboxSetting_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertboxEvent` ADD CONSTRAINT `AlertboxEvent_alertboxId_fkey` FOREIGN KEY (`alertboxId`) REFERENCES `AlertboxSetting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_userSecret_fkey` FOREIGN KEY (`userId`, `userSecret`) REFERENCES `User`(`id`, `secret`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionUsage` ADD CONSTRAINT `SessionUsage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionUsage` ADD CONSTRAINT `SessionUsage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservedUri` ADD CONSTRAINT `ReservedUri_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransactionLog` ADD CONSTRAINT `TransactionLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WidgetTokenLog` ADD CONSTRAINT `WidgetTokenLog_widgetId_fkey` FOREIGN KEY (`widgetId`) REFERENCES `Widget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamlabsRelayLog` ADD CONSTRAINT `StreamlabsRelayLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
