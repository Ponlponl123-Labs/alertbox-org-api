-- Drop redundant indexes to ensure single-digit logical reads on mutations
DROP INDEX IF EXISTS `Organization_ownerId_idx` ON `Organization`;
DROP INDEX IF EXISTS `Organization_deletedAt_idx` ON `Organization`;
DROP INDEX IF EXISTS `OrganizationMember_isDeleted_idx` ON `OrganizationMember`;
