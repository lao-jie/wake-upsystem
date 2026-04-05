import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    // 1. 检查环境变量
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "环境变量缺失",
        url_exists: !!supabaseUrl,
        key_exists: !!supabaseKey
      });
    }

    // 2. 初始化Supabase
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 3. 计算今天0点
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);

    // 4. 执行更新
    const { data, error } = await supabase
      .from('wake_orders')
      .update({ status: '已完成' })
      .eq('status', '进行中')
      .lt('submittime', todayZero);

    // 5. 处理Supabase错误
    if (error) {
      return res.status(500).json({
        error: "Supabase操作失败",
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }

    // 6. 成功返回
    return res.status(200).json({
      message: "自动完成订单成功",
      updated_count: data?.length || 0,
      todayZero: todayZero.toISOString()
    });

  } catch (err) {
    // 7. 捕获所有代码异常
    return res.status(500).json({
      error: "代码执行异常",
      message: err.message,
      stack: err.stack
    });
  }
}
