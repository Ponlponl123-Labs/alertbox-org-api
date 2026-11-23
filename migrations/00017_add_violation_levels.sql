-- +goose Up
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Purpose: Add denormalized violationLevel column to User, Organization, and Streamer for O(1) auth/RBAC enforcement.

ALTER TABLE `User`
  ADD COLUMN `violationLevel` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `disabledAt`;

ALTER TABLE `Organization`
  ADD COLUMN `violationLevel` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `createBy`;

ALTER TABLE `Streamer`
  ADD COLUMN `violationLevel` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `maxTipAmount`;

-- +goose Down
ALTER TABLE `Streamer` DROP COLUMN `violationLevel`;
ALTER TABLE `Organization` DROP COLUMN `violationLevel`;
ALTER TABLE `User` DROP COLUMN `violationLevel`;
