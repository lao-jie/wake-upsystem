let currentSuperviseUser = null;
let superviseIsAdmin = false;
let superviseIsStaff = false;

(function checkLoginStatus() {
    currentSuperviseUser = JSON.parse(localStorage.getItem("loginUser"));
    if (!currentSuperviseUser) {
        window.location.href = "index.html";
        return;
    }

    const userNameEl = document.getElementById("superviseUserName");
    if (userNameEl) {
        userNameEl.textContent = currentSuperviseUser.name || currentSuperviseUser.id || "未知用户";
    }

    superviseIsAdmin = currentSuperviseUser.role === "admin";
    superviseIsStaff = currentSuperviseUser.role === "staff";
    const navTeamText = document.getElementById("navTeamText");
    if (navTeamText) navTeamText.textContent = superviseIsAdmin ? "团队管理" : "个人中心";
    const noticeNav = document.getElementById("nav-notice-setting");
    if (noticeNav) noticeNav.style.display = superviseIsAdmin ? "flex" : "none";

    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
})();

function logout() {
    if (!confirm("确定要退出登录吗？")) return;
    localStorage.removeItem("loginUser");
    window.location.href = "index.html";
}

function toggleSubMenu() {
    const sub = document.getElementById("subMenu");
    const arr = document.getElementById("arrow");
    if (!sub || !arr) return;
    if (sub.style.display === "block") {
        sub.style.display = "none";
        arr.innerText = "▼";
    } else {
        sub.style.display = "block";
        arr.innerText = "▲";
    }
}

let parsedSuperviseOrders = [];
const SUPERVISE_META_PREFIX = "[SVMETA]";
let customDurationDays = 1;
let lastDurationValue = "一天";
let currentCalendarTaskId = "";
let currentCalendarMonthCursor = null;
let selectedLogDate = "";

const SUPERVISE_AI_SYSTEM_PROMPT = `你是监督任务识别助手。用户会给出监督任务文本，你只提取监督任务信息。

支持两种输入格式：
1) 五行一组：
   - 第一行：淘宝订单号
   - 第二行：监督项目
   - 第三行：学员名字
   - 第四行：监督时长
   - 第五行：备注
2) 一行一个订单：字段之间用空格分隔（顺序同上：订单号 项目 学员名字 时长 备注）

输出要求：
- 仅输出 JSON 数组，不要任何解释
- 每项字段：
  - orderno: 订单号字符串
  - project: 监督项目（如 监督早睡 / 监督早起 / 监督早睡早起）
  - duration: 监督时长（如 一天 / 七天 / 半个月 / 一个月 / 3天）
  - studentname: 学员名字
  - note: 备注（可为空）
- 忽略无法识别的无效项`;

