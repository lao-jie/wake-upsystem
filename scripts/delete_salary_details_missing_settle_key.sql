-- ============================================================
-- 删除：叫醒「订单完成自动结算」且缺少 settle_key（幂等 id）的明细
-- 表：public.salary_details
--
-- 重要：
-- 1) 只删 salary_details 行，不会自动修改 staff_list.salary。
--    若你已用手动惩罚/扣款把余额调平，再删明细可避免重复记账；
--    若还没扣余额，只删明细会导致「明细没了但余额仍多」——请先冲正余额或勿执行删除。
-- 2) 不包含：奖励、惩罚、手动结算、监督回退等（那些 type/description 不同）。
-- 3) 建议先备份表或在事务里先 SELECT 再 DELETE。
-- ============================================================

-- ---------- 第 1 步：预览（必跑，确认条数与金额）----------
select
  staffid,
  count(*) as cnt,
  sum(amount) as sum_amount
from public.salary_details
where type = '订单收入'
  and description like '%订单完成自动结算%'
  and (settle_key is null or btrim(settle_key) = '')
group by staffid
order by sum_amount desc;

select count(*) as total_rows_to_delete
from public.salary_details
where type = '订单收入'
  and description like '%订单完成自动结算%'
  and (settle_key is null or btrim(settle_key) = '');

-- （可选）抽查明细 id
-- select id, staffid, amount, description, createdat, settle_key, order_id
-- from public.salary_details
-- where type = '订单收入'
--   and description like '%订单完成自动结算%'
--   and (settle_key is null or btrim(settle_key) = '')
-- order by createdat desc
-- limit 50;


-- ---------- 第 2 步：执行删除（确认预览无误后再执行）----------
begin;

delete from public.salary_details
where type = '订单收入'
  and description like '%订单完成自动结算%'
  and (settle_key is null or btrim(settle_key) = '');

-- 查看本语句删除行数（Supabase 客户端可能显示 DELETE n）
commit;
-- 若发现不对：改为 rollback;


-- ---------- 可选：只删某一天（例如 2026-05-08）----------
-- begin;
-- delete from public.salary_details
-- where type = '订单收入'
--   and description like '%订单完成自动结算%'
--   and (settle_key is null or btrim(settle_key) = '')
--   and createdat >= '2026-05-08T00:00:00+00'::timestamptz
--   and createdat <  '2026-05-09T00:00:00+00'::timestamptz;
-- commit;
