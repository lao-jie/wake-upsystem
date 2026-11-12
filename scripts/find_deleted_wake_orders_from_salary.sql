-- ============================================================
-- 排查：已被 7 天清理删掉、但仍留在余额明细里的叫醒订单
-- 库：宝塔 MySQL（wake_orders / salary_details）
--
-- 说明：
-- 1) 自动清理只删 wake_orders 行，不删 salary_details，也不回退余额。
-- 2) 因此「已结算」的旧单，往往还能在 salary_details 里用 order_id 找到痕迹。
-- 3) 未结算就被删的订单：明细里通常没有记录，只能靠宝塔备份 / binlog 恢复。
-- ============================================================

-- A) 列出：余额明细里有 order_id，但 wake_orders 已不存在的「订单收入」
SELECT
  sd.id AS detail_id,
  sd.order_id,
  sd.settle_key,
  sd.staffid,
  sd.amount,
  sd.type,
  sd.description,
  sd.createdat
FROM salary_details sd
LEFT JOIN wake_orders wo ON wo.id = sd.order_id
WHERE sd.type = '订单收入'
  AND sd.order_id IS NOT NULL
  AND TRIM(sd.order_id) <> ''
  AND wo.id IS NULL
ORDER BY sd.createdat DESC;

-- B) 按员工汇总：可追溯但订单行已缺失的收入笔数/金额
SELECT
  sd.staffid,
  COUNT(*) AS missing_order_rows,
  SUM(sd.amount) AS total_amount
FROM salary_details sd
LEFT JOIN wake_orders wo ON wo.id = sd.order_id
WHERE sd.type = '订单收入'
  AND sd.order_id IS NOT NULL
  AND TRIM(sd.order_id) <> ''
  AND wo.id IS NULL
GROUP BY sd.staffid
ORDER BY missing_order_rows DESC;

-- C)（可选）根据明细「占位」重建极简订单行 —— 仅补档案，信息不完整
--    手机号/叫醒时间等字段无法从明细还原，需后续手工补。
--    执行前请先跑 A 确认范围；确认后再取消下面注释执行。
/*
INSERT INTO wake_orders (
  id, waketime, phone, waketype, note, amount, status,
  staffid, staffname, salarysettled, submittime
)
SELECT
  sd.order_id,
  '',
  '',
  '叫醒',
  CONCAT('从余额明细恢复占位（detail=', sd.id, '）'),
  ABS(sd.amount),
  '已完成',
  sd.staffid,
  '',
  1,
  COALESCE(sd.createdat, NOW())
FROM salary_details sd
LEFT JOIN wake_orders wo ON wo.id = sd.order_id
WHERE sd.type = '订单收入'
  AND sd.description LIKE '%自动结算%'
  AND sd.amount > 0
  AND sd.order_id IS NOT NULL
  AND TRIM(sd.order_id) <> ''
  AND wo.id IS NULL
  AND (sd.settle_key IS NULL OR sd.settle_key LIKE 'wake_income:%');
*/