function getLocalDateTimeInputValue(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d}T${hh}:${mm}`;
}

function getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateOnlyToLocal(dateStr) {
    const s = String(dateStr || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

function getDatePartFromDateTime(value) {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
}

function getSuperviseTaskStartDateStr(row) {
    const fromStartDate = String(row?.startdate || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromStartDate)) return fromStartDate;
    const fromWakeTime = getDatePartFromDateTime(row?.waketime);
    if (fromWakeTime) return fromWakeTime;
    const fromSubmit = getDatePartFromDateTime(row?.submittime);
    if (fromSubmit) return fromSubmit;
    return getLocalDateString();
}

function isSuperviseTaskReady(row, nowDate = new Date()) {
    const start = parseDateOnlyToLocal(getSuperviseTaskStartDateStr(row));
    if (!start) return true;
    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    return today >= start;
}

function getDurationDays(duration) {
    const map = {
        "一天": 1,
        "七天": 7,
        "半个月": 15,
        "一个月": 30
    };
    if (duration === "其他时间") {
        return Number(customDurationDays) > 0 ? Number(customDurationDays) : 1;
    }
    const dayMatch = String(duration || "").match(/(\d+)\s*天/);
    if (dayMatch) {
        const d = parseInt(dayMatch[1], 10);
        return Number.isFinite(d) && d > 0 ? d : 1;
    }
    return map[duration] || 1;
}

function normalizeDurationText(rawDuration) {
    const s = String(rawDuration || "").trim();
    if (!s) return "一天";
    const aliasMap = {
        "1天": "一天",
        "一天": "一天",
        "7天": "七天",
        "七天": "七天",
        "15天": "半个月",
        "半个月": "半个月",
        "30天": "一个月",
        "一月": "一个月",
        "一个月": "一个月"
    };
    if (aliasMap[s]) return aliasMap[s];
    const dayMatch = s.match(/^(\d+)\s*天$/);
    if (dayMatch) return `${parseInt(dayMatch[1], 10)}天`;
    return s;
}

function getAutoPriceByProjectAndDuration(project, duration) {
    const days = getDurationDays(duration);
    if (!project) return "";
    const unitPriceMap = {
        "监督早睡": 1.35,
        "监督早起": 1.35,
        "监督早睡早起": 2.7
    };
    const unitPrice = unitPriceMap[project];
    if (!unitPrice) return "";
    return unitPrice * days;
}

function getDurationTextForSave(duration) {
    if (duration === "其他时间") {
        return `${getDurationDays(duration)}天`;
    }
    return duration;
}

function updateAutoSupervisePrice() {
    const project = (document.getElementById("svProjectName")?.value || "").trim();
    const duration = document.getElementById("svDuration")?.value || "一天";
    const priceInput = document.getElementById("svPrice");
    if (!priceInput) return;
    const autoPrice = getAutoPriceByProjectAndDuration(project, duration);
    if (autoPrice === "") {
        priceInput.value = "";
        return;
    }
    priceInput.value = Number(autoPrice).toFixed(2);
}

function openCustomDurationModal() {
    const modal = document.getElementById("customDurationModal");
    const input = document.getElementById("customDurationDays");
    if (input) input.value = String(customDurationDays || 1);
    if (modal) modal.style.display = "flex";
    if (input) {
        input.oninput = () => {
            const d = parseInt(input.value || "", 10);
            if (Number.isFinite(d) && d > 0) {
                customDurationDays = d;
                updateAutoSupervisePrice();
            }
        };
    }
}

function closeCustomDurationModal() {
    const modal = document.getElementById("customDurationModal");
    if (modal) modal.style.display = "none";
    const durationSelect = document.getElementById("svDuration");
    if (durationSelect && durationSelect.value === "其他时间") {
        durationSelect.value = lastDurationValue || "一天";
    }
    updateAutoSupervisePrice();
}

function confirmCustomDuration() {
    const input = document.getElementById("customDurationDays");
    const days = parseInt(input?.value || "", 10);
    if (!Number.isFinite(days) || days <= 0) {
        alert("请输入有效的监督时长（天）");
        return;
    }
    customDurationDays = days;
    const durationSelect = document.getElementById("svDuration");
    if (durationSelect) {
        const otherOption = durationSelect.querySelector('option[value="其他时间"]');
        if (otherOption) otherOption.textContent = `其他时间（${days}天）`;
        durationSelect.value = "其他时间";
    }
    lastDurationValue = "其他时间";
    const modal = document.getElementById("customDurationModal");
    if (modal) modal.style.display = "none";
    // 确认自定义时长后，强制同步结算价格
    const project = (document.getElementById("svProjectName")?.value || "").trim();
    const priceInput = document.getElementById("svPrice");
    const autoPrice = getAutoPriceByProjectAndDuration(project, "其他时间");
    if (priceInput && autoPrice !== "") {
        priceInput.value = Number(autoPrice).toFixed(2);
    }
}

async function getSuperviseOrders() {
    try {
        const { data, error } = await supabaseClient
            .from("supervise_orders")
            .select("*")
            .order("submittime", { ascending: false });
        if (!error && Array.isArray(data)) {
            const hydrated = data.map(hydrateSuperviseOrder);
            localStorage.setItem("superviseOrders", JSON.stringify(hydrated));
            return hydrated;
        }
        console.error("读取监督订单失败：", error);
    } catch (e) {
        console.error("读取监督订单异常：", e);
    }
    return JSON.parse(localStorage.getItem("superviseOrders") || "[]");
}

async function saveSuperviseOrders(orders) {
    try {
        const validOrders = (orders || []).map((order, idx) => ({
            id: order.id || Math.floor(Math.random() * 1000000) + idx,
            waketime: order.waketime,
            phone: order.phone || "",
            note: buildSuperviseNote(order),
            amount: parseFloat(order.amount || order.money || order.price || 0),
            status: order.status || "待接单",
            serialnumber: order.serialnumber || null,
            staffid: order.staffid || "",
            staffname: order.staffname || "",
            salarysettled: Boolean(order.salarysettled || false),
            submittime: order.submittime || new Date().toISOString()
        }));

        const { error } = await supabaseClient
            .from("supervise_orders")
            .upsert(validOrders, { onConflict: "id" });
        if (error) {
            console.error("保存监督订单失败：", error);
        }
    } catch (e) {
        console.error("保存监督订单异常：", e);
    } finally {
        localStorage.setItem("superviseOrders", JSON.stringify(orders || []));
    }
}

function extractJsonArrayFromAiContent(raw) {
    if (raw == null || typeof raw !== "string") throw new Error("模型返回为空");
    let t = raw.trim();
    const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) t = fenced[1].trim();
    const parsed = JSON.parse(t);
    if (!Array.isArray(parsed)) throw new Error("识别结果必须是 JSON 数组");
    return parsed;
}

function normalizePhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return /^1[3-9]\d{9}$/.test(digits) ? digits : "";
}

function buildSuperviseNote(order) {
    const textNote = String(order.note || "").replace(`${SUPERVISE_META_PREFIX}`, "");
    const meta = {
        orderno: order.orderno || "",
        project: order.project || "",
        duration: order.duration || "",
        studentname: order.studentname || "",
        price: Number(order.price || order.amount || 0),
        supervisor: order.supervisor || "",
        endtime: order.endtime || "",
        startdate: order.startdate || "",
        dailylogs: order.dailylogs || {}
    };
    return `${textNote}\n${SUPERVISE_META_PREFIX}${JSON.stringify(meta)}`;
}

function hydrateSuperviseOrder(order) {
    const rawNote = String(order?.note || "");
    const markerIndex = rawNote.indexOf(SUPERVISE_META_PREFIX);
    const cleanNote = markerIndex >= 0 ? rawNote.slice(0, markerIndex).trim() : rawNote.trim();
    let meta = {};
    if (markerIndex >= 0) {
        const metaText = rawNote.slice(markerIndex + SUPERVISE_META_PREFIX.length).trim();
        try {
            meta = JSON.parse(metaText || "{}");
        } catch (_) {
            meta = {};
        }
    }
    return {
        ...order,
        note: cleanNote || "-",
        orderno: meta.orderno || "",
        project: meta.project || "",
        duration: meta.duration || "",
        studentname: meta.studentname || "",
        price: Number(meta.price || order.amount || 0),
        supervisor: meta.supervisor || "",
        endtime: meta.endtime || "",
        startdate: meta.startdate || "",
        dailylogs: meta.dailylogs && typeof meta.dailylogs === "object" ? meta.dailylogs : {}
    };
}

async function parseSuperviseBatchOrders() {
    const text = (document.getElementById("superviseBatchText")?.value || "").trim();
    const preview = document.getElementById("superviseParsePreview");
    const uploadBtn = document.getElementById("superviseUploadBtn");
    if (!text) {
        if (preview) preview.innerHTML = "请先粘贴监督订单文本";
        return;
    }

    if (preview) preview.innerHTML = "🤖 识别中...";
    if (uploadBtn) uploadBtn.disabled = true;
    parsedSuperviseOrders = [];

    try {
        const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer bb956b2870b346a39c34b3344a61defb.IOTprsN1opphPYp8"
            },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    { role: "system", content: SUPERVISE_AI_SYSTEM_PROMPT },
                    { role: "user", content: text }
                ],
                temperature: 0.05,
                top_p: 0.75,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        const resultText = data?.choices?.[0]?.message?.content || "[]";
        const list = extractJsonArrayFromAiContent(resultText);

        const now = new Date();
        const nowInput = getLocalDateTimeInputValue(now);
        const built = [];
        list.forEach((item) => {
            const orderno = String(item.orderno || item.orderNo || item.order_no || "").trim();
            const project = String(item.project || "").trim();
            const durationRaw = String(item.duration || "").trim();
            const studentname = String(item.studentname || item.studentName || "").trim();
            const note = String(item.note || "").trim() || "-";
            if (!orderno || !project || !durationRaw) return;
            const duration = normalizeDurationText(durationRaw);
            const price = Number(getAutoPriceByProjectAndDuration(project, duration) || 0);
            built.push({
                waketime: nowInput,
                phone: "",
                orderno,
                project,
                duration,
                studentname: studentname || "",
                price,
                supervisor: "",
                endtime: "",
                startdate: getDatePartFromDateTime(nowInput) || getLocalDateString(),
                note,
                amount: price,
                status: "待接单",
                serialnumber: null,
                staffid: "",
                staffname: "",
                salarysettled: false,
                submittime: new Date().toISOString()
            });
        });

        if (built.length === 0) throw new Error("没有识别到有效监督订单");
        parsedSuperviseOrders = built;
        if (uploadBtn) uploadBtn.disabled = false;
        if (preview) {
            preview.innerHTML = built.map((o, i) => `第${i + 1}单：订单号 ${o.orderno}｜${o.project}｜${o.duration}｜${o.studentname || "未填学员"}｜${Number(o.price || 0).toFixed(2)} 元`).join("<br>");
        }
    } catch (e) {
        if (preview) preview.innerHTML = `❌ 识别失败：${e.message}`;
        parsedSuperviseOrders = [];
    }
}

async function uploadSuperviseOrders() {
    if (parsedSuperviseOrders.length === 0) return;
    const existing = await getSuperviseOrders();
    const merged = [...existing, ...parsedSuperviseOrders];
    const withSerial = generateFixedSerial(merged);
    await saveSuperviseOrders(withSerial);
    const textarea = document.getElementById("superviseBatchText");
    const preview = document.getElementById("superviseParsePreview");
    const uploadBtn = document.getElementById("superviseUploadBtn");
    if (textarea) textarea.value = "";
    if (preview) preview.innerHTML = "";
    if (uploadBtn) uploadBtn.disabled = true;
    parsedSuperviseOrders = [];
    loadSuperviseDashboard();
}

function getSuperviseStatusClass(status) {
    const s = String(status || "").trim();
    if (s === "待接单") return "status-pending";
    if (s === "进行中") return "status-processing";
    return "status-done";
}

function normalizeSuperviseStatus(status) {
    return String(status || "").trim();
}

function hasMeaningfulValue(value) {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return false;
    if (v === "-" || v === "null" || v === "undefined" || v === "none") return false;
    return true;
}

function getOwnerIdValue(row) {
    return String(row?.staffid || "").trim();
}

function getOwnerNameValue(row) {
    return String(row?.supervisor || row?.staffname || "").trim();
}

function getEffectiveSuperviseStatus(row) {
    const raw = normalizeSuperviseStatus(row?.status);
    const hasOwner = hasMeaningfulValue(getOwnerIdValue(row)) || hasMeaningfulValue(getOwnerNameValue(row));
    if (raw === "已完成") return "已完成";
    if (hasOwner) return "进行中";
    return "待接单";
}

function getDailyLogs(row) {
    return row?.dailylogs && typeof row.dailylogs === "object" ? row.dailylogs : {};
}

function getCompletedDays(row) {
    const logs = getDailyLogs(row);
    return Object.values(logs).filter((entry) => entry && entry.passed === true).length;
}

function getTodayDailyStateText(row) {
    const today = getLocalDateString();
    const logs = getDailyLogs(row);
    const todayLog = logs[today];
    if (!todayLog) return "待提交";
    return todayLog.passed === true ? "已完成" : "未完成";
}

function updateSuperviseTaskStatusByLogs(row) {
    const completedDays = getCompletedDays(row);
    const requiredDays = getDurationDays(row.duration || "一天");
    if (completedDays >= requiredDays) {
        row.status = "已完成";
        return;
    }
    const ownerId = getOwnerIdValue(row);
    const ownerName = getOwnerNameValue(row);
    const hasOwner = hasMeaningfulValue(ownerId) || hasMeaningfulValue(ownerName);
    row.status = hasOwner ? "进行中" : "待接单";
}

function getExpectedDateSet(row) {
    const set = new Set();
    const start = parseDateOnlyToLocal(row?.startdate) || new Date(row?.submittime || Date.now());
    const today = parseDateOnlyToLocal(getLocalDateString()) || new Date();
    const requiredDays = getDurationDays(row?.duration || "一天");
    const total = Math.max(1, requiredDays);
    const endByDuration = new Date(start.getFullYear(), start.getMonth(), start.getDate() + total - 1);
    const end = endByDuration < today ? endByDuration : today;
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(getLocalDateString(d));
    }
    return set;
}

function getSuperviseFilters() {
    const keyword = (document.getElementById("superviseSearchInput")?.value || "").trim().toLowerCase();
    const status = document.getElementById("superviseStatusFilter")?.value || "all";
    const date = document.getElementById("superviseDateFilter")?.value || "";
    return { keyword, status, date };
}

function applySuperviseFilters(orders, filters) {
    return (orders || []).filter((order) => {
        if (filters.status !== "all" && order.status !== filters.status) {
            return false;
        }

        if (filters.date) {
            const startDateStr = getSuperviseTaskStartDateStr(order);
            if (startDateStr !== filters.date) return false;
        }

        if (filters.keyword) {
            const searchText = `${order.orderno || ""} ${order.project || ""} ${order.supervisor || ""} ${order.note || ""}`.toLowerCase();
            if (!searchText.includes(filters.keyword)) return false;
        }

        return true;
    });
}

function renderSuperviseSummary(orders) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    let pending = 0;
    let processing = 0;
    let done = 0;
    let today = 0;

    (orders || []).forEach((item) => {
        if (item.status === "待接单") pending += 1;
        else if (item.status === "进行中") processing += 1;
        else if (item.status === "已完成") done += 1;

        const startDate = parseDateOnlyToLocal(getSuperviseTaskStartDateStr(item));
        if (startDate && startDate >= todayStart && startDate < todayEnd) {
            today += 1;
        }
    });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    setText("superviseTotalCount", (orders || []).length);
    setText("superviseTodayCount", today);
    setText("superviseProcessingCount", processing);
    setText("supervisePendingCount", pending);
    setText("superviseDoneCount", done);
}

function renderSuperviseTable(orders) {
    const tbody = document.getElementById("superviseTableBody");
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="salary-empty-cell">未找到符合条件的订单</td></tr>`;
        return;
    }

    let html = "";
    orders.forEach((item) => {
        const taskReady = isSuperviseTaskReady(item);
        const startDateText = getSuperviseTaskStartDateStr(item);
        const statusText = getEffectiveSuperviseStatus(item);
        const statusClass = getSuperviseStatusClass(statusText);
        const amount = Number(item.price || item.amount || item.money || 0).toFixed(2);
        const requiredDays = getDurationDays(item.duration || "一天");
        const completedDays = getCompletedDays(item);
        const progressText = `${completedDays}/${requiredDays}天`;
        const todayStateText = getTodayDailyStateText(item);
        const ownerId = getOwnerIdValue(item);
        const ownerName = getOwnerNameValue(item);
        const hasOwner = hasMeaningfulValue(ownerId) || hasMeaningfulValue(ownerName);
        let actionHtml = `<span style="color:#64748b;">-</span>`;
        const calendarBtn = `<button type="button" onclick="openSuperviseCalendarModal('${item.id}')">监督日志</button>`;
        const calendarAndFinishBtn = `<button type="button" class="success" onclick="openSuperviseCalendarModal('${item.id}')">监督日志/完成</button>`;
        if (superviseIsStaff && statusText === "待接单" && !hasOwner && !taskReady) {
            actionHtml = `${calendarBtn}<span style="color:#64748b;font-size:12px;">${startDateText} 开始</span>`;
        } else if (superviseIsStaff && statusText === "待接单" && !hasOwner) {
            actionHtml = `${calendarBtn}<button type="button" class="warning" onclick="takeSuperviseTask('${item.id}')">接单</button>`;
        } else if (superviseIsStaff && ownerId === String(currentSuperviseUser?.id || "").trim() && statusText === "进行中") {
            actionHtml = calendarBtn;
        } else if ((superviseIsAdmin || ownerId === String(currentSuperviseUser?.id || "").trim()) && statusText === "进行中") {
            actionHtml = superviseIsAdmin ? calendarAndFinishBtn : calendarBtn;
        } else {
            actionHtml = calendarBtn;
        }

        html += `
            <tr>
                <td><input type="checkbox" class="supervise-checkbox" value="${item.id}"></td>
                <td>${item.orderno || "-"}</td>
                <td>${item.project || "-"}</td>
                <td>${item.duration || "-"}</td>
                <td>${item.studentname || "-"}</td>
                <td>${amount}</td>
                <td>${item.supervisor || "-"}</td>
                <td>${item.note || "-"}<div style="font-size:12px;color:#64748b;margin-top:4px;">进度：${progressText}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">今日：${todayStateText}</div></td>
                <td><span class="status-badge ${statusClass}">${statusText || "-"}</span></td>
                <td>${actionHtml}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function addSingleSuperviseTask() {
    if (!superviseIsAdmin) {
        alert("只有管理员可以添加监督任务");
        return;
    }
    const waketime = document.getElementById("svTaskTime")?.value;
    const orderno = document.getElementById("svOrderNo")?.value.trim();
    const project = document.getElementById("svProjectName")?.value.trim();
    const duration = document.getElementById("svDuration")?.value;
    const studentname = document.getElementById("svStudentName")?.value.trim();
    const inputPrice = parseFloat(document.getElementById("svPrice")?.value || "0");
    const supervisor = document.getElementById("svSupervisor")?.value;
    if (!waketime || !orderno || !project) {
        alert("请至少填写时间、订单号、项目");
        return;
    }
    const autoPrice = getAutoPriceByProjectAndDuration(project, duration || "一天");
    const finalPrice = autoPrice === "" ? (Number.isFinite(inputPrice) ? inputPrice : 0) : Number(autoPrice);
    const priceInput = document.getElementById("svPrice");
    if (priceInput && autoPrice !== "") {
        priceInput.value = Number(finalPrice).toFixed(2);
    }

    const newItem = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        waketime,
        phone: "",
        orderno,
        project,
        duration: getDurationTextForSave(duration || "一天"),
        studentname: studentname || "",
        price: Number.isFinite(finalPrice) ? finalPrice : 0,
        supervisor: supervisor || "",
        endtime: "",
        startdate: getDatePartFromDateTime(waketime) || getLocalDateString(),
        note: "文字监督",
        amount: Number.isFinite(finalPrice) ? finalPrice : 0,
        status: "待接单",
        serialnumber: null,
        staffid: "",
        staffname: "",
        salarysettled: false,
        submittime: new Date().toISOString()
    };
    const existing = await getSuperviseOrders();
    const merged = generateFixedSerial([...existing, newItem]);
    await saveSuperviseOrders(merged);
    const timeInput = document.getElementById("svTaskTime");
    if (timeInput) timeInput.value = getLocalDateTimeInputValue();
    loadSuperviseDashboard();
}

async function deleteSelectedSupervise() {
    const checked = Array.from(document.querySelectorAll(".supervise-checkbox:checked")).map((el) => String(el.value));
    if (checked.length === 0) return alert("请先勾选任务");
    const all = await getSuperviseOrders();
    const next = generateFixedSerial(all.filter((item) => !checked.includes(String(item.id))));
    await saveSuperviseOrders(next);
    loadSuperviseDashboard();
}

async function editSelectedSupervise() {
    const checked = Array.from(document.querySelectorAll(".supervise-checkbox:checked")).map((el) => String(el.value));
    if (checked.length !== 1) return alert("请仅勾选一条任务进行修改");
    const all = await getSuperviseOrders();
    const idx = all.findIndex((item) => String(item.id) === checked[0]);
    if (idx < 0) return;
    const row = all[idx];
    const newSupervisor = prompt("修改监督员：", row.supervisor || "");
    if (newSupervisor === null) return;
    row.supervisor = newSupervisor.trim();
    const next = generateFixedSerial(all);
    await saveSuperviseOrders(next);
    loadSuperviseDashboard();
}

async function takeSuperviseTask(id) {
    if (!superviseIsStaff) {
        alert("只有员工可以接单");
        return;
    }
    const all = await getSuperviseOrders();
    const row = all.find((item) => String(item.id) === String(id));
    if (!row) return;
    const statusText = getEffectiveSuperviseStatus(row);
    const ownerId = getOwnerIdValue(row);
    const ownerName = getOwnerNameValue(row);
    const hasOwner = hasMeaningfulValue(ownerId) || hasMeaningfulValue(ownerName);
    const myId = String(currentSuperviseUser?.id || "").trim();
    const hasOtherOwner = hasOwner && ownerId && ownerId !== myId;
    if (statusText !== "待接单" || hasOtherOwner) {
        alert("该任务已被接单");
        return;
    }
    if (!isSuperviseTaskReady(row)) {
        alert(`该任务为预约任务，需到 ${getSuperviseTaskStartDateStr(row)} 才能接单`);
        return;
    }
    row.status = "进行中";
    row.staffid = currentSuperviseUser?.id || "";
    row.staffname = currentSuperviseUser?.name || "";
    row.supervisor = currentSuperviseUser?.name || currentSuperviseUser?.id || row.supervisor || "";
    row.startdate = row.startdate || getDatePartFromDateTime(row.waketime) || getLocalDateString();
    row.dailylogs = row.dailylogs && typeof row.dailylogs === "object" ? row.dailylogs : {};
    const next = generateFixedSerial(all);
    await saveSuperviseOrders(next);
    loadSuperviseDashboard();
}

function renderSuperviseCalendar(taskId, targetMonthDate) {
    currentCalendarTaskId = String(taskId || "");
    const taskIdStr = currentCalendarTaskId;
    getSuperviseOrders().then((all) => {
        const row = all.find((it) => String(it.id) === taskIdStr);
        if (!row) return;

        const titleEl = document.getElementById("superviseCalendarTitle");
        if (titleEl) {
            titleEl.textContent = `监督日志 - ${row.orderno || "未知订单"}`;
        }

        const baseDate = targetMonthDate || parseDateOnlyToLocal(row.startdate) || new Date(row.submittime || Date.now());
        currentCalendarMonthCursor = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        const monthLabel = document.getElementById("superviseCalendarMonthLabel");
        if (monthLabel) {
            monthLabel.textContent = `${currentCalendarMonthCursor.getFullYear()}年${String(currentCalendarMonthCursor.getMonth() + 1).padStart(2, "0")}月`;
        }

        const grid = document.getElementById("superviseCalendarGrid");
        if (!grid) return;
        const todayStr = getLocalDateString();
        if (superviseIsStaff) {
            selectedLogDate = todayStr;
        }
        const dailyLogs = getDailyLogs(row);
        const expectedDates = getExpectedDateSet(row);
        const monthStart = new Date(currentCalendarMonthCursor.getFullYear(), currentCalendarMonthCursor.getMonth(), 1);
        const monthEnd = new Date(currentCalendarMonthCursor.getFullYear(), currentCalendarMonthCursor.getMonth() + 1, 0);
        const firstWeekday = monthStart.getDay();
        const daysInMonth = monthEnd.getDate();

        let html = "";
        ["日", "一", "二", "三", "四", "五", "六"].forEach((w) => {
            html += `<div class="sv-cal-weekday">${w}</div>`;
        });
        for (let i = 0; i < firstWeekday; i += 1) {
            html += `<div class="sv-cal-day is-empty"></div>`;
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
            const key = getLocalDateString(d);
            const log = dailyLogs[key];
            let mark = "";
            if (log && log.passed === true) {
                mark = "✅";
            } else if (log && log.passed === false) {
                mark = "❌";
            } else if (expectedDates.has(key)) {
                mark = "⭕";
            }
            const todayClass = key === todayStr ? "today" : "";
            const selectedClass = key === selectedLogDate ? "selected" : "";
            html += `<div class="sv-cal-day ${todayClass} ${selectedClass}" data-date="${key}"><div class="num">${day}</div><div class="mark">${mark}</div></div>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll(".sv-cal-day[data-date]").forEach((el) => {
            el.addEventListener("click", () => {
                if (superviseIsStaff) {
                    selectedLogDate = todayStr;
                    const hintOnlyToday = document.getElementById("svSelectedDateHint");
                    if (hintOnlyToday) hintOnlyToday.textContent = `当前日期（仅当天可提交）：${todayStr}`;
                    return;
                }
                selectedLogDate = String(el.getAttribute("data-date") || "");
                renderSuperviseCalendar(taskIdStr, currentCalendarMonthCursor);
                const hint = document.getElementById("svSelectedDateHint");
                if (hint) hint.textContent = `当前选中日期：${selectedLogDate || "--"}`;
            });
        });
        const hint = document.getElementById("svSelectedDateHint");
        if (hint) {
            hint.textContent = superviseIsStaff
                ? `当前日期（仅当天可提交）：${selectedLogDate || "--"}`
                : `当前选中日期：${selectedLogDate || "--"}`;
        }
    });
}

