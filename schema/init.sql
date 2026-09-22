CREATE DATABASE IF NOT EXISTS `alertbox_org_dev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `alertbox_org_dev_shadow` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'alertbox.org.dev'@'%' IDENTIFIED BY 'dev-super-secure-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE ON `alertbox_org_dev`.* TO 'alertbox.org.dev'@'%';

CREATE USER IF NOT EXISTS 'alertbox_migrator_dev'@'%' IDENTIFIED BY 'dev-migration-very-secure-password';
GRANT ALL PRIVILEGES ON `alertbox_org_dev`.* TO 'alertbox_migrator_dev'@'%';
GRANT ALL PRIVILEGES ON `alertbox_org_dev_shadow`.* TO 'alertbox_migrator_dev'@'%';

FLUSH PRIVILEGES;
