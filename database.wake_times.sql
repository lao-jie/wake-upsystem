-- 多次叫醒/多次回访：次数进度字段（宝塔 MySQL，导入到库 tb）
-- 若列已存在会报 Duplicate column，可忽略
SET NAMES utf8mb4;

ALTER TABLE `wake_orders` ADD COLUMN `required_times` int NOT NULL DEFAULT 1 COMMENT '需完成次数';
ALTER TABLE `wake_orders` ADD COLUMN `completed_times` int NOT NULL DEFAULT 0 COMMENT '已完成次数';
ALTER TABLE `wake_orders` ADD COLUMN `progress_date` varchar(16) DEFAULT '' COMMENT '上次自动记次日期 YYYY-MM-DD';