async function openSuperviseCalendarModal(taskId) {
    currentCalendarTaskId = String(taskId || "");
    const all = await getSuperviseOrders();
    const row = all.find((it) => String(it.id) === currentCalendarTaskId);
    if (!row) return;
    const input = document.getElementById("calendarSuperviseImage");
    const preview = document.getElementById("calendarSupervisePreview");
    const result = document.getElementById("calendarSuperviseAiResult");
    const manualActions = document.getElementById("superviseManualActions");
    const taskFinishAction = document.getElementById("superviseTaskFinishAction");
    if (manualActions) manualActions.style.display = superviseIsAdmin ? "flex" : "none";
    if (taskFinishAction) taskFinishAction.style.display = superviseIsAdmin ? "inline-flex" : "none";
    if (input) input.value = "";
    if (preview) {
        preview.style.display = "none";
        preview.src = "";
    }
    if (result) {
        result.textContent = superviseIsAdmin
            ? "管理员可直接对选中日期进行人工判定（完成/未完成）"
            : "选择日期并上传后，点击AI识别并提交";
    }
    const startDate = parseDateOnlyToLocal(row.startdate) || new Date(row.submittime || Date.now());
    selectedLogDate = getLocalDateString();
    renderSuperviseCalendar(currentCalendarTaskId, startDate);

    const modal = document.getElementById("superviseCalendarModal");
    if (modal) modal.style.display = "flex";
}

