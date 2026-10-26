-- 邀请码注册相关表（宝塔 MySQL，导入到库 tb）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `invite_codes` (
  `code` varchar(32) NOT NULL,
  `note` varchar(255) DEFAULT '',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `max_uses` int NOT NULL DEFAULT 0 COMMENT '0=不限',
  `used_count` int NOT NULL DEFAULT 0,
  `created_by` varchar(64) DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`),
  KEY `idx_invite_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `register_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account` varchar(32) NOT NULL COMMENT 'QQ号',
  `code` varchar(10) NOT NULL DEFAULT '',
  `ip` varchar(64) NOT NULL DEFAULT '',
  `addtime` datetime(3) NOT NULL,
  `expire` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `fails` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_reg_account` (`account`),
  KEY `idx_reg_ip_addtime` (`ip`, `addtime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- staff_list 补充字段（已存在会报 Duplicate column，可忽略继续）
ALTER TABLE `staff_list` ADD COLUMN `email` varchar(128) DEFAULT '';
ALTER TABLE `staff_list` ADD COLUMN `invite_code` varchar(32) DEFAULT '';
ALTER TABLE `staff_list` ADD COLUMN `register_ip` varchar(64) DEFAULT '';
ALTER TABLE `staff_list` ADD COLUMN `created_at` datetime(3) NULL;
