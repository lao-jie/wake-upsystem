import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    // 1. 初始化Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. 计算今日0点（北京时间）
    const todayZero = new Date()
    todayZero.setHours(0, 0, 0, 0)

    // 3. 执行更新：只改「进行中+昨天的订单」
    const { data, error } = await supabase
      .from('wake_orders')
      .update({ status: '已完成' })
      .eq('status', '进行中')
      .lt('submittime', todayZero)

    // 4. 处理Supabase错误
    if (error) {
      return res.status(500).json({
        error: 'Supabase操作失败',
        details: error.message,
        code: error.code
      })
    }

    // 5. 成功返回
    return res.status(200).json({
      message: '自动完成订单成功',
      updated_count: data?.length || 0,
      todayZero: todayZero.toISOString()
    })

  } catch (err) {
    // 6. 捕获所有代码异常
    return res.status(500).json({
      error: '代码执行异常',
      message: err.message
    })
  }
}