function changeSuperviseCalendarMonth(step) {
    if (!currentCalendarTaskId || !currentCalendarMonthCursor) return;
    const nextMonth = new Date(currentCalendarMonthCursor.getFullYear(), currentCalendarMonthCursor.getMonth() + Number(step || 0), 1);
    renderSuperviseCalendar(currentCalendarTaskId, nextMonth);
}

function closeSuperviseCalendarModal() {
    const modal = document.getElementById("superviseCalendarModal");
    if (modal) modal.style.display = "none";
    currentCalendarTaskId = "";
    currentCalendarMonthCursor = null;
    selectedLogDate = "";
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function extractJsonObjectFromAiContent(raw) {
    const t = String(raw || "").trim();
    const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const body = fenced ? fenced[1].trim() : t;
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    const jsonText = first >= 0 && last > first ? body.slice(first, last + 1) : body;
    return JSON.parse(jsonText);
}

async function submitDailySuperviseWithAI() {
    if (!currentCalendarTaskId) return;
    const input = document.getElementById("calendarSuperviseImage");
    const result = document.getElementById("calendarSuperviseAiResult");
    const file = input?.files?.[0];
    if (!file) {
        if (result) result.textContent = "请先选择截图";
        return;
    }
    if (result) result.textContent = "AI识别中，请稍候...";

    try {
        const imageDataUrl = await fileToDataUrl(file);
        const today = getLocalDateString();
        const targetDate = superviseIsStaff ? today : (selectedLogDate || today);
        const aiPrompt = `请判断这张监督截图是否能证明用户在日期（${targetDate}）完成了监督任务。仅返回JSON对象：{"passed":true或false,"reason":"简短原因"}`;
        const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer bb956b2870b346a39c34b3344a61defb.IOTprsN1opphPYp8"
            },
            body: JSON.stringify({
                model: "glm-4v-flash",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: aiPrompt },
                            { type: "image_url", image_url: { url: imageDataUrl } }
                        ]
                    }
                ],
                temperature: 0.1
            })
        });
        const data = await resp.json();
        if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        const raw = data?.choices?.[0]?.message?.content || "{}";
        const parsed = extractJsonObjectFromAiContent(raw);
        const passed = parsed?.passed === true;
        const reason = String(parsed?.reason || "").trim() || (passed ? "AI判定已完成" : "AI判定未完成");

        const all = await getSuperviseOrders();
        const row = all.find((item) => String(item.id) === currentCalendarTaskId);
        if (!row) throw new Error("任务不存在");
        row.dailylogs = row.dailylogs && typeof row.dailylogs === "object" ? row.dailylogs : {};
        if (superviseIsStaff) {
            const startDate = parseDateOnlyToLocal(row.startdate || getDatePartFromDateTime(row.waketime));
            const todayDate = parseDateOnlyToLocal(today);
            if (startDate && todayDate && todayDate < startDate) {
                throw new Error(`该预约单从 ${row.startdate || getDatePartFromDateTime(row.waketime)} 开始监督，今天还不能提交`);
            }
        }
        if (superviseIsStaff && row.dailylogs[targetDate] && row.dailylogs[targetDate].passed === true) {
            throw new Error("今日已提交并通过，无需重复提交");
        }
        row.dailylogs[targetDate] = {
            passed,
            reason,
            submittedat: new Date().toISOString(),
            by: currentSuperviseUser?.id || ""
        };
        updateSuperviseTaskStatusByLogs(row);
        const next = generateFixedSerial(all);
        await saveSuperviseOrders(next);

        if (result) {
            result.textContent = passed
                ? `AI判定：今日已完成（${reason}）`
                : `AI判定：今日未完成（${reason}）`;
        }
        renderSuperviseCalendar(currentCalendarTaskId, currentCalendarMonthCursor || new Date());
        loadSuperviseDashboard();
    } catch (e) {
        if (result) result.textContent = `识别失败：${e.message}`;
    }
}

