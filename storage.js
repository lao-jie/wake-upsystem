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
        if (validOrders.length > 0) {
            // 仅做分批 upsert，避免“本地视图不全导致误删云端数据”
            for (let i = 0; i < validOrders.length; i += 100) {
                const batch = validOrders.slice(i, i + 100);
                const { error } = await supabaseClient
                    .from('wake_orders')
                    .upsert(batch, { onConflict: 'id' });
                if (error) {
                    throw new Error(`批量保存订单失败：${error.message}`);
                }
            }
        }
    } catch (e) {
        console.error("Supabase 保存订单失败，仅保存到本地：", e);
    } finally {
        // 无论如何都保存到本地存储
        localStorage.setItem("wakeOrders", JSON.stringify(orders));
    }
}

// ==============================
// 价格策略（管理员可配置）
// - 优先读写 Supabase 表 price_strategy（单行：id='default'）
// - 失败则回退 localStorage
// ==============================
const PRICE_STRATEGY_LS_KEY = "priceStrategy";
const PRICE_STRATEGY_DB_TABLE = "price_strategy";

function getDefaultPriceStrategy() {
    const wakeRules = (typeof PRICE_RULE === "object" && PRICE_RULE) ? { ...PRICE_RULE } : {
        "06:00-06:30": 0.8,
        "06:31-07:00": 0.7,
        "07:01-08:00": 0.6,
        "08:01-24:00": 0.5
    };
    return {
        version: 1,
        wake: {
            rules: wakeRules
        },
        supervise: {
            unitPricePerDay: {
                "监督早睡": 1.35,
                "监督早起": 1.35,
                "监督早睡早起": 2.7
            }
        },
        updatedAt: new Date().toISOString()
    };
}

