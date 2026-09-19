/*
  Warnings:

  - You are about to alter the column `animIn` on the `AlertboxEvent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(64)` to `UnsignedSmallInt`.
  - You are about to alter the column `animOut` on the `AlertboxEvent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(64)` to `UnsignedSmallInt`.

*/
-- Convert string names → enum IDs before altering
UPDATE `AlertboxEvent` SET
  `animIn` = CASE `animIn`
    WHEN 'fade_in_up' THEN 0
    WHEN 'bounce_in' THEN 2
    WHEN 'slide_in_left' THEN 4
    ELSE 0
  END,
  `animOut` = CASE `animOut`
    WHEN 'fade_out_up' THEN 1
    WHEN 'bounce_out' THEN 3
    WHEN 'slide_out_right' THEN 5
    ELSE 1
  END;

-- AlterTable
ALTER TABLE `AlertboxEvent` MODIFY `animIn` SMALLINT UNSIGNED NULL DEFAULT 1,
    MODIFY `animOut` SMALLINT UNSIGNED NULL DEFAULT 1;