async function markSuperviseDailyByAdmin(passed) {
    if (!superviseIsAdmin) {
        alert("只有管理员可以人工判定");
        return;
    }
    if (!currentCalendarTaskId) return;
    const targetDate = String(selectedLogDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        alert("请先在日历中选择日期");
        return;
    }
    const result = document.getElementById("calendarSuperviseAiResult");
    const all = await getSuperviseOrders();
    const row = all.find((item) => String(item.id) === currentCalendarTaskId);
    if (!row) {
        if (result) result.textContent = "操作失败：任务不存在";
        return;
    }
    const expectedDates = getExpectedDateSet(row);
    if (!expectedDates.has(targetDate)) {
        alert("该日期不在监督周期内，无法判定");
        return;
    }
    row.dailylogs = row.dailylogs && typeof row.dailylogs === "object" ? row.dailylogs : {};
    row.dailylogs[targetDate] = {
        passed: passed === true,
        reason: passed ? "管理员人工判定：完成" : "管理员人工判定：未完成",
        submittedat: new Date().toISOString(),
        by: currentSuperviseUser?.id || "",
        source: "admin_manual"
    };
    updateSuperviseTaskStatusByLogs(row);
    const next = generateFixedSerial(all);
    await saveSuperviseOrders(next);
    if (result) {
        result.textContent = passed
            ? `已人工判定 ${targetDate}：完成`
            : `已人工判定 ${targetDate}：未完成`;
    }
    renderSuperviseCalendar(currentCalendarTaskId, currentCalendarMonthCursor || new Date());
    loadSuperviseDashboard();
}