function readPriceStrategyFromLocal() {
    try {
        const raw = localStorage.getItem(PRICE_STRATEGY_LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
        return null;
    }
}

function savePriceStrategyToLocal(strategy) {
    try {
        localStorage.setItem(PRICE_STRATEGY_LS_KEY, JSON.stringify(strategy));
    } catch (_) { }
}

async function getPriceStrategy() {
    try {
        const { data, error } = await supabaseClient
            .from(PRICE_STRATEGY_DB_TABLE)
            .select("*")
            .eq("id", "default")
            .single();
        if (!error && data) {
            const strategy = data?.data && typeof data.data === "object" ? data.data : null;
            if (strategy) {
                savePriceStrategyToLocal(strategy);
                return strategy;
            }
        }
    } catch (e) {
        console.warn("读取价格策略失败，改用本地缓存：", e);
    }
    return readPriceStrategyFromLocal() || getDefaultPriceStrategy();
}

async function savePriceStrategy(strategy) {
    const next = strategy && typeof strategy === "object" ? strategy : getDefaultPriceStrategy();
    next.updatedAt = new Date().toISOString();
    let saved = false;
    try {
        const { error } = await supabaseClient
            .from(PRICE_STRATEGY_DB_TABLE)
            .upsert([{ id: "default", data: next, updated_at: next.updatedAt }], { onConflict: "id" });
        if (!error) {
            saved = true;
        } else {
            console.error("保存价格策略失败：", error);
        }
    } catch (e) {
        console.warn("保存价格策略异常，仅保存到本地：", e);
    } finally {
        savePriceStrategyToLocal(next);
    }
    return { savedToCloud: saved, strategy: next };
}

// PostgREST 常把 numeric 序列化成字符串；统一成 number，避免前端 .toFixed / 加减出错
function normalizeStaffRecord(staff) {
    if (!staff || typeof staff !== "object") return staff;
    const sal = Number.parseFloat(staff.salary);
    return {
        ...staff,
        salary: Number.isFinite(sal) ? sal : 0,
        phone: String(staff.phone || "").trim(),
        salaryMethod: staff.salaryMethod || staff.salarymethod || staff.salary_method || "",
        salaryAccount: staff.salaryAccount || staff.salaryaccount || staff.salary_account || ""
    };
}

async function getStaffList() {
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('*');

        if (!error && data) {
            const normalized = data.map(normalizeStaffRecord);
            // 同步到本地存储
            localStorage.setItem("staffList", JSON.stringify(normalized));
            return normalized;
        } else if (error) {
            console.error("Supabase 读取员工失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取员工异常：", e);
    }
    try {
        const local = JSON.parse(localStorage.getItem("staffList") || "[]");
        return Array.isArray(local) ? local.map(normalizeStaffRecord) : [];
    } catch (_) {
        return [];
    }
}

function normalizeSalaryMethodForDb(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (!value) return null;
    if (value === "alipay" || value === "wechat" || value === "bank") return value;
    // 兼容历史中文值，避免触发数据库 check constraint
    if (value === "支付宝") return "alipay";
    if (value === "微信") return "wechat";
    if (value === "银行卡" || value === "bankcard") return "bank";
    return null;
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
            salarymethod: normalizeSalaryMethodForDb(staff.salaryMethod),
            salaryaccount: String(staff.salaryAccount || "").trim()
        }));
        if (validStaffList.length > 0) {
            // 仅做 upsert，避免多端并发时“谁最后写谁删别人”
            for (let i = 0; i < validStaffList.length; i += 100) {
                const batch = validStaffList.slice(i, i + 100);
                const { error } = await supabaseClient
                    .from('staff_list')
                    .upsert(batch, { onConflict: 'id' });
                if (error) {
                    throw new Error(`批量保存员工失败：${error.message}`);
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
            dbPatch.salarymethod = normalizeSalaryMethodForDb(patch.salaryMethod);
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

function normalizeSalaryDetailItem(detail) {
    return {
        ...detail,
        id: String(detail?.id || "").trim(),
        staffid: String(detail?.staffid || "").trim(),
        amount: Number(detail?.amount || 0),
        type: String(detail?.type || "").trim(),
        description: String(detail?.description || "").trim(),
        createdat: String(detail?.createdat || "").trim(),
        settle_key: String(detail?.settle_key || detail?.settleKey || "").trim(),
        order_id: detail?.order_id ?? detail?.orderId ?? null
    };
}

function buildSalaryDetailDedupKey(detail) {
    // 优先使用幂等 key（同一订单结算跨端最稳定）
    if (detail.settle_key) return `settle:${detail.settle_key}`;
    const createdAtMs = new Date(detail.createdat || 0).getTime();
    const createdAtSec = Number.isFinite(createdAtMs) && createdAtMs > 0 ? Math.floor(createdAtMs / 1000) : 0;
    // 其次按业务组合去重（不使用 id，避免“同一事件不同 id”重复显示）
    return `fallback:${detail.staffid}|${createdAtSec}|${Number(detail.amount || 0)}|${detail.type}|${detail.description}`;
}

// 余额明细存储
async function getSalaryDetails() {
    const localDetailsRaw = JSON.parse(localStorage.getItem("salaryDetails") || "[]");
    const localDetails = Array.isArray(localDetailsRaw) ? localDetailsRaw.map(normalizeSalaryDetailItem) : [];
    try {
        const { data, error } = await supabaseClient
            .from('salary_details')
            .select('*')
            .order('createdat', { ascending: false });

        if (!error && data) {
            // 云端可用时以云端为准，避免“数据库已删除但本地缓存仍显示”
            const cloudDetails = Array.isArray(data) ? data.map(normalizeSalaryDetailItem) : [];
            cloudDetails.sort((a, b) => {
                const ta = new Date(a.createdat || 0).getTime() || 0;
                const tb = new Date(b.createdat || 0).getTime() || 0;
                return tb - ta;
            });
            localStorage.setItem("salaryDetails", JSON.stringify(cloudDetails));
            return cloudDetails;
        } else if (error) {
            console.error("Supabase 读取余额明细失败：", error);
        }
    } catch (e) {
        console.error("Supabase 读取余额明细异常：", e);
    }
    return localDetails.sort((a, b) => {
        const ta = new Date(a.createdat || 0).getTime() || 0;
        const tb = new Date(b.createdat || 0).getTime() || 0;
        return tb - ta;
    });
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

        let { error } = await supabaseClient.from('salary_details').insert(payload);
        // 兼容旧表结构：若无 settle_key / order_id 字段，自动降级重试
        if (error && /settle_key|order_id|column/i.test(String(error.message || ""))) {
            const fallbackPayload = {
                id: payload.id,
                staffid: payload.staffid,
                amount: payload.amount,
                type: payload.type,
                description: payload.description,
                createdat: payload.createdat
            };
            const retry = await supabaseClient.from('salary_details').insert(fallbackPayload);
            error = retry.error || null;
        }
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
    const normalizedStaffId = String(staffid || "").trim();
    const normalizedType = String(type || "").trim();
    const normalizedDesc = String(description || "").trim();

    // 保护：订单收入（自动结算）必须有 settle_key + order_id，否则拒绝写入，避免产生脏数据（NULL order_id/settle_key）
    if (normalizedType === "订单收入" && /自动结算/.test(normalizedDesc)) {
        const sk = String(opts?.settleKey || "").trim();
        const oid = opts?.orderId;
        if (!sk || oid === undefined || oid === null || oid === "") {
            console.warn("已阻止无幂等键/订单ID的订单收入明细写入：", { staffid: normalizedStaffId, amount, type: normalizedType, description: normalizedDesc, opts });
            return { inserted: false, reason: "missing_settle_key_or_order_id" };
        }
    }
    const newDetail = {
        id: (opts.id || `${Date.now()}-${Math.floor(Math.random() * 1000000)}`),
        staffid: normalizedStaffId,
        amount,
        type: normalizedType, // 类型：订单收入、奖励、惩罚、结算
        description: normalizedDesc,
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
    const normalizedStaffId = String(staffId || "").trim();
    if (!normalizedStaffId) return false;
    try {
        const { data, error } = await supabaseClient
            .from('staff_list')
            .select('id, salary')
            .eq('id', normalizedStaffId)
            .single();
        if (error || !data) {
            console.error("读取员工余额失败：", error);
            return false;
        }
        const nextSalary = (parseFloat(data.salary || 0) + parseFloat(delta || 0));
        const { error: updateError } = await supabaseClient
            .from('staff_list')
            .update({ salary: nextSalary })
            .eq('id', normalizedStaffId);
        if (updateError) {
            console.error("更新员工余额失败：", updateError);
            return false;
        }

        // 同步本地 staffList 缓存
        const staffList = JSON.parse(localStorage.getItem("staffList") || "[]");
        const idx = staffList.findIndex(s => String(s.id || "").trim() === normalizedStaffId);
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
