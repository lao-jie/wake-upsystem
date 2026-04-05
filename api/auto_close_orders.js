export default async function handler(req, res) {
  try {
    // 1. 读取环境变量（已验证正确）
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 2. 双重校验环境变量（兜底）
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({
        error: "环境变量缺失",
        url: !!SUPABASE_URL,
        key: !!SUPABASE_SERVICE_KEY
      });
    }

    // 3. 计算北京时间今日0点（和业务逻辑完全匹配）
    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);

    // 4. 用原生fetch直接调用Supabase REST API（无需任何依赖）
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/wake_orders?status=eq.进行中&submittime=lt.${todayZero.toISOString()}`,
      {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ status: "已完成" })
      }
    );

    // 5. 解析响应，处理Supabase返回的错误
    const result = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "Supabase API调用失败",
        statusCode: response.status,
        details: result
      });
    }

    // 6. 成功返回（包含更新条数，方便验证）
    return res.status(200).json({
      message: "自动完成订单成功",
      updatedCount: result.length,
      todayZero: todayZero.toISOString()
    });

  } catch (err) {
    // 7. 捕获所有代码异常，输出完整日志
    return res.status(500).json({
      error: "函数执行异常",
      message: err.message,
      stack: err.stack
    });
  }
}
