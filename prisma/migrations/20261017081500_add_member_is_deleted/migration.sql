-- AlterTable OrganizationMember
ALTER TABLE `OrganizationMember` ADD COLUMN `isDeleted` DATETIME(0) NULL AFTER `permissions`;

-- CreateIndex
CREATE INDEX `OrganizationMember_isDeleted_idx` ON `OrganizationMember`(`isDeleted`);
