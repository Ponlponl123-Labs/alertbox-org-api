-- CreateTable
CREATE TABLE `WebhookLog` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(100) NOT NULL,
    `eventType` VARCHAR(50) NOT NULL,
    `rawPayload` LONGTEXT NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `processedAt` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
