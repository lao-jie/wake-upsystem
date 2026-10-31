-- ============================================================
-- 宝塔 MySQL/MariaDB：为 salary_details 补齐 settle_key / order_id
-- 可重复执行：列/索引已存在会跳过，不会再报 Duplicate column
--
-- 用法：宝塔 → 数据库 → SQL → 整段执行
-- 执行后请重启 Node（git pull 后的新版本启动也会自动补列）
-- ============================================================

-- 1) 缺啥补啥（已存在则跳过）
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='salary_details' AND COLUMN_NAME='settle_key') = 0,
    'ALTER TABLE `salary_details` ADD COLUMN `settle_key` varchar(191) DEFAULT NULL',
    'SELECT ''skip settle_key column'' AS info'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='salary_details' AND COLUMN_NAME='order_id') = 0,
    'ALTER TABLE `salary_details` ADD COLUMN `order_id` varchar(64) DEFAULT NULL',
    'SELECT ''skip order_id column'' AS info'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 空字符串归一成 NULL，再建唯一索引
UPDATE `salary_details`
SET `settle_key` = NULL
WHERE `settle_key` IS NOT NULL AND TRIM(`settle_key`) = '';

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='salary_details' AND INDEX_NAME='uq_salary_details_settle_key') = 0,
    'ALTER TABLE `salary_details` ADD UNIQUE KEY `uq_salary_details_settle_key` (`settle_key`)',
    'SELECT ''skip uq_salary_details_settle_key'' AS info'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='salary_details' AND INDEX_NAME='idx_salary_details_order_id') = 0,
    'ALTER TABLE `salary_details` ADD KEY `idx_salary_details_order_id` (`order_id`)',
    'SELECT ''skip idx_salary_details_order_id'' AS info'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 验收：两列都应有，索引也应有
SHOW COLUMNS FROM `salary_details` LIKE 'settle_key';
SHOW COLUMNS FROM `salary_details` LIKE 'order_id';
SHOW INDEX FROM `salary_details`
WHERE Key_name IN ('uq_salary_details_settle_key', 'idx_salary_details_order_id');
