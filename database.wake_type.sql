-- 叫醒订单增加类型字段（宝塔 MySQL，导入到库 tb）
-- 类型：叫醒 / 回访 / 多次叫醒 / 多次回访
-- 若列已存在会报 Duplicate column，可忽略
SET NAMES utf8mb4;

ALTER TABLE `wake_orders` ADD COLUMN `waketype` varchar(32) NOT NULL DEFAULT '叫醒' AFTER `phone`;
