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
        // 获取当前时间（UTC）
        function getChinaTime() {
            const now = new Date();
            return now;
        }

        // 确保订单数据结构正确，使用数据库字段名
        const validOrders = orders.map(order => ({
            id: order.id || Math.floor(Math.random() * 1000000), // 使用6位随机数作为ID，避免超出整数范围
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

        // 先获取数据库中已有的订单
        const { data: existingOrders, error: fetchError } = await supabaseClient
            .from('wake_orders')
            .select('id');

        if (fetchError) {
            throw new Error(`获取现有订单失败：${fetchError.message}`);
        }

        // 提取现有订单的ID
        const existingIds = new Set(existingOrders?.map(order => order.id) || []);
        // 提取当前订单的ID
        const currentIds = new Set(validOrders.map(order => order.id));

        // 找出需要删除的订单ID（数据库中有但当前列表中没有）
        const ordersToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));

        // 批量删除订单（使用 in 操作符）
        if (ordersToDelete.length > 0) {
            const deleteResult = await supabaseClient
                .from('wake_orders')
                .delete()
                .in('id', ordersToDelete);
            if (deleteResult.error) {
                console.error(`批量删除订单失败：${deleteResult.error.message}`);
            }
        }

        // 只有在有订单时才进行插入和更新操作
        if (validOrders.length > 0) {
            // 分离新订单和现有订单
            const newOrders = validOrders.filter(order => !existingIds.has(order.id));
            const existingOrdersToUpdate = validOrders.filter(order => existingIds.has(order.id));

            // 批量插入新订单
            if (newOrders.length > 0) {
                // 分批插入，每批最多100个
                for (let i = 0; i < newOrders.length; i += 100) {
                    const batch = newOrders.slice(i, i + 100);
                    const insertResult = await supabaseClient.from('wake_orders').insert(batch);
                    if (insertResult.error) {
                        throw new Error(`插入新订单失败：${insertResult.error.message}`);
                    }
                }
            }

            // 批量更新现有订单（使用 upsert）
            if (existingOrdersToUpdate.length > 0) {
                // 分批更新，每批最多100个
                for (let i = 0; i < existingOrdersToUpdate.length; i += 100) {
                    const batch = existingOrdersToUpdate.slice(i, i + 100);
                    const updateResult = await supabaseClient
                        .from('wake_orders')
                        .upsert(batch, { onConflict: 'id' });
                    if (updateResult.error) {
                        console.error(`批量更新订单失败：${updateResult.error.message}`);
                    }
                }
            }
        } else {
            console.log("订单数量为0，跳过插入和更新操作");
        }
    } catch (e) {
        console.error("Supabase 保存订单失败，仅保存到本地：", e);
    } finally {
        // 无论如何都保存到本地存储
        localStorage.setItem("wakeOrders", JSON.stringify(orders));
    }
}

async function getStaffList() {
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('*');

        if (!error && data) {
            const normalized = data.map((staff) => ({
                ...staff,
                phone: staff.phone || '',
                salaryMethod: staff.salaryMethod || staff.salarymethod || staff.salary_method || '',
                salaryAccount: staff.salaryAccount || staff.salaryaccount || staff.salary_account || ''
            }));
            // 同步到本地存储
            localStorage.setItem("staffList", JSON.stringify(normalized));
            return normalized;
        } else if (error) {
            console.error("Supabase 读取员工失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取员工异常：", e);
    }
    return JSON.parse(localStorage.getItem("staffList") || "[]");
}

