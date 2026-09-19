/*
  Warnings:

  - You are about to alter the column `messageLayout` on the `AlertboxEvent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(32)` to `UnsignedSmallInt`.

*/
-- Convert Float volumes/pitch/speed (0.0..1.0) → Int % (0..100)
UPDATE `AlertboxSetting`
SET `globalVolume` = ROUND(COALESCE(`globalVolume`, 0.5) * 100);

UPDATE `AlertboxEvent` SET
  -- Seconds → Milliseconds (* 1000)
  `minVisibleDuration` = ROUND(COALESCE(`minVisibleDuration`, 3) * 1000),
  `animInDuration`     = ROUND(COALESCE(`animInDuration`, 1) * 1000),
  `animOutDuration`    = ROUND(COALESCE(`animOutDuration`, 1) * 1000),
  `ttsDelay`           = ROUND(COALESCE(`ttsDelay`, 0) * 1000),

  -- 0.0..1.0 → 0..100 %
  `soundVolume` = ROUND(COALESCE(`soundVolume`, 0.5) * 100),
  `ttsVolume`   = ROUND(COALESCE(`ttsVolume`, 0.5) * 100),
  `ttsSpeed`    = ROUND(COALESCE(`ttsSpeed`, 0.5) * 100),
  `ttsPitch`    = ROUND(COALESCE(`ttsPitch`, 0.5) * 100),

  -- String layout → ID
  `messageLayout` = CASE `messageLayout`
    WHEN 'image-above'  THEN 0
    WHEN 'image-beside' THEN 1
    ELSE 0
  END;


-- AlterTable
ALTER TABLE `AlertboxEvent` MODIFY `messageLayout` SMALLINT UNSIGNED NULL DEFAULT 0,
    MODIFY `minVisibleDuration` SMALLINT UNSIGNED NULL DEFAULT 3000,
    MODIFY `animIn` SMALLINT UNSIGNED NULL DEFAULT 0,
    MODIFY `animInDuration` SMALLINT UNSIGNED NULL DEFAULT 1000,
    MODIFY `animOutDuration` SMALLINT UNSIGNED NULL DEFAULT 1000,
    MODIFY `soundVolume` TINYINT UNSIGNED NULL DEFAULT 50,
    MODIFY `ttsVolume` TINYINT UNSIGNED NULL DEFAULT 50,
    MODIFY `ttsSpeed` TINYINT UNSIGNED NULL DEFAULT 50,
    MODIFY `ttsPitch` TINYINT UNSIGNED NULL DEFAULT 50,
    MODIFY `ttsDelay` SMALLINT UNSIGNED NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `AlertboxSetting` MODIFY `globalVolume` TINYINT UNSIGNED NULL DEFAULT 50;