async function finishSuperviseTask(id) {
    const all = await getSuperviseOrders();
    const row = all.find((item) => String(item.id) === String(id));
    if (!row) return;
    if (!superviseIsAdmin && String(row.staffid || "").trim() !== String(currentSuperviseUser?.id || "").trim()) {
        alert("只能完成自己接单的任务");
        return;
    }
    row.status = "已完成";
    const next = generateFixedSerial(all);
    await saveSuperviseOrders(next);
    loadSuperviseDashboard();
}

async function loadSuperviseDashboard() {
    const loadingEl = document.getElementById("superviseLoadingIndicator");
    if (loadingEl) loadingEl.style.display = "flex";
    try {
        const allOrders = await getSuperviseOrders();
        let ordered = [...allOrders].sort((a, b) => {
            const ta = new Date(a.submittime).getTime() || 0;
            const tb = new Date(b.submittime).getTime() || 0;
            return tb - ta;
        });
        if (superviseIsStaff) {
            const myId = String(currentSuperviseUser?.id || "").trim();
            ordered = ordered.filter((item) => {
                const statusText = getEffectiveSuperviseStatus(item);
                const ownerId = String(item.staffid || "").trim();
                const isMine = ownerId === myId;
                const canTakeNow = statusText === "待接单" && isSuperviseTaskReady(item);
                return canTakeNow || isMine;
            });
        }

        const filters = getSuperviseFilters();
        const filtered = applySuperviseFilters(ordered, filters);

        renderSuperviseSummary(filtered);
        renderSuperviseTable(filtered);
    } catch (error) {
        console.error("加载监督页面失败：", error);
        const tbody = document.getElementById("superviseTableBody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="salary-empty-cell">监督页面加载失败，请稍后重试</td></tr>`;
        }
    } finally {
        if (loadingEl) loadingEl.style.display = "none";
    }
}

