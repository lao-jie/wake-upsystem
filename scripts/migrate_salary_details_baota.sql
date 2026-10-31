-- ============================================================
-- 宝塔 MySQL：为 salary_details 补齐 settle_key / order_id
-- 解决控制台：
--   salary_details 表缺少 settle_key/order_id 列或写入被拒
--   POST /api/db 500
--
-- 用法：宝塔 → 数据库 → 你的库 → SQL → 整段执行
-- 若提示 Duplicate column / Duplicate key name，说明已加过，可忽略该行。
-- 执行后请重启 Node 服务（或 git pull 后重启，新版本启动会自动补列）。
-- ============================================================

ALTER TABLE `salary_details` ADD COLUMN `settle_key` varchar(191) DEFAULT NULL;
ALTER TABLE `salary_details` ADD COLUMN `order_id` varchar(64) DEFAULT NULL;

UPDATE `salary_details`
SET `settle_key` = NULL
WHERE `settle_key` IS NOT NULL AND TRIM(`settle_key`) = '';

ALTER TABLE `salary_details` ADD UNIQUE KEY `uq_salary_details_settle_key` (`settle_key`);
ALTER TABLE `salary_details` ADD KEY `idx_salary_details_order_id` (`order_id`);

-- 验收
SHOW COLUMNS FROM `salary_details` LIKE 'settle_key';
SHOW COLUMNS FROM `salary_details` LIKE 'order_id';
SHOW INDEX FROM `salary_details` WHERE Key_name IN ('uq_salary_details_settle_key', 'idx_salary_details_order_id');
