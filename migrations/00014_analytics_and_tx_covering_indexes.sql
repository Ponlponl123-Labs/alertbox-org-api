-- +goose Up
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Purpose: Add covering indexes for single-scan analytics aggregation and keyset pagination.

CREATE INDEX IF NOT EXISTS `TransactionLog_orgId_analytics_cover_idx`
  ON `TransactionLog`(`orgId`, `createdAt`, `status`, `isDeleted`, `isTest`, `streamerId`, `provider`, `currency`, `amount`);

CREATE INDEX IF NOT EXISTS `TransactionLog_streamer_keyset_idx`
  ON `TransactionLog`(`orgId`, `streamerId`, `createdAt`, `id`, `provider`, `type`, `status`, `isTest`, `amount`, `currency`, `isDeleted`);

-- +goose Down
DROP INDEX IF EXISTS `TransactionLog_orgId_analytics_cover_idx` ON `TransactionLog`;
DROP INDEX IF EXISTS `TransactionLog_streamer_keyset_idx` ON `TransactionLog`;
