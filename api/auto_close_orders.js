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

    const todayKey = `${beijingTime.getUTCFullYear()}-${String(beijingTime.getUTCMonth() + 1).padStart(2, "0")}-${String(beijingTime.getUTCDate()).padStart(2, "0")}`;
    const isMultiType = (t) => {
      const s = String(t || "").trim();
      return s === "多次叫醒" || s === "多次回访";
    };

    // 5. 逐单处理：多次类型先记次，达次数才结单；普通类型直接完成
    const updatedOrders = [];
    for (const order of ordersToComplete) {
      const patch = {};
      if (isMultiType(order.waketype)) {
        const required = Math.max(2, parseInt(order.required_times || 2, 10) || 2);
        let done = Math.max(0, parseInt(order.completed_times || 0, 10) || 0);
        if (String(order.progress_date || "") !== todayKey) {
          done = Math.min(required, done + 1);
          patch.completed_times = done;
          patch.required_times = required;
          patch.progress_date = todayKey;
        } else {
          done = Math.min(required, done);
        }
        if (done >= required) {
          patch.status = "已完成";
          patch.salarysettled = false;
          patch.completed_times = required;
          patch.required_times = required;
        } else if (!Object.keys(patch).length) {
          continue;
        }
      } else {
        patch.status = "已完成";
        patch.salarysettled = false;
        patch.required_times = 1;
        patch.completed_times = 1;
      }

      const updateOne = await fetch(
        `${SUPABASE_URL}/rest/v1/wake_orders?id=eq.${order.id}`,
        {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(patch)
        }
      );
      if (!updateOne.ok) continue;
      const rows = await updateOne.json();
      const next = Array.isArray(rows) && rows[0] ? rows[0] : { ...order, ...patch };
      // 仅已完成的进入结算
      if (String(next.status || "") === "已完成") {
        updatedOrders.push(next);
      }
    }

    // 6. 逐单结算：写明细 -> 加余额 -> 标记该单已结算
    const settledOrderIds = [];
    const failedOrderIds = [];
    let salaryDetailsCount = 0;

    for (const order of updatedOrders) {
      const staffId = String(order?.staffid || "").trim();
      const amount = parseFloat(order?.amount || order?.money || 0);
      const orderId = order?.id;
      if (orderId === undefined || orderId === null || orderId === "") {
        // 严格：无订单 id 不结算，避免产生 NULL 明细/重复
        failedOrderIds.push(orderId);
        continue;
      }
      if (!staffId || !(amount > 0)) {
        failedOrderIds.push(order.id);
        continue;
      }

      const settleKey = `order_income:${orderId}`;
      // 先查是否已结算过，避免重复加余额
      const existedResp = await fetch(
        `${SUPABASE_URL}/rest/v1/salary_details?settle_key=eq.${encodeURIComponent(settleKey)}&select=id&limit=1`,
        {
          method: "GET",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      if (existedResp.ok) {
        const existed = await existedResp.json();
        if (Array.isArray(existed) && existed.length > 0) {
          settledOrderIds.push(order.id);
          continue;
        }
      }

      const detailPayload = [{
        id: `${Date.now()}-${Math.floor(Math.random() * 1000000)}-${orderId}`,
        staffid: staffId,
        amount: amount,
        type: "订单收入",
        description: "订单完成自动结算",
        createdat: new Date().toISOString(),
        settle_key: settleKey,
        order_id: orderId
      }];

      const detailResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/salary_details`,
        {
          method: "POST",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(detailPayload)
        }
      );
      if (!detailResponse.ok) {
        failedOrderIds.push(order.id);
        continue;
      }
      const insertedRows = await detailResponse.json();
      if (!Array.isArray(insertedRows) || insertedRows.length === 0) {
        // 未插入新明细（例如并发下已存在），不重复加余额
        settledOrderIds.push(order.id);
        continue;
      }
      salaryDetailsCount += 1;

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
        const staffData = await staffQueryResponse.json();
        if (staffData.length > 0) {
          const currentSalary = parseFloat(staffData[0].salary || 0);
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
            failedOrderIds.push(order.id);
            continue;
          }

          settledOrderIds.push(order.id);
          continue;
        }
      }
      failedOrderIds.push(order.id);
    }

    if (settledOrderIds.length > 0) {
      const idsCsv = settledOrderIds.join(",");
      await fetch(
        `${SUPABASE_URL}/rest/v1/wake_orders?id=in.(${idsCsv})`,
        {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ salarysettled: true })
        }
      );
    }

    // 7. 返回结果（包含成功与失败统计，方便排查）
    return res.status(200).json({
      message: "自动完成订单并结算薪资成功",
      updatedCount: updatedOrders.length,
      salaryDetailsCount,
      settledCount: settledOrderIds.length,
      failedCount: failedOrderIds.length,
      failedOrderIds,
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
