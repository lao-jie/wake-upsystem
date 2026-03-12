// Supabase 读写
async function getOrders() {
    try {
        const { data, error } = await supabaseClient
            .from('wake_orders')
            .select('*')
            .order('submitTime', { ascending: true });

        if (!error && data) {
            return data;
        }
    } catch (e) {
        console.log("Supabase 读取订单失败，使用本地数据：", e);
    }
    return JSON.parse(localStorage.getItem("wakeOrders") || "[]");
}

async function saveOrders(orders) {
    try {
        await supabaseClient.from('wake_orders').delete().neq('id', 0);
        if (orders.length > 0) {
            await supabaseClient.from('wake_orders').insert(orders);
        }
    } catch (e) {
        console.log("Supabase 保存订单失败，仅保存到本地：", e);
    }
    localStorage.setItem("wakeOrders", JSON.stringify(orders));
}

async function getStaffList() {
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('*');

        if (!error && data) {
            return data;
        }
    } catch (e) {
        console.log("Supabase 读取员工失败，使用本地数据：", e);
    }
    return JSON.parse(localStorage.getItem("staffList") || "[]");
}

async function saveStaffList(staffList) {
    try {
        await supabaseClient.from('staff_list').delete().neq('id', 0);
        if (staffList.length > 0) {
            await supabaseClient.from('staff_list').insert(staffList);
        }
    } catch (e) {
        console.log("Supabase 保存员工失败，仅保存到本地：", e);
    }
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
            return data;
        }
    } catch (e) {
        console.log("Supabase 读取余额明细失败，使用本地数据：", e);
    }
    return JSON.parse(localStorage.getItem("salaryDetails") || "[]");
}

async function saveSalaryDetails(details) {
    try {
        await supabaseClient.from('salary_details').delete().neq('id', 0);
        if (details.length > 0) {
            await supabaseClient.from('salary_details').insert(details);
        }
    } catch (e) {
        console.log("Supabase 保存余额明细失败，仅保存到本地：", e);
    }
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