async function saveStaffList(staffList) {
    let savedToCloud = false;
    try {
        const validStaffList = staffList.map(staff => ({
            id: staff.id,
            name: staff.name,
            password: staff.password,
            salary: parseFloat(staff.salary || 0),
            phone: String(staff.phone || "").trim(),
            salarymethod: String(staff.salaryMethod || "").trim(),
            salaryaccount: String(staff.salaryAccount || "").trim()
        }));

        // 先获取数据库中已有的员工
        const { data: existingStaff, error: fetchError } = await supabaseClient
            .from('staff_list')
            .select('id');

        if (fetchError) {
            throw new Error(`获取现有员工失败：${fetchError.message}`);
        }

        // 提取现有员工的ID
        const existingIds = new Set(existingStaff?.map(staff => staff.id) || []);
        // 提取当前员工的ID
        const currentIds = new Set(validStaffList.map(staff => staff.id));

        // 找出需要删除的员工ID（数据库中有但当前列表中没有）
        const staffToDelete = Array.from(existingIds).filter(id => !currentIds.has(id));

        // 批量删除员工
        if (staffToDelete.length > 0) {
            const deleteResult = await supabaseClient
                .from('staff_list')
                .delete()
                .in('id', staffToDelete);
            if (deleteResult.error) {
                console.error(`批量删除员工失败：${deleteResult.error.message}`);
            }
        }

        // 只有在有员工时才进行插入和更新操作
        if (validStaffList.length > 0) {
            // 分离新员工和现有员工
            const newStaff = validStaffList.filter(staff => !existingIds.has(staff.id));
            const existingStaffToUpdate = validStaffList.filter(staff => existingIds.has(staff.id));

            // 批量插入新员工
            if (newStaff.length > 0) {
                const insertResult = await supabaseClient.from('staff_list').insert(newStaff);
                if (insertResult.error) {
                    throw new Error(`插入新员工失败：${insertResult.error.message}`);
                }
            }

            // 批量更新现有员工（使用 upsert）
            if (existingStaffToUpdate.length > 0) {
                const updateResult = await supabaseClient
                    .from('staff_list')
                    .upsert(existingStaffToUpdate, { onConflict: 'id' });
                if (updateResult.error) {
                    console.error(`批量更新员工失败：${updateResult.error.message}`);
                }
            }
        }

        savedToCloud = true;
        console.log("Supabase 保存员工成功");
    } catch (e) {
        console.error("Supabase 保存员工失败，仅保存到本地：", e);
    }
    if (!savedToCloud) {
        console.warn("员工信息本次未写入云端，仅保存在本地缓存。");
    }
    localStorage.setItem("staffList", JSON.stringify(staffList));
}

// 按员工ID只更新指定字段（用于账号管理，避免全表 upsert 带来的覆盖/丢字段问题）
async function updateStaffProfileById(staffId, patch) {
    const id = String(staffId || "").trim();
    if (!id) return { ok: false, reason: "invalid_id" };
    try {
        const dbPatch = {};
        if (Object.prototype.hasOwnProperty.call(patch, "password")) {
            dbPatch.password = String(patch.password || "");
        }
        if (Object.prototype.hasOwnProperty.call(patch, "phone")) {
            dbPatch.phone = String(patch.phone || "").trim();
        }
        if (Object.prototype.hasOwnProperty.call(patch, "salaryMethod")) {
            dbPatch.salarymethod = String(patch.salaryMethod || "").trim();
        }
        if (Object.prototype.hasOwnProperty.call(patch, "salaryAccount")) {
            dbPatch.salaryaccount = String(patch.salaryAccount || "").trim();
        }

        const keys = Object.keys(dbPatch);
        if (keys.length === 0) return { ok: false, reason: "empty_patch" };

        const { data: updatedRows, error: updateError } = await supabaseClient
            .from('staff_list')
            .update(dbPatch)
            .eq('id', id)
            .select('*');
        if (updateError) {
            console.error("更新员工资料失败：", updateError);
            return { ok: false, reason: "update_failed", error: updateError };
        }

        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
            return { ok: false, reason: "no_row_updated" };
        }

        const data = updatedRows[0];
        const normalized = {
            ...data,
            phone: data.phone || '',
            salaryMethod: data.salaryMethod || data.salarymethod || data.salary_method || '',
            salaryAccount: data.salaryAccount || data.salaryaccount || data.salary_account || ''
        };

        // 同步本地缓存
        const cached = JSON.parse(localStorage.getItem("staffList") || "[]");
        const idx = cached.findIndex((s) => String(s.id) === id);
        if (idx !== -1) cached[idx] = { ...cached[idx], ...normalized };
        else cached.push(normalized);
        localStorage.setItem("staffList", JSON.stringify(cached));

        return { ok: true, data: normalized };
    } catch (e) {
        console.error("更新员工资料异常：", e);
        return { ok: false, reason: "exception", error: e };
    }
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

