import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 今天 00:00:00
  const todayZero = new Date()
  todayZero.setHours(0, 0, 0, 0)

  // 自动更新昨天的订单
  const { data, error } = await supabase
    .from('wake_orders')
    .update({ status: '已完成' })
    .eq('status', '进行中')
    .lt('submittime', todayZero)  // 这里是小写L的lt，不是大写i的It

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({
    message: '自动完成订单成功',
    todayZero: todayZero.toISOString()
  })
}
