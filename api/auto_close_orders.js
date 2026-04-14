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

    // 3. 计算北京时间今日0点（确保是UTC+8）
    const now = new Date();
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const todayZero = new Date(beijingTime);
    todayZero.setUTCHours(0, 0, 0, 0);
    // 转换回UTC时间用于查询
    const todayZeroUTC = new Date(todayZero.getTime() - (8 * 60 * 60 * 1000));

    // 4. 先查询需要自动完成的订单（进行中的昨天订单）
    const queryResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/wake_orders?status=eq.进行中&submittime=lt.${todayZeroUTC.toISOString()}`,
      {
        method: "GET",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!queryResponse.ok) {
      const errorResult = await queryResponse.json();
      return res.status(500).json({
        error: "查询订单失败",
        statusCode: queryResponse.status,
        details: errorResult
      });
    }

    const ordersToComplete = await queryResponse.json();

    if (ordersToComplete.length === 0) {
      return res.status(200).json({
        message: "没有需要自动完成的订单",
        updatedCount: 0,
        todayZero: todayZero.toISOString()
      });
    }

    // 5. 结算员工薪资（逐个处理）
    const salaryDetails = [];
    const staffSalaryUpdates = {};
    let detailIdCounter = 0;

    for (const order of ordersToComplete) {
处理有员工接单的订单
      if (order.staffid && !order.salarysettled) {
        const amount = parseFloat(order.amount || order.money || 0);
        if (amount > 0) {
          // 生成结算key（幂等性保护）
          const settleKey = `auto_close_order:${order.id}:${todayZero.toISOString().split('T')[0]}`;
          
          // 准备薪资明细记录（使用更安全的ID生成方式）
          detailIdCounter++;
          salaryDetails.push({
            id: `${Date.now()}-${detailIdCounter}-${Math.floor(Math.random() * 1000)}-${order.id}`,
            staffid: order.staffid,
            amount: amount,
            type: "订单收入",
            description: "订单完成自动结算",
            createdat: new Date().toISOString(),
            settle_key: settleKey,
            order_id: order.id
          });

          // 累计员工薪资更新
          if (!staffSalaryUpdates[order.staffid]) {
            staffSalaryUpdates[order.staffid] = 0;
          }
          staffSalaryUpdates[order.staffid] += amount;
        }
      }
    }

    // 6. 先更新订单状态（确保即使薪资结算失败，订单也不会重复处理）
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/wake_orders?status=eq.进行中&submittime=lt.${todayZeroUTC.toISOString()}`,
      {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ 
          status: "已完成",
          salarysettled: true 
        })
      }
    );

    if (!updateResponse.ok) {
      const errorResult = await updateResponse.json();
      return res.status(500).json({
        error: "更新订单状态失败",
        statusCode: updateResponse.status,
        details: errorResult
      });
    }

    const updatedOrders = await updateResponse.json();

    // 7. 插入薪资明细（使用upsert避免重复）
    if (salaryDetails.length > 0) {
      const detailResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/salary_details`,
        {
          method: "POST",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates"
          },
          body: JSON.stringify(salaryDetails)
        }
      );

      if (!detailResponse.ok) {
        console.error("插入薪资明细失败:", await detailResponse.json());
        // 不影响主流程，继续执行
      }
    }

    // 8. 更新员工余额（逐个更新）
    for (const [staffId, amount] of Object.entries(staffSalaryUpdates)) {
      // 先查询当前余额
      const staffQueryResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/staff_list?id=eq.${staffId}&select=salary`,
        {
          method: "GET",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (staffQueryResponse.ok) {
        const staffData = awai staffQueryResponse.json();
        if (staffData.length > 0) {
          const currentSalary= parseFloat(staffData[0].salary || 0);
          const newSalary = parseFloat((currentSalary + amount).toFixed(2));

          // 更新员工余额
          const staffUpdateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/staff_list?id=eq.${staffId}`,
            {
              method: "PATCH",
              headers: {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ salary: newSalary })
            }
          );

          if (!staffUpdateResponse.ok) {
            console.error(`更新员工 ${staffId} 余额失败:`, await staffUpdateResponse.json());
          }
        }
      }
    }

    // 9. 成功返回（包含更新条数，方便验证）
    return res.status(200).json({
      message: "自动完成订单并结算薪资成功",
      updatedCount: updatedOrders.length,
      salaryDetailsCount: salaryDetails.length,
      staffUpdatedCount: Object.keys(staffSalaryUpdates).length,
      todayZero: todayZero.toISOString()
    });

  } catch (err) {
    // 10. 捕获所有代码异常，输出完整日志
    return res.status(500).json({
      error: "函数执行异常",
      message: err.message,
      stack: err.stack
    });
  }
}