function resetSuperviseFilters() {
    const keyword = document.getElementById("superviseSearchInput");
    const status = document.getElementById("superviseStatusFilter");
    const date = document.getElementById("superviseDateFilter");
    if (keyword) keyword.value = "";
    if (status) status.value = "all";
    if (date) date.value = "";
    loadSuperviseDashboard();
}

window.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("superviseSearchInput");
    if (searchInput) {
        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                loadSuperviseDashboard();
            }
        });
    }
    getStaffList().then((staffList) => {
        const select = document.getElementById("svSupervisor");
        if (!select) return;
        (staffList || []).forEach((staff) => {
            const op = document.createElement("option");
            op.value = staff.name || staff.id;
            op.textContent = staff.name || staff.id;
            select.appendChild(op);
        });
        if (superviseIsStaff) {
            select.value = currentSuperviseUser?.name || currentSuperviseUser?.id || "";
            select.disabled = true;
        }
    });
    const timeInput = document.getElementById("svTaskTime");
    if (timeInput && !timeInput.value) {
        timeInput.value = getLocalDateTimeInputValue();
    }
    const projectSelect = document.getElementById("svProjectName");
    const durationSelect = document.getElementById("svDuration");
    if (projectSelect) {
        projectSelect.addEventListener("change", updateAutoSupervisePrice);
    }
    if (durationSelect) {
        durationSelect.addEventListener("change", () => {
            if (durationSelect.value === "其他时间") {
                openCustomDurationModal();
                return;
            }
            lastDurationValue = durationSelect.value;
            updateAutoSupervisePrice();
        });
    }
    const dailyInput = document.getElementById("calendarSuperviseImage");
    if (dailyInput) {
        dailyInput.addEventListener("change", async () => {
            const file = dailyInput.files?.[0];
            const preview = document.getElementById("calendarSupervisePreview");
            if (!file || !preview) return;
            preview.src = await fileToDataUrl(file);
            preview.style.display = "block";
        });
    }
    const taskForm = document.querySelector(".supervise-task-form");
    if (taskForm && !superviseIsAdmin) {
        taskForm.style.display = "none";
    }
    if (superviseIsStaff) {
        const summarySection = document.getElementById("superviseSummarySection");
        const taskSection = document.getElementById("superviseTaskFormSection");
        const batchSection = document.getElementById("superviseBatchSection");
        const batchActions = document.getElementById("superviseBatchActions");
        if (summarySection) summarySection.style.display = "none";
        if (taskSection) taskSection.style.display = "none";
        if (batchSection) batchSection.style.display = "none";
        if (batchActions) batchActions.style.display = "none";
    }
    updateAutoSupervisePrice();
    loadSuperviseDashboard();
});
