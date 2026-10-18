-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
DROP INDEX IF EXISTS `Organization_ownerId_idx` ON `Organization`;
DROP INDEX IF EXISTS `Organization_deletedAt_idx` ON `Organization`;
DROP INDEX IF EXISTS `OrganizationMember_isDeleted_idx` ON `OrganizationMember`;

CREATE INDEX IF NOT EXISTS `Organization_ownerId_deletedAt_idx` ON `Organization`(`ownerId`, `deletedAt`);
CREATE INDEX IF NOT EXISTS `OrganizationAuditLog_orgId_targetType_targetId_createdAt_idx` ON `OrganizationAuditLog`(`orgId`, `targetType`, `targetId`, `createdAt`);

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
DROP INDEX IF EXISTS `OrganizationAuditLog_orgId_targetType_targetId_createdAt_idx` ON `OrganizationAuditLog`;
DROP INDEX IF EXISTS `Organization_ownerId_deletedAt_idx` ON `Organization`;

CREATE INDEX IF NOT EXISTS `Organization_ownerId_idx` ON `Organization`(`ownerId`);
CREATE INDEX IF NOT EXISTS `Organization_deletedAt_idx` ON `Organization`(`deletedAt`);
