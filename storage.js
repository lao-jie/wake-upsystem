// Supabase 读写
async function getOrders() {
    try {
        const { data, error } = await supabaseClient
            .from('wake_orders')
            .select('*')
            .order('submitTime', { ascending: true });

        if (!error && data) {
            // 同步到本地存储
            localStorage.setItem("wakeOrders", JSON.stringify(data));
            return data;
        } else if (error) {
            console.error("Supabase 读取订单失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取订单异常：", e);
    }
    return JSON.parse(localStorage.getItem("wakeOrders") || "[]");
}

async function saveOrders(orders) {
    try {
        // 先清空表
        const deleteResult = await supabaseClient.from('wake_orders').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除订单失败：${deleteResult.error.message}`);
        }

        // 插入新订单
        if (orders.length > 0) {
            const insertResult = await supabaseClient.from('wake_orders').insert(orders);
            if (insertResult.error) {
                throw new Error(`插入订单失败：${insertResult.error.message}`);
            }
        }

        console.log("Supabase 保存订单成功");
    } catch (e) {
        console.error("Supabase 保存订单失败，仅保存到本地：", e);
    }
    // 无论如何都保存到本地存储
    localStorage.setItem("wakeOrders", JSON.stringify(orders));
}

async function getStaffList() {
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('*');

        if (!error && data) {
            // 同步到本地存储
            localStorage.setItem("staffList", JSON.stringify(data));
            return data;
        } else if (error) {
            console.error("Supabase 读取员工失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取员工异常：", e);
    }
    return JSON.parse(localStorage.getItem("staffList") || "[]");
}

async function saveStaffList(staffList) {
    try {
        // 先清空表
        const deleteResult = await supabaseClient.from('staff_list').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除员工失败：${deleteResult.error.message}`);
        }

        // 插入新员工
        if (staffList.length > 0) {
            const insertResult = await supabaseClient.from('staff_list').insert(staffList);
            if (insertResult.error) {
                throw new Error(`插入员工失败：${insertResult.error.message}`);
            }
        }

        console.log("Supabase 保存员工成功");
    } catch (e) {
        console.error("Supabase 保存员工失败，仅保存到本地：", e);
    }
    // 无论如何都保存到本地存储
    localStorage.setItem("staffList", JSON.stringify(staffList));
}

// 余额明细存储
async function getSalaryDetails() {
    try {
        const { data, error } = await supabaseClient
            .from('salary_details')
            .select('*')
            .order('createdAt', { ascending: false });

        if (!error && data) {
            // 同步到本地存储
            localStorage.setItem("salaryDetails", JSON.stringify(data));
            return data;
        } else if (error) {
            console.error("Supabase 读取余额明细失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取余额明细异常：", e);
    }
    return JSON.parse(localStorage.getItem("salaryDetails") || "[]");
}

async function saveSalaryDetails(details) {
    try {
        // 先清空表
        const deleteResult = await supabaseClient.from('salary_details').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除余额明细失败：${deleteResult.error.message}`);
        }

        // 插入新余额明细
        if (details.length > 0) {
            const insertResult = await supabaseClient.from('salary_details').insert(details);
            if (insertResult.error) {
                throw new Error(`插入余额明细失败：${insertResult.error.message}`);
            }
        }

        console.log("Supabase 保存余额明细成功");
    } catch (e) {
        console.error("Supabase 保存余额明细失败，仅保存到本地：", e);
    }
    // 无论如何都保存到本地存储
    localStorage.setItem("salaryDetails", JSON.stringify(details));
}

// 添加余额变动记录
async function addSalaryDetail(staffId, amount, type, description) {
    const details = await getSalaryDetails();
    const newDetail = {
        id: Date.now().toString(),
        staffId: staffId,
        amount: amount,
        type: type, // 类型：订单收入、奖励、惩罚、结算
        description: description,
        createdAt: new Date().toISOString()
    };
    details.unshift(newDetail);
    await saveSalaryDetails(details);
}
