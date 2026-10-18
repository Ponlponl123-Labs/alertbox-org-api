-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Purpose: Replace secondary indexes with covering indexes to eliminate
-- clustered PK lookups and achieve single-digit logical reads.

-- TransactionLog: Cover (orgId, createdAt) activity queries with status + isTest
-- Enables `Using index` for activity heatmap queries (Q14)
CREATE INDEX IF NOT EXISTS `TransactionLog_orgId_activity_cover_idx`
  ON `TransactionLog`(`orgId`, `createdAt`, `status`, `isTest`);

-- OrganizationAuditLog: Cover byOrg queries with all non-LOB projection columns
-- Enables `Using index` for org audit list (Q29) and COUNT (Q28)
-- Replaces the non-covering (orgId, createdAt) pair as the optimizer's preferred path
CREATE INDEX IF NOT EXISTS `OrganizationAuditLog_orgId_cover_idx`
  ON `OrganizationAuditLog`(`orgId`, `createdAt`, `userId`, `action`, `targetType`, `targetId`, `ipAddress`);

-- OrganizationAuditLog: Cover byStreamer queries with all non-LOB projection columns
-- Enables `Using index` for filtered audit list by target (Q30)
-- Replaces the non-covering (orgId, targetType, targetId, createdAt) as the optimizer's preferred path
CREATE INDEX IF NOT EXISTS `OrganizationAuditLog_streamer_cover_idx`
  ON `OrganizationAuditLog`(`orgId`, `targetType`, `targetId`, `createdAt`, `userId`, `action`, `ipAddress`);

-- Drop the old non-covering indexes that are now fully subsumed
DROP INDEX IF EXISTS `OrganizationAuditLog_orgId_targetType_targetId_createdAt_idx` ON `OrganizationAuditLog`;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
DROP INDEX IF EXISTS `TransactionLog_orgId_activity_cover_idx` ON `TransactionLog`;
DROP INDEX IF EXISTS `OrganizationAuditLog_orgId_cover_idx` ON `OrganizationAuditLog`;
DROP INDEX IF EXISTS `OrganizationAuditLog_streamer_cover_idx` ON `OrganizationAuditLog`;

-- Restore the old non-covering composite index
CREATE INDEX IF NOT EXISTS `OrganizationAuditLog_orgId_targetType_targetId_createdAt_idx`
  ON `OrganizationAuditLog`(`orgId`, `targetType`, `targetId`, `createdAt`);
