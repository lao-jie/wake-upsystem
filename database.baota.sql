-- 宝塔 MySQL 建库脚本（叫醒订单管理系统）
-- 用法：宝塔 → 数据库 → 添加数据库（如 wakeup）→ 导入本文件
-- 字符集选 utf8mb4

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- 1) staff_list 员工表
-- =====================================================
CREATE TABLE IF NOT EXISTS `staff_list` (
  `id` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `password` varchar(128) NOT NULL,
  `salary` decimal(12,2) NOT NULL DEFAULT 0.00,
  `phone` varchar(32) DEFAULT '',
  `salarymethod` varchar(16) DEFAULT 'alipay',
  `salaryaccount` varchar(128) DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_staff_list_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2) wake_orders 叫醒订单
-- =====================================================
CREATE TABLE IF NOT EXISTS `wake_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `waketime` varchar(64) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `waketype` varchar(32) NOT NULL DEFAULT '叫醒',
  `note` text,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(32) NOT NULL DEFAULT '待接单',
  `serialnumber` int DEFAULT NULL,
  `staffid` varchar(64) DEFAULT '',
  `staffname` varchar(128) DEFAULT '',
  `salarysettled` tinyint(1) NOT NULL DEFAULT 0,
  `submittime` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `wake_staff_since` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wake_orders_submittime` (`submittime`),
  KEY `idx_wake_orders_status` (`status`),
  KEY `idx_wake_orders_staffid` (`staffid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3) supervise_orders 监督订单
-- =====================================================
CREATE TABLE IF NOT EXISTS `supervise_orders` (
  `id` varchar(64) NOT NULL,
  `waketime` varchar(64) NOT NULL,
  `phone` varchar(32) DEFAULT '',
  `note` mediumtext,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(32) NOT NULL DEFAULT '待接单',
  `serialnumber` int DEFAULT NULL,
  `staffid` varchar(64) DEFAULT '',
  `staffname` varchar(128) DEFAULT '',
  `salarysettled` tinyint(1) NOT NULL DEFAULT 0,
  `submittime` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_supervise_orders_submittime` (`submittime`),
  KEY `idx_supervise_orders_status` (`status`),
  KEY `idx_supervise_orders_staffid` (`staffid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4) salary_details 余额明细
-- =====================================================
CREATE TABLE IF NOT EXISTS `salary_details` (
  `id` varchar(64) NOT NULL,
  `staffid` varchar(64) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `type` varchar(64) NOT NULL,
  `description` text,
  `createdat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `settle_key` varchar(191) DEFAULT NULL,
  `order_id` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salary_details_settle_key` (`settle_key`),
  KEY `idx_salary_details_staffid_createdat` (`staffid`, `createdat`),
  KEY `idx_salary_details_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5) price_strategy 价格策略
-- =====================================================
CREATE TABLE IF NOT EXISTS `price_strategy` (
  `id` varchar(64) NOT NULL,
  `data` json NOT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_price_strategy_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6) supervise_leave_requests 监督请假
-- =====================================================
CREATE TABLE IF NOT EXISTS `supervise_leave_requests` (
  `id` varchar(64) NOT NULL,
  `order_id` varchar(64) NOT NULL,
  `order_no` varchar(64) DEFAULT NULL,
  `project` varchar(128) DEFAULT NULL,
  `target_date` date NOT NULL,
  `leave_type` varchar(16) NOT NULL,
  `leave_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `applicant_id` varchar(64) DEFAULT NULL,
  `applicant_name` varchar(128) DEFAULT NULL,
  `operator_id` varchar(64) DEFAULT NULL,
  `operator_name` varchar(128) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_slr_applicant_id` (`applicant_id`),
  KEY `idx_slr_status` (`status`),
  KEY `idx_slr_updated_at` (`updated_at`),
  KEY `idx_slr_order_target` (`order_id`, `target_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7) home_pending_items 首页待处理
-- =====================================================
CREATE TABLE IF NOT EXISTS `home_pending_items` (
  `id` varchar(64) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL,
  `order_ref` varchar(64) DEFAULT NULL,
  `source` varchar(64) DEFAULT NULL,
  `description` text,
  `payload` json NOT NULL,
  `done` tinyint(1) NOT NULL DEFAULT 0,
  `decision` varchar(16) NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` datetime(3) DEFAULT NULL,
  `processed_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hpi_done_created` (`done`, `created_at`),
  KEY `idx_hpi_kind` (`kind`),
  KEY `idx_hpi_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8) page_notices 页面公告
-- =====================================================
CREATE TABLE IF NOT EXISTS `page_notices` (
  `page` varchar(64) NOT NULL,
  `content` mediumtext NOT NULL,
  `updatedby` varchar(64) DEFAULT NULL,
  `updatedat` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`page`),
  KEY `idx_page_notices_updatedat` (`updatedat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 初始数据
INSERT IGNORE INTO `price_strategy` (`id`, `data`, `updated_at`)
VALUES ('default', '{}', NOW(3));

INSERT IGNORE INTO `page_notices` (`page`, `content`, `updatedby`, `updatedat`)
VALUES
  ('wake', '', 'system', NOW(3)),
  ('supervise', '', 'system', NOW(3));

-- 已有库升级：叫醒订单类型（已存在会报 Duplicate column，可忽略）
ALTER TABLE `wake_orders` ADD COLUMN `waketype` varchar(32) NOT NULL DEFAULT '叫醒' AFTER `phone`;

SET FOREIGN_KEY_CHECKS = 1;