// 原先的 saveSalaryDetails 会“全表删除再插入”，会引发并发重复/覆盖问题。
// 余额明细改为“单条插入”，并支持唯一 settle_key 实现幂等防重。

async function insertSalaryDetail(detail) {
    try {
        const payload = {
            id: detail.id,
            staffid: detail.staffid,
            amount: parseFloat(detail.amount || 0),
            type: detail.type,
            description: detail.description,
            createdat: detail.createdat || new Date().toISOString(),
            // 以下两列需要你在 Supabase 表结构中添加（允许为空）
            settle_key: detail.settle_key || null,
            order_id: detail.order_id || null
        };

        const { error } = await supabaseClient.from('salary_details').insert(payload);
        if (error) {
            // 23505 = unique_violation（用于 settle_key 唯一约束）
            if (error.code === '23505') {
                return { inserted: false, reason: 'duplicate' };
            }
            console.error("Supabase 插入余额明细失败：", error);
            return { inserted: false, reason: 'error' };
        }

        // 同步到本地缓存（插入成功才缓存）
        const cached = JSON.parse(localStorage.getItem("salaryDetails") || "[]");
        cached.unshift(payload);
        localStorage.setItem("salaryDetails", JSON.stringify(cached));
        return { inserted: true };
    } catch (e) {
        console.error("Supabase 插入余额明细异常：", e);
        return { inserted: false, reason: 'exception' };
    }
}

// 添加余额变动记录（返回 inserted，用于幂等结算判断）
async function addSalaryDetail(staffid, amount, type, description, completedTime = new Date(), opts = {}) {
    const newDetail = {
        id: (opts.id || `${Date.now()}-${Math.floor(Math.random() * 1000000)}`),
        staffid,
        amount,
        type, // 类型：订单收入、奖励、惩罚、结算
        description,
        createdat: completedTime.toISOString(),
        settle_key: opts.settleKey || null,
        order_id: opts.orderId || null
    };

    // 优先写入 Supabase；如果失败则仅写本地（失败时不保证幂等）
    const res = await insertSalaryDetail(newDetail);
    if (res.inserted) return { inserted: true };

    // 如果是重复（已有 settle_key），直接视为“已存在”
    if (res.reason === 'duplicate') return { inserted: false, reason: 'duplicate' };

    // 兜底：写本地（无唯一约束，极端并发仍可能重复）
    const cached = JSON.parse(localStorage.getItem("salaryDetails") || "[]");
    cached.unshift(newDetail);
    localStorage.setItem("salaryDetails", JSON.stringify(cached));
    return { inserted: true, fallback: true };
}

// 原子性更好的余额更新：只更新单个员工行（避免全表 delete/insert）
async function addStaffSalary(staffId, delta) {
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('id, salary')
            .eq('id', staffId)
            .single();
        if (error || !data) {
            console.error("读取员工余额失败：", error);
            return false;
        }
        const nextSalary = (parseFloat(data.salary || 0) + parseFloat(delta || 0));
        const { error: updateError } = await supabaseClient
            .from('staff_list')
            .update({ salary: nextSalary })
            .eq('id', staffId);
        if (updateError) {
            console.error("更新员工余额失败：", updateError);
            return false;
        }

        // 同步本地 staffList 缓存
        const staffList = JSON.parse(localStorage.getItem("staffList") || "[]");
        const idx = staffList.findIndex(s => s.id === staffId);
        if (idx !== -1) {
            staffList[idx].salary = nextSalary;
            localStorage.setItem("staffList", JSON.stringify(staffList));
        }
        return true;
    } catch (e) {
        console.error("更新员工余额异常：", e);
        return false;
    }
}
