-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied.
-- Target: MariaDB Galera Cluster (InnoDB, utf8mb4_unicode_ci)
-- Non-blocking online DDL for Galera TOI safety
CREATE UNIQUE INDEX IF NOT EXISTS `Streamer_name_unique_idx`
  ON `Streamer`(`name`),
  ALGORITHM=INPLACE, LOCK=NONE;

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back.
DROP INDEX IF EXISTS `Streamer_name_unique_idx` ON `Streamer`,
  ALGORITHM=INPLACE, LOCK=NONE;
