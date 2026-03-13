// Supabase 读写
async function getOrders() {
    console.log('开始从数据库获取订单');
    try {
        const { data, error } = await supabaseClient
            .from('wake_orders')
            .select('*')
            .order('submittime', { ascending: true });

        console.log('数据库返回数据:', data);
        console.log('数据库返回错误:', error);

        if (!error && data) {
            console.log('成功从数据库获取订单，数量:', data.length);
            // 同步到本地存储
            localStorage.setItem("wakeOrders", JSON.stringify(data));
            return data;
        } else if (error) {
            console.error("Supabase 读取订单失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取订单异常：", e);
    }
    // 从本地存储获取
    const localOrders = JSON.parse(localStorage.getItem("wakeOrders") || "[]");
    console.log('从本地存储获取订单，数量:', localOrders.length);
    return localOrders;
}

async function saveOrders(orders) {
    try {
        // 确保订单数据结构正确，使用数据库字段名
        const validOrders = orders.map(order => ({
            waketime: order.waketime,
            phone: order.phone,
            note: order.note || '',
            amount: parseFloat(order.amount || order.money || 0), // 确保是数值类型
            status: order.status || '待接单',
            serialnumber: order.serialnumber || null,
            staffid: order.staffid || '',
            staffname: order.staffname || '',
            salarysettled: Boolean(order.salarysettled || false),
            submittime: order.submittime || new Date().toISOString()
        }));

        // 先清空表
        const deleteResult = await supabaseClient.from('wake_orders').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除订单失败：${deleteResult.error.message}`);
        }

        // 插入新订单
        if (validOrders.length > 0) {
            const insertResult = await supabaseClient.from('wake_orders').insert(validOrders);
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
        const validStaffList = staffList.map(staff => ({
            id: staff.id,
            name: staff.name,
            password: staff.password,
            salary: parseFloat(staff.salary || 0)
        }));

        const deleteResult = await supabaseClient.from('staff_list').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除员工失败：${deleteResult.error.message}`);
        }

        if (validStaffList.length > 0) {
            const insertResult = await supabaseClient.from('staff_list').insert(validStaffList);
            if (insertResult.error) {
                throw new Error(`插入员工失败：${insertResult.error.message}`);
            }
        }

        console.log("Supabase 保存员工成功");
    } catch (e) {
        console.error("Supabase 保存员工失败，仅保存到本地：", e);
    }
    localStorage.setItem("staffList", JSON.stringify(staffList));
}

// 余额明细存储
async function getSalaryDetails() {
    try {
        const { data, error } = await supabaseClient
            .from('salary_details')
            .select('*')
            .order('createdat', { ascending: false });

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
        const validDetails = details.map(detail => ({
            id: detail.id,
            staffid: detail.staffid,
            amount: parseFloat(detail.amount || 0),
            type: detail.type,
            description: detail.description,
            createdat: detail.createdat || new Date().toISOString()
        }));

        const deleteResult = await supabaseClient.from('salary_details').delete().neq('id', 0);
        if (deleteResult.error) {
            throw new Error(`删除余额明细失败：${deleteResult.error.message}`);
        }

        if (validDetails.length > 0) {
            const insertResult = await supabaseClient.from('salary_details').insert(validDetails);
            if (insertResult.error) {
                throw new Error(`插入余额明细失败：${insertResult.error.message}`);
            }
        }

        console.log("Supabase 保存余额明细成功");
    } catch (e) {
        console.error("Supabase 保存余额明细失败，仅保存到本地：", e);
    }
    localStorage.setItem("salaryDetails", JSON.stringify(details));
}

// 添加余额变动记录
async function addSalaryDetail(staffid, amount, type, description) {
    const details = await getSalaryDetails();
    const newDetail = {
        id: Date.now().toString(),
        staffid: staffid,
        amount: amount,
        type: type, // 类型：订单收入、奖励、惩罚、结算
        description: description,
        createdat: new Date().toISOString()
    };
    details.unshift(newDetail);
    await saveSalaryDetails(details);
}
