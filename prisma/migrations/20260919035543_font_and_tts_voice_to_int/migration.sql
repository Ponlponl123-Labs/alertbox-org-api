/*
  Warnings:

  - You are about to alter the column `fontFamily` on the `AlertboxEvent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(64)` to `UnsignedTinyInt`.
  - You are about to alter the column `ttsVoice` on the `AlertboxEvent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(64)` to `UnsignedTinyInt`.

*/
UPDATE `AlertboxEvent` SET
  -- Font string → ID mapping (0: Open Sans)
  `fontFamily` = CASE `fontFamily`
    WHEN 'Open Sans' THEN 0
    ELSE 0
  END,

  -- TTS voice string → ID mapping (0: default / en-US)
  `ttsVoice` = CASE `ttsVoice`
    WHEN 'en-US-Standard-C' THEN 0
    ELSE 0
  END;


-- AlterTable
ALTER TABLE `AlertboxEvent` MODIFY `fontFamily` TINYINT UNSIGNED NULL DEFAULT 0,
    MODIFY `fontSize` TINYINT UNSIGNED NOT NULL DEFAULT 20,
    MODIFY `ttsVoice` TINYINT UNSIGNED NULL DEFAULT 0;
