// 检查登录状态，如果未登录则跳转到登录页
(function checkLoginStatus() {
    const user = JSON.parse(localStorage.getItem("loginUser"));
    if (!user) {
        window.location.href = "index.html";
    }
})();

// 亮度调节功能 - 弹出面板版本
(function initBrightness() {
    const brightnessBtn = document.getElementById('brightnessBtn');
    const brightnessPopup = document.getElementById('brightnessPopup');
    const slider = document.getElementById('brightnessSliderPopup');
    const valueDisplay = document.getElementById('brightnessValuePopup');

    // 读取保存的亮度设置
    const savedBrightness = localStorage.getItem('brightness');
    if (savedBrightness) {
        const brightness = parseInt(savedBrightness);
        slider.value = brightness;
        valueDisplay.textContent = brightness + '%';
        applyBrightness(brightness);
    }

    // 点击按钮切换弹出面板
    brightnessBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        brightnessPopup.classList.toggle('show');
    });

    // 点击页面其他地方关闭弹出面板
    document.addEventListener('click', function (e) {
        if (!brightnessPopup.contains(e.target) && e.target !== brightnessBtn) {
            brightnessPopup.classList.remove('show');
        }
    });

    // 监听滑块变化
    slider.addEventListener('input', function () {
        const brightness = this.value;
        valueDisplay.textContent = brightness + '%';
        applyBrightness(brightness);
        localStorage.setItem('brightness', brightness);
    });
})();

function applyBrightness(percentage) {
    const brightness = percentage / 100;
    document.body.style.filter = `brightness(${brightness})`;
}

// 基础配置与用户信息
function initUser() {
    const staffList = JSON.parse(localStorage.getItem("staffList") || "[]");
    const testUsers = {
        admin: { id: "admin001", name: "管理员", role: "admin" }
    };
    staffList.forEach(staff => {
        testUsers[staff.id] = {
            id: staff.id,
            name: staff.name,
            role: "staff",
            password: staff.password
        };
    });

    let user = JSON.parse(localStorage.getItem("loginUser"));
    if (!user) {
        localStorage.setItem("loginUser", JSON.stringify(testUsers.admin));
        user = testUsers.admin;
    }

    return { user, allUsers: testUsers };
}

let currentPage = "home";
let lastNoticePopupSignature = "";
const HOME_PENDING_STORAGE_KEY = "homePendingOrders";
const SUPERVISE_META_PREFIX = "[SVMETA]";

const { user, allUsers } = initUser();
const isAdmin = user.role === "admin";
const isStaff = user.role === "staff";
document.body.classList.toggle("is-staff", isStaff);
document.body.classList.toggle("is-admin", isAdmin);
const mobileMQ = window.matchMedia("(max-width: 768px)");
function applyMobileFlag() {
    const isMobile = mobileMQ.matches;
    document.body.classList.toggle("is-mobile", isMobile);
    // 强制应用移动端样式类，确保即使在移动端也能正确显示
    if (isMobile) {
        document.body.classList.add("is-mobile");
    } else {
        document.body.classList.remove("is-mobile");
    }
}
applyMobileFlag();
if (mobileMQ.addEventListener) {
    mobileMQ.addEventListener("change", () => {
        applyMobileFlag();
        // 仅在叫醒页时重绘，避免不必要的刷新
        if (currentPage === "wake") loadOrders();
    });
} else if (mobileMQ.addListener) {
    mobileMQ.addListener(() => {
        applyMobileFlag();
        if (currentPage === "wake") loadOrders();
    });
}

// 初始化时强制检查并应用移动端状态
document.body.classList.toggle("is-staff", isStaff);
document.getElementById("userName").innerText = user.name;
const teamUserNameEl = document.getElementById("teamUserName");
if (teamUserNameEl) {
    teamUserNameEl.innerText = user.name;
}

// 设置导航栏文本：员工显示"个人中心"，管理员显示"团队管理"
const navTeamText = document.getElementById("navTeamText");
if (navTeamText) {
    navTeamText.innerText = isAdmin ? "团队管理" : "个人中心";
}

// 管理员入口尽早展示，避免等待 window.onload 导致菜单延迟出现
if (isAdmin) {
    const noticeSettingNav = document.getElementById("nav-notice-setting");
    if (noticeSettingNav) {
        noticeSettingNav.style.display = "flex";
    }
}

let parsedBatchOrders = [];
let originalOrders = [];

// 轻提示 Toast（替代 alert）
let toastTimer = null;
function renderLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

// 首屏尽早渲染静态图标，避免等到 window.onload 才显示
renderLucideIcons();

function showToast(message, type = "info") {
    const el = document.getElementById("toast");
    if (!el) return;

    el.textContent = message;
    el.classList.remove("show", "info", "success", "warning", "danger");
    el.classList.add("show", type);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 1800);
}

function logout() {
    if (!confirm("确定要退出登录吗？")) return;
    try {
        localStorage.removeItem("loginUser");
        localStorage.removeItem("staffList");
        // 不清除savedUid和savedPwd，这样下次还能记住账号密码
    } catch (e) {
        console.error(e);
    }
    window.location.href = "index.html";
}

function showPage(page) {
    if (!document.getElementById(`page_${page}`)) {
        page = "home";
    }
    currentPage = page;
    // 切换页面时自动收起下拉，避免遮挡底部导航点击
    closeSubMenu();

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(`page_${page}`).classList.add("active");

    document.querySelectorAll(".nav-item, .sub-item").forEach(el => el.classList.remove("active"));

    // 显示当前页面的公告（管理员和员工都显示）
    showPageNoticeOnPage(page);
    // 点击页面时统一检查是否需要弹出公告（已读逻辑保持不变）
    checkAndShowPageNotice(page);

    if (page === "team") {
        document.getElementById("nav-team").classList.add("active");
        const teamUserNameNode = document.getElementById("teamUserName");
        if (teamUserNameNode) {
            teamUserNameNode.innerText = user.name;
        }
        const teamPageTitle = document.getElementById("teamPageTitle");

        if (isAdmin) {
            if (teamPageTitle) {
                teamPageTitle.innerText = "团队管理";
            }
            document.getElementById("teamManagerArea").style.display = "block";
            document.getElementById("staffProfileArea").style.display = "none";
            renderTeamTable();
        } else {
            if (teamPageTitle) {
                teamPageTitle.innerText = "个人中心";
            }
            document.getElementById("teamManagerArea").style.display = "none";
            document.getElementById("staffProfileArea").style.display = "block";
            renderProfilePage();
        }
    } else if (page === "home") {
        document.getElementById("nav-home").classList.add("active");
        loadHomeOrderSummary();
        loadHomePendingPanel();
    } else if (page === "wake") {
        document.getElementById("nav-taobao").classList.add("active");
        document.getElementById("sub-wake").classList.add("active");
        // 根据用户角色更新页面标题
        const wakePageTitle = document.getElementById("wakePageTitle");
        if (wakePageTitle) {
            wakePageTitle.innerText = isStaff ? "接单大厅" : "叫醒订单管理";
        }
        loadOrders();
    } else if (page === "noticeSetting") {
        document.getElementById("nav-notice-setting").classList.add("active");
        const noticeSettingUserName = document.getElementById("noticeSettingUserName");
        if (noticeSettingUserName) {
            noticeSettingUserName.innerText = user.name;
        }
        // 刷新公告预览
        loadNoticeSettingsPreview();
    }
}

function getDatePartFromDateTime(value) {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
}

function getSuperviseEffectiveStatusForHome(row) {
    const raw = String(row?.status || "").trim();
    if (raw === "已完成") return "已完成";
    const hasOwner = String(row?.staffid || "").trim() || String(row?.supervisor || row?.staffname || "").trim();
    return hasOwner ? "进行中" : "待接单";
}

function getSuperviseTodayKeyForHome(row) {
    const fromStartDate = String(row?.startdate || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromStartDate)) return fromStartDate;
    const fromWakeTime = getDatePartFromDateTime(row?.waketime);
    if (fromWakeTime) return fromWakeTime;
    const fromSubmit = getDatePartFromDateTime(row?.submittime);
    return fromSubmit;
}

async function getSuperviseOrdersForHomeSummary() {
    try {
        const { data, error } = await supabaseClient
            .from("supervise_orders")
            .select("*");
        if (!error && Array.isArray(data)) return data.map(parseSuperviseOrderMeta);
    } catch (e) {
        console.error("首页读取监督订单失败：", e);
    }
    const localOrders = JSON.parse(localStorage.getItem("superviseOrders") || "[]");
    return Array.isArray(localOrders) ? localOrders.map(parseSuperviseOrderMeta) : [];
}

async function loadHomeOrderSummary() {
    const section = document.getElementById("homeSummarySection");
    if (section) {
        section.style.display = isAdmin ? "block" : "none";
    }
    if (!isAdmin) return;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };

    try {
        const [wakeOrders, superviseOrders] = await Promise.all([
            getOrders(),
            getSuperviseOrdersForHomeSummary()
        ]);

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        let pending = 0;
        let processing = 0;
        let done = 0;
        let today = 0;

        (wakeOrders || []).forEach((item) => {
            const st = String(item?.status || "").trim();
            if (st === "待接单") pending += 1;
            else if (st === "进行中") processing += 1;
            else if (st === "已完成") done += 1;

            const submitDate = new Date(item?.submittime || "");
            if (submitDate >= todayStart && submitDate < todayEnd) {
                today += 1;
            }
        });

        (superviseOrders || []).forEach((item) => {
            const st = getSuperviseEffectiveStatusForHome(item);
            if (st === "待接单") pending += 1;
            else if (st === "进行中") processing += 1;
            else if (st === "已完成") done += 1;

            if (getSuperviseTodayKeyForHome(item) === todayKey) {
                today += 1;
            }
        });

        const total = (wakeOrders || []).length + (superviseOrders || []).length;
        setText("homeTotalCount", total);
        setText("homeTodayCount", today);
        setText("homeProcessingCount", processing);
        setText("homePendingCount", pending);
        setText("homeDoneCount", done);
    } catch (error) {
        console.error("加载首页订单统计失败：", error);
        setText("homeTotalCount", 0);
        setText("homeTodayCount", 0);
        setText("homeProcessingCount", 0);
        setText("homePendingCount", 0);
        setText("homeDoneCount", 0);
    }
}

function readHomePendingItems() {
    try {
        const arr = JSON.parse(localStorage.getItem(HOME_PENDING_STORAGE_KEY) || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function saveHomePendingItems(items) {
    localStorage.setItem(HOME_PENDING_STORAGE_KEY, JSON.stringify(items || []));
}

function getPendingStatusText(done) {
    return done ? "已处理" : "待处理";
}

function getPendingStatusColors(done) {
    return done
        ? { bg: "#dcfce7", color: "#166534" }
        : { bg: "#fef3c7", color: "#92400e" };
}

function getPendingActionText(item) {
    if (item?.decision === "approved") return "已同意";
    if (item?.decision === "rejected") return "已驳回";
    return getPendingStatusText(item?.done === true);
}

function loadHomePendingPanel() {
    const section = document.getElementById("homePendingSection");
    const listEl = document.getElementById("homePendingList");
    const statsEl = document.getElementById("homePendingStats");
    if (!section || !listEl || !statsEl) return;

    section.style.display = isAdmin ? "flex" : "none";
    if (!isAdmin) return;

    const items = readHomePendingItems().sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime() || 0;
        const tb = new Date(b.createdAt || 0).getTime() || 0;
        return tb - ta;
    });
    const pendingCount = items.filter((x) => x.done !== true).length;
    statsEl.textContent = `待处理 ${pendingCount} 条 ｜ 全部 ${items.length} 条`;

    if (items.length === 0) {
        listEl.innerHTML = `<div style="font-size:13px;color:#94a3b8;">暂无待处理事项，可先录入员工反馈（例如请假申请）。</div>`;
        return;
    }

    let html = "";
    items.forEach((item) => {
        const done = item.done === true;
        const st = getPendingStatusColors(done);
        const timeText = typeof formatTime === "function"
            ? formatTime(item.createdAt || "")
            : String(item.createdAt || "-");
        const safeRef = String(item.orderRef || "-");
        const safeSource = String(item.source || "-");
        const safeType = String(item.type || "其他反馈");
        const safeDesc = String(item.desc || "-");
        const isLeaveRequest = String(item?.kind || "") === "supervise_leave";
        const pendingApproveActions = isLeaveRequest && !done
            ? `
                    <button type="button" class="success" onclick="approveHomePendingItem('${item.id}')">同意</button>
                    <button type="button" class="warning" onclick="rejectHomePendingItem('${item.id}')">驳回</button>
              `
            : `
                    <button type="button" class="${done ? "ghost" : "success"}" onclick="toggleHomePendingDone('${item.id}')">${done ? "改回待处理" : "标记已处理"}</button>
              `;
        html += `
            <div style="padding:14px;border:1px solid rgba(148,163,184,.25);border-radius:10px;margin-bottom:10px;background:#f8fafc;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="font-size:15px;font-weight:600;color:#334155;line-height:1.4;">${safeType}</div>
                    <span style="font-size:13px;padding:3px 10px;border-radius:999px;background:${st.bg};color:${st.color};">${getPendingActionText(item)}</span>
                </div>
                <div style="font-size:15px;color:#1e293b;margin-bottom:6px;line-height:1.45;">${safeDesc}</div>
                <div style="font-size:13px;color:#64748b;line-height:1.45;">关联：${safeRef} ｜ 反馈：${safeSource} ｜ 提交：${timeText}</div>
                <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    ${pendingApproveActions}
                    <button type="button" class="danger" onclick="removeHomePendingItem('${item.id}')">删除</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function addHomePendingItem() {
    if (!isAdmin) return;
    const typeEl = document.getElementById("pendingTypeInput");
    const refEl = document.getElementById("pendingOrderRefInput");
    const sourceEl = document.getElementById("pendingSourceInput");
    const descEl = document.getElementById("pendingDescInput");
    const type = String(typeEl?.value || "其他反馈").trim();
    const orderRef = String(refEl?.value || "").trim();
    const source = String(sourceEl?.value || "").trim();
    const desc = String(descEl?.value || "").trim();
    if (!desc) {
        showToast("请填写待处理说明", "warning");
        return;
    }
    const items = readHomePendingItems();
    items.push({
        id: `${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        type,
        orderRef,
        source,
        desc,
        done: false,
        createdAt: new Date().toISOString()
    });
    saveHomePendingItems(items);
    if (refEl) refEl.value = "";
    if (sourceEl) sourceEl.value = "";
    if (descEl) descEl.value = "";
    loadHomePendingPanel();
    showToast("已加入待处理列表", "success");
}

function toggleHomePendingDone(id) {
    if (!isAdmin) return;
    const items = readHomePendingItems();
    const row = items.find((x) => String(x.id) === String(id));
    if (!row) return;
    row.done = row.done !== true;
    saveHomePendingItems(items);
    loadHomePendingPanel();
}

function removeHomePendingItem(id) {
    if (!isAdmin) return;
    const items = readHomePendingItems();
    const next = items.filter((x) => String(x.id) !== String(id));
    saveHomePendingItems(next);
    loadHomePendingPanel();
}

function parseSuperviseOrderMeta(row) {
    const rawNote = String(row?.note || "");
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
        ...row,
        note: cleanNote || "-",
        orderno: meta.orderno || row?.orderno || "",
        project: meta.project || row?.project || "",
        duration: meta.duration || row?.duration || "",
        studentname: meta.studentname || row?.studentname || "",
        price: Number(meta.price || row.amount || 0),
        supervisor: meta.supervisor || row.supervisor || "",
        endtime: meta.endtime || "",
        startdate: meta.startdate || "",
        dailylogs: meta.dailylogs && typeof meta.dailylogs === "object" ? meta.dailylogs : {}
    };
}

function buildSuperviseOrderNote(row) {
    const textNote = String(row.note || "").replace(`${SUPERVISE_META_PREFIX}`, "");
    const meta = {
        orderno: row.orderno || "",
        project: row.project || "",
        duration: row.duration || "",
        studentname: row.studentname || "",
        price: Number(row.price || row.amount || 0),
        supervisor: row.supervisor || "",
        endtime: row.endtime || "",
        startdate: row.startdate || "",
        dailylogs: row.dailylogs || {}
    };
    return `${textNote}\n${SUPERVISE_META_PREFIX}${JSON.stringify(meta)}`;
}

async function applySuperviseLeaveRequest(item) {
    const payload = item?.payload || {};
    if (String(payload.kind || "") !== "supervise_leave") return;
    const orderId = String(payload.orderId || "").trim();
    const targetDate = String(payload.date || "").trim();
    const leaveType = String(payload.leaveType || "").trim();
    if (!orderId || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        throw new Error("请假申请缺少订单或日期");
    }
    if (leaveType !== "sleep" && leaveType !== "wake") {
        throw new Error("请假申请类型无效");
    }

    const { data, error } = await supabaseClient
        .from("supervise_orders")
        .select("*")
        .eq("id", orderId)
        .single();
    if (error || !data) {
        throw new Error("读取监督订单失败");
    }
    const row = parseSuperviseOrderMeta(data);
    row.dailylogs = row.dailylogs && typeof row.dailylogs === "object" ? row.dailylogs : {};
    const existing = row.dailylogs[targetDate] && typeof row.dailylogs[targetDate] === "object"
        ? row.dailylogs[targetDate]
        : {};
    const leave = existing.leave && typeof existing.leave === "object" ? { ...existing.leave } : {};
    if (leaveType === "sleep") leave.sleep = true;
    if (leaveType === "wake") leave.wake = true;
    row.dailylogs[targetDate] = {
        ...existing,
        leave,
        reason: `${leave.sleep ? "早睡请假" : "早睡正常"}，${leave.wake ? "早起请假" : "早起正常"}（管理员审批）`
    };
    const patchedNote = buildSuperviseOrderNote(row);
    const { error: updateError } = await supabaseClient
        .from("supervise_orders")
        .update({ note: patchedNote })
        .eq("id", orderId);
    if (updateError) {
        throw new Error("写入监督订单失败");
    }

    const local = JSON.parse(localStorage.getItem("superviseOrders") || "[]");
    if (Array.isArray(local)) {
        const idx = local.findIndex((x) => String(x.id) === orderId);
        if (idx >= 0) {
            local[idx] = { ...local[idx], dailylogs: row.dailylogs };
            localStorage.setItem("superviseOrders", JSON.stringify(local));
        }
    }
}

async function approveHomePendingItem(id) {
    if (!isAdmin) return;
    const items = readHomePendingItems();
    const row = items.find((x) => String(x.id) === String(id));
    if (!row || row.done === true) return;
    try {
        if (String(row.kind || "") === "supervise_leave") {
            await applySuperviseLeaveRequest(row);
        }
        row.done = true;
        row.decision = "approved";
        row.processedAt = new Date().toISOString();
        row.processedBy = user?.id || "admin";
        saveHomePendingItems(items);
        loadHomePendingPanel();
        showToast("已同意并同步到监督订单", "success");
    } catch (e) {
        showToast(`同意失败：${e.message || e}`, "danger");
    }
}

function rejectHomePendingItem(id) {
    if (!isAdmin) return;
    const items = readHomePendingItems();
    const row = items.find((x) => String(x.id) === String(id));
    if (!row || row.done === true) return;
    row.done = true;
    row.decision = "rejected";
    row.processedAt = new Date().toISOString();
    row.processedBy = user?.id || "admin";
    saveHomePendingItems(items);
    loadHomePendingPanel();
    showToast("已驳回该申请", "success");
}

function getHomeOrderTypeLabel(type) {
    return type === "supervise" ? "监督" : "叫醒";
}

function getHomeOrderDisplayTime(item) {
    if (item.orderType === "supervise") {
        return item.startdate || getDatePartFromDateTime(item.waketime) || getDatePartFromDateTime(item.submittime) || "-";
    }
    if (typeof formatWakeTimeForDisplay === "function") {
        return formatWakeTimeForDisplay(item.waketime);
    }
    return String(item.waketime || "-");
}

function getHomeOrderDisplayMainText(item) {
    if (item.orderType === "supervise") {
        return `${item.orderno || "-"}｜${item.project || "-"}｜${item.studentname || "-"}`;
    }
    return `${item.phone || "-"}｜${item.note || "-"}`;
}

async function getAllHomeOrders() {
    const [wakeOrders, superviseOrders] = await Promise.all([
        getOrders(),
        getSuperviseOrdersForHomeSummary()
    ]);
    const wake = (wakeOrders || []).map((item) => ({
        ...item,
        orderType: "wake",
        effectiveStatus: String(item?.status || "").trim(),
        todayKey: getDatePartFromDateTime(item?.submittime)
    }));
    const supervise = (superviseOrders || []).map((item) => ({
        ...item,
        orderType: "supervise",
        effectiveStatus: getSuperviseEffectiveStatusForHome(item),
        todayKey: getSuperviseTodayKeyForHome(item)
    }));
    return [...wake, ...supervise].sort((a, b) => {
        const ta = new Date(a.submittime || a.waketime || 0).getTime() || 0;
        const tb = new Date(b.submittime || b.waketime || 0).getTime() || 0;
        return tb - ta;
    });
}

function matchHomeOrderFilter(item, filterType, todayKey) {
    if (filterType === "all") return true;
    if (filterType === "today") return String(item.todayKey || "") === todayKey;
    if (filterType === "processing") return item.effectiveStatus === "进行中";
    if (filterType === "pending") return item.effectiveStatus === "待接单";
    if (filterType === "done") return item.effectiveStatus === "已完成";
    return true;
}

async function openHomeOrderDetail(filterType) {
    if (!isAdmin) return;
    const titleMap = {
        all: "订单总数详情",
        today: "今日订单详情",
        processing: "进行中订单详情",
        pending: "待接单订单详情",
        done: "已完成订单详情"
    };
    const titleEl = document.getElementById("homeOrderDetailTitle");
    const countEl = document.getElementById("homeOrderDetailCount");
    const listEl = document.getElementById("homeOrderDetailList");
    const modal = document.getElementById("homeOrderDetailModal");
    if (!listEl || !modal) return;

    if (titleEl) titleEl.textContent = titleMap[filterType] || "订单详情";
    listEl.innerHTML = `<div style="font-size:13px;color:#64748b;">加载中...</div>`;
    modal.style.display = "flex";

    try {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const all = await getAllHomeOrders();
        const rows = all.filter((item) => matchHomeOrderFilter(item, filterType, todayKey));
        if (countEl) countEl.textContent = `共 ${rows.length} 条`;

        if (rows.length === 0) {
            listEl.innerHTML = `<div style="font-size:13px;color:#94a3b8;padding:10px 0;">暂无符合条件的订单</div>`;
            return;
        }

        let html = "";
        rows.forEach((item) => {
            const status = item.effectiveStatus || "-";
            const statusBg = status === "已完成" ? "#dcfce7" : status === "待接单" ? "#fef3c7" : "#dbeafe";
            const statusColor = status === "已完成" ? "#166534" : status === "待接单" ? "#92400e" : "#1e40af";
            const submitText = typeof formatTime === "function"
                ? formatTime(item.submittime || item.waketime || "")
                : String(item.submittime || item.waketime || "-");
            const jumpPayload = buildHomeOrderJumpPayload(item);
            html += `
                <div style="padding:12px;border:1px solid rgba(148,163,184,.25);border-radius:10px;margin-bottom:10px;background:#f8fafc;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                        <div style="font-size:13px;font-weight:600;color:#334155;">${getHomeOrderTypeLabel(item.orderType)}订单</div>
                        <span style="font-size:12px;padding:2px 8px;border-radius:999px;background:${statusBg};color:${statusColor};">${status}</span>
                    </div>
                    <div style="font-size:13px;color:#1e293b;margin-bottom:4px;">${getHomeOrderDisplayMainText(item)}</div>
                    <div style="font-size:12px;color:#64748b;">时间：${getHomeOrderDisplayTime(item)} ｜ 提交：${submitText}</div>
                    <div style="margin-top:8px;">
                        <button type="button" onclick="jumpToOrderFromHomeDetail('${jumpPayload}')">打开对应订单</button>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;
    } catch (error) {
        console.error("加载首页订单详情失败：", error);
        if (countEl) countEl.textContent = "共 0 条";
        listEl.innerHTML = `<div style="font-size:13px;color:#ef4444;">加载失败，请稍后重试</div>`;
    }
}

function closeHomeOrderDetailModal() {
    const modal = document.getElementById("homeOrderDetailModal");
    if (modal) modal.style.display = "none";
}

function buildHomeOrderJumpPayload(item) {
    const isSupervise = item.orderType === "supervise";
    const keyword = isSupervise
        ? String(item.orderno || item.studentname || item.project || "").trim()
        : String(item.phone || item.serialnumber || "").trim();
    return encodeURIComponent(JSON.stringify({
        type: item.orderType,
        keyword
    }));
}

async function jumpToOrderFromHomeDetail(payload) {
    let parsed = null;
    try {
        parsed = JSON.parse(decodeURIComponent(String(payload || "")));
    } catch (e) {
        showToast("跳转参数无效", "warning");
        return;
    }
    const type = String(parsed?.type || "").trim();
    const keyword = String(parsed?.keyword || "").trim();
    if (!type || !keyword) {
        showToast("缺少定位信息", "warning");
        return;
    }

    if (type === "wake") {
        closeHomeOrderDetailModal();
        showPage("wake");
        try {
            await loadOrders();
        } catch (_) {
            // ignore load error; search still attempts local render.
        }
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = keyword;
        searchOrders();
        showToast(`已定位叫醒订单：${keyword}`, "success");
        return;
    }

    if (type === "supervise") {
        window.location.href = `supervise.html?keyword=${encodeURIComponent(keyword)}`;
        return;
    }

    showToast("不支持的订单类型", "warning");
}

// 在页面上显示公告（管理员和员工都显示）
function showPageNoticeOnPage(page) {
    const notice = localStorage.getItem(`pageNotice_${page}`);
    const contentEl = document.getElementById(`noticeContent_${page}`);
    const noticeSection = document.getElementById(`pageNotice_${page}`);

    if (noticeSection && contentEl) {
        if (notice) {
            contentEl.innerHTML = `<p>${escapeHtml(notice)}</p>`;
            noticeSection.style.display = 'none';
        } else {
            contentEl.innerHTML = '<p>暂无公告</p>';
            noticeSection.style.display = 'none';
        }
    }
}

// 页面基础（必须放在 currentPage 声明之后）
// 检查URL参数，决定显示哪个页面
const urlParams = new URLSearchParams(window.location.search);
const targetPage = urlParams.get('page') || "home";
showPage(targetPage);

if (isAdmin) {
    document.getElementById("adminUploadArea").style.display = "flex";
    document.getElementById("batchUploadArea").style.display = "flex";
    document.getElementById("adminButtons").style.display = "flex";
    document.getElementById("addStaffBtnContainer").style.display = "block";
} else if (isStaff) {
    document.getElementById("staffBatchTakeBtn").style.display = "flex";
}

window.onload = async function () {
    const now = new Date();
    const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, 0)}-${String(now.getDate()).padStart(2, 0)}T06:00`;
    const wakeTimeInput = document.getElementById("wakeTime");
    if (wakeTimeInput) wakeTimeInput.value = defaultTime;

    // 确保员工界面一定不会显示角色切换按钮
    const roleSwitchArea = document.getElementById("roleSwitchArea");
    if (roleSwitchArea) {
        if (isAdmin) {
            roleSwitchArea.style.display = "flex";
        } else {
            roleSwitchArea.style.display = "none";
            roleSwitchArea.style.visibility = "hidden";
            roleSwitchArea.style.opacity = "0";
            roleSwitchArea.style.height = "0";
            roleSwitchArea.style.margin = "0";
            roleSwitchArea.style.overflow = "hidden";
        }
    }

    // 为余额卡片添加点击事件
    const balanceCard = document.getElementById("balanceCard");
    if (balanceCard) {
        balanceCard.addEventListener("click", () => {
            openSalaryDetailModal(user.id);
        });
    }

    await checkExpiredOrders();
    setInterval(checkExpiredOrders, 60000);

    await cleanExpiredOrders();
    setInterval(cleanExpiredOrders, 3600000); // 每小时清理一次过期订单

    await initStaffData();

    if (isAdmin) {
        document.getElementById("navTeamText").innerText = "团队管理";
        // 管理员显示编辑按钮
        const editBtn = document.getElementById("noticeEditBtn");
        if (editBtn) {
            editBtn.style.display = "block";
        }
        // 管理员显示公告设置菜单
        const noticeSettingNav = document.getElementById("nav-notice-setting");
        if (noticeSettingNav) {
            noticeSettingNav.style.display = "flex";
        }
    } else {
        document.getElementById("navTeamText").innerText = "个人中心";
    }

    // 先从云端同步公告到本地（否则员工端只弹窗会读不到）
    await syncPageNoticesFromCloud();

    // 初始化公告
    initNotice();
    // 初始化公告设置页面预览
    loadNoticeSettingsPreview();
    // 首页模块兜底刷新，防止首屏切换异常导致空白
    if (currentPage === "home") {
        loadHomeOrderSummary();
        loadHomePendingPanel();
    }
    renderLucideIcons();
};

async function switchUser(userId) {
    // 只有管理员可以切换角色
    if (!isAdmin) {
        showToast('只有管理员可以切换角色', 'warning');
        return;
    }

    try {
        const staffList = await getStaffList();
        const testUsers = {
            admin: { id: "admin001", name: "管理员", role: "admin" }
        };
        staffList.forEach(staff => {
            testUsers[staff.id] = {
                id: staff.id,
                name: staff.name,
                role: "staff",
                password: staff.password
            };
        });

        if (!testUsers[userId]) {
            alert("该用户不存在！");
            return;
        }

        localStorage.setItem("loginUser", JSON.stringify(testUsers[userId]));
        alert(`已切换为【${testUsers[userId].name}】，页面将刷新！`);
        window.location.reload();
    } catch (error) {
        console.error("切换用户失败：", error);
        alert("切换用户失败，请重试！");
    }
}

function closeSubMenu() {
    const sub = document.getElementById("subMenu");
    const arr = document.getElementById("arrow");
    if (sub) sub.style.display = "none";
    if (arr) arr.innerText = "▼";
}

function toggleSubMenu() {
    const sub = document.getElementById("subMenu");
    const arr = document.getElementById("arrow");
    const navItem = document.getElementById("nav-taobao");

    if (sub.style.display === "block") {
        closeSubMenu();
        // 如果当前就在叫醒/监督页，保持“淘宝监督项目”高亮
        if (currentPage !== "wake" && currentPage !== "supervise") {
            navItem.classList.remove("active");
        }
    } else {
        sub.style.display = "block";
        arr.innerText = "▲";
        navItem.classList.add("active");
    }
}

// 切换日期折叠框
function toggleDateCollapse(id) {
    const content = document.getElementById(`collapse-${id}`);
    const header = document.querySelector(`[onclick="toggleDateCollapse('${id}')"]`);
    const arrow = header.querySelector('.date-arrow');
    if (content && arrow) {
        if (content.style.display === 'block') {
            content.style.display = 'none';
            arrow.innerText = '▶';
        } else {
            content.style.display = 'block';
            arrow.innerText = '▼';
        }
    }
}

// ==================== 公告功能 ====================

// 初始化公告
function initNotice() {
    loadNotice();
}

// 加载公告
function loadNotice() {
    const savedNotice = localStorage.getItem('systemNotice');
    const savedTime = localStorage.getItem('noticeUpdateTime');

    const noticeContent =
        document.getElementById('noticeContent') || document.getElementById('pageNoticeContent');
    const noticeTime =
        document.getElementById('noticeTime') || document.getElementById('pageNoticeTime');

    if (savedNotice && noticeContent) {
        noticeContent.innerHTML = `<p>${escapeHtml(savedNotice)}</p>`;
    }

    if (savedTime && noticeTime) {
        noticeTime.innerText = `最后更新：${savedTime}`;
    }
}

// 打开编辑公告弹窗
function editNotice() {
    const savedNotice = localStorage.getItem('systemNotice');
    const textarea = document.getElementById('noticeTextarea');

    if (savedNotice) {
        textarea.value = savedNotice;
    } else {
        textarea.value = '';
    }

    document.getElementById('editNoticeModal').style.display = 'flex';
}

// 关闭编辑公告弹窗
function closeEditNoticeModal() {
    document.getElementById('editNoticeModal').style.display = 'none';
}

// 保存公告
function saveNotice() {
    const textarea = document.getElementById('noticeTextarea');
    const content = textarea.value.trim();

    if (!content) {
        showToast('公告内容不能为空！', 'warning');
        return;
    }

    // 保存到localStorage
    localStorage.setItem('systemNotice', content);

    // 更新时间
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    localStorage.setItem('noticeUpdateTime', timeStr);

    // 刷新显示
    loadNotice();
    closeEditNoticeModal();
    showToast('公告保存成功！', 'success');
}

// 简单的HTML转义，防止XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// ==================== 多页面公告功能 ====================

const PAGE_NOTICE_TABLE = 'page_notices';

// 当前编辑的页面
let currentEditPage = '';

// 页面名称映射
const pageNames = {
    'home': '首页',
    'wake': '叫醒页面',
    'supervise': '监督页面',
    'team': '个人中心'
};

function formatNoticeTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 从 Supabase 同步公告到本地缓存（用于跨设备显示弹窗）
async function syncPageNoticesFromCloud() {
    try {
        const { data, error } = await supabaseClient
            .from(PAGE_NOTICE_TABLE)
            .select('page, content, updatedat');
        if (error || !Array.isArray(data)) return;

        let latest = '';
        data.forEach((row) => {
            if (!row || !row.page) return;
            localStorage.setItem(`pageNotice_${row.page}`, row.content || '');
            if (row.updatedat && (!latest || row.updatedat > latest)) {
                latest = row.updatedat;
            }
        });
        if (latest) {
            localStorage.setItem('noticeUpdateTime', formatNoticeTime(latest));
        }
    } catch (e) {
        console.error('同步云端公告失败：', e);
    }
}

// 加载公告设置预览
function loadNoticeSettingsPreview() {
    const pages = ['home', 'wake', 'supervise', 'team'];
    pages.forEach(page => {
        const preview = document.getElementById(`noticePreview_${page}`);
        if (preview) {
            const notice = localStorage.getItem(`pageNotice_${page}`);
            if (notice) {
                preview.textContent = '已设置';
                preview.style.color = '#22c55e';
                preview.style.fontWeight = '600';
            } else {
                preview.textContent = '未设置';
                preview.style.color = '#64748b';
                preview.style.fontWeight = '400';
            }
        }
    });
}

// 打开编辑页面公告弹窗
function openPageNoticeModal(page) {
    currentEditPage = page;
    const savedNotice = localStorage.getItem(`pageNotice_${page}`);
    const textarea = document.getElementById('pageNoticeTextarea');
    const title = document.getElementById('editPageNoticeTitle');

    if (title) {
        title.textContent = `编辑${pageNames[page]}公告`;
    }

    if (textarea) {
        textarea.value = savedNotice || '';
    }

    document.getElementById('editPageNoticeModal').style.display = 'flex';
}

// 关闭编辑页面公告弹窗
function closeEditPageNoticeModal() {
    document.getElementById('editPageNoticeModal').style.display = 'none';
    currentEditPage = '';
}

// 保存页面公告
function savePageNotice() {
    const textarea = document.getElementById('pageNoticeTextarea');
    const content = textarea.value.trim();

    if (!content) {
        showToast('公告内容不能为空！', 'warning');
        return;
    }

    // 保存到localStorage
    localStorage.setItem(`pageNotice_${currentEditPage}`, content);
    localStorage.setItem('noticeUpdateTime', formatNoticeTime(new Date().toISOString()));

    // 同步写入 Supabase（跨设备可见）
    supabaseClient
        .from(PAGE_NOTICE_TABLE)
        .upsert(
            {
                page: currentEditPage,
                content,
                updatedby: user?.id || 'unknown',
                updatedat: new Date().toISOString()
            },
            { onConflict: 'page' }
        )
        .then(({ error }) => {
            if (error) {
                console.error('保存云端公告失败：', error);
                showToast(`云端公告保存失败：${error.message || '请检查数据库权限'}`, 'danger');
            }
        });

    // 记录已读状态重置（让员工重新看到）
    localStorage.removeItem(`pageNoticeRead_${currentEditPage}_${user.id}`);

    // 刷新预览
    loadNoticeSettingsPreview();
    closeEditPageNoticeModal();

    // 如果当前就在对应的页面，自动更新公告显示
    if (currentEditPage === currentPage) {
        showPageNoticeOnPage(currentEditPage);
    }

    showToast(`${pageNames[currentEditPage]}公告保存成功！`, 'success');
}

// 清除页面公告
function clearPageNotice() {
    if (!confirm('确定要清除这个公告吗？')) {
        return;
    }

    localStorage.removeItem(`pageNotice_${currentEditPage}`);
    loadNoticeSettingsPreview();
    closeEditPageNoticeModal();

    // 如果当前就在对应的页面，自动更新公告显示
    if (currentEditPage === currentPage) {
        showPageNoticeOnPage(currentEditPage);
    }

    showToast('公告已清除！', 'success');
}

// 检查并显示页面公告（员工用）
function checkAndShowPageNotice(page) {
    const notice = localStorage.getItem(`pageNotice_${page}`);
    const skipTodayKey = `pageNoticeSkipToday_${page}_${user.id}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const skippedDate = localStorage.getItem(skipTodayKey);
    const skippedToday = skippedDate === todayStr;
    const noticeUpdateTime = localStorage.getItem('noticeUpdateTime') || '';
    const signature = `${page}|${todayStr}|${noticeUpdateTime}|${notice || ''}`;

    if (notice && !skippedToday) {
        // 防止初始化阶段重复触发（showPage + onload）导致同一公告连弹两次
        if (signature === lastNoticePopupSignature) {
            return;
        }
        lastNoticePopupSignature = signature;
        showPageNotice(page, notice);
    }
}

// 显示页面公告弹窗
function showPageNotice(page, content) {
    const noticePageNames = {
        home: '首页',
        wake: '叫醒页面',
        supervise: '监督页面',
        team: '个人中心'
    };
    const noticePageIcons = {
        home: 'house',
        wake: 'alarm-clock',
        supervise: 'eye',
        team: 'user-round'
    };

    const icon = document.getElementById('pageNoticeIcon');
    const title = document.getElementById('pageNoticeTitle');
    const tag = document.getElementById('pageNoticeTag');
    const time = document.getElementById('pageNoticeTime');
    const noticeContent = document.getElementById('pageNoticeContent');

    if (icon) {
        icon.innerHTML = `<i data-lucide="${noticePageIcons[page] || "megaphone"}"></i>`;
    }

    if (title) {
        title.textContent = `${noticePageNames[page] || '系统'}公告`;
    }

    if (tag) {
        tag.textContent = noticePageNames[page] || '系统公告';
    }

    if (time) {
        const savedTime = localStorage.getItem('noticeUpdateTime');
        time.textContent = `发布时间：${savedTime || '--'}`;
    }

    if (noticeContent) {
        noticeContent.innerHTML = escapeHtml(content);
    }

    renderLucideIcons();
    document.getElementById('pageNoticeModal').style.display = 'flex';
}

// 关闭页面公告弹窗
function closePageNoticeModal() {
    document.getElementById('pageNoticeModal').style.display = 'none';
}

// 今日不再显示（仅当天生效）
function skipPageNoticeForToday() {
    if (currentPage) {
        const skipTodayKey = `pageNoticeSkipToday_${currentPage}_${user.id}`;
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        localStorage.setItem(skipTodayKey, todayStr);
    }
    closePageNoticeModal();
}

// ==================== 账号管理功能 ====================

async function updateCurrentStaffProfile(patch) {
    const result = await updateStaffProfileById(user.id, patch);
    if (!result.ok || !result.data) {
        throw new Error(result.reason || "资料保存失败");
    }
}

// 打开账号管理弹窗
function openAccountSettings() {
    const modal = document.getElementById('accountSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载用户数据
    loadAccountSettings();
}

// 关闭账号管理弹窗
function closeAccountSettingsModal() {
    const modal = document.getElementById('accountSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // 清空输入框
    const oldPasswordInput = document.getElementById('oldPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    if (oldPasswordInput) oldPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
}

// 加载账号设置
async function loadAccountSettings() {
    // 优先从数据库读取，失败时函数内部会回退本地缓存
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);

    if (currentStaff) {
        // 加载手机号
        const userPhone = document.getElementById('userPhone');
        if (userPhone) {
            userPhone.value = currentStaff.phone || '';
        }

        // 加载薪资结算方式
        const salaryMethod = document.getElementById('salaryMethod');
        if (salaryMethod) {
            salaryMethod.value = currentStaff.salaryMethod || 'alipay';
        }

        // 加载薪资账号
        const salaryAccount = document.getElementById('salaryAccount');
        if (salaryAccount) {
            salaryAccount.value = currentStaff.salaryAccount || '';
        }
    }
}

// 修改密码
async function changePassword() {
    const oldPasswordInput = document.getElementById('oldPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const oldPwd = oldPasswordInput.value.trim();
    const newPwd = newPasswordInput.value.trim();
    const confirmPwd = confirmPasswordInput.value.trim();

    if (!oldPwd) {
        showToast('请输入旧密码！', 'warning');
        return;
    }
    if (!newPwd) {
        showToast('请输入新密码！', 'warning');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('两次输入的新密码不一致！', 'warning');
        return;
    }
    if (newPwd.length < 4) {
        showToast('新密码至少4位！', 'warning');
        return;
    }

    // 验证旧密码
    const staffList = await getStaffList();
    const currentStaffIndex = staffList.findIndex(s => s.id === user.id);

    if (currentStaffIndex === -1) {
        showToast('用户不存在！', 'danger');
        return;
    }

    if (staffList[currentStaffIndex].password !== oldPwd) {
        showToast('旧密码错误！', 'danger');
        return;
    }

    // 更新密码
    staffList[currentStaffIndex].password = newPwd;
    await saveStaffList(staffList);

    // 清空输入框
    oldPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';

    showToast('密码修改成功！', 'success');
}

// 绑定手机号
async function bindPhone() {
    const userPhoneInput = document.getElementById('userPhone');
    const phone = userPhoneInput.value.trim();

    if (!phone) {
        showToast('请输入手机号！', 'warning');
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('请输入正确的手机号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({ phone });
        showToast('手机号绑定成功！', 'success');
    } catch (e) {
        showToast(`手机号绑定失败：${e.message}`, 'danger');
    }
}

// 保存薪资结算方式
async function saveSalaryMethod() {
    const salaryMethodInput = document.getElementById('salaryMethod');
    const salaryAccountInput = document.getElementById('salaryAccount');

    const method = salaryMethodInput.value;
    const account = salaryAccountInput.value.trim();

    if (!account) {
        showToast('请输入账号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({
            salaryMethod: method,
            salaryAccount: account
        });
        showToast('薪资结算方式保存成功！', 'success');
    } catch (e) {
        showToast(`薪资结算方式保存失败：${e.message}`, 'danger');
    }
}

// ==================== 小组件详情功能 ====================

// 显示小组件详情
async function showWidgetDetail(widgetType) {
    const modal = document.getElementById('widgetDetailModal');
    const title = document.getElementById('widgetDetailTitle');
    const content = document.getElementById('widgetDetailContent');

    if (!modal || !title || !content) return;

    modal.style.display = 'flex';

    switch (widgetType) {
        case 'todayOrders':
            title.textContent = '今日接单详情';
            await renderTodayOrdersDetail(content);
            break;
        case 'balance':
            title.textContent = '余额明细';
            await renderBalanceDetail(content);
            break;
        case 'myOrders':
            title.textContent = '我的订单';
            await renderMyOrdersDetail(content);
            break;
    }
}

// 关闭小组件详情弹窗
function closeWidgetDetailModal() {
    const modal = document.getElementById('widgetDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 渲染今日接单详情
async function renderTodayOrdersDetail(container) {
    const orders = await getOrders();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayOrders = orders.filter(item => {
        const orderDate = new Date(item.submittime);
        const isTodayOrder = orderDate >= todayStart && orderDate < todayEnd;
        if (!isTodayOrder) return false;
        if (item.status === "待接单") return true;
        return item.staffid === user.id;
    });

    if (todayOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="clipboard-list" style="width: 48px; height: 48px;"></i></div>
                <div>今日暂无订单</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    todayOrders.forEach(order => {
        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #1e293b;">${order.phone}</span>
                    <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: ${order.status === '已完成' ? '#dcfce7' : order.status === '待接单' ? '#fef3c7' : '#dbeafe'}; color: ${order.status === '已完成' ? '#166534' : order.status === '待接单' ? '#92400e' : '#1e40af'};">${order.status}</span>
                </div>
                <div style="font-size: 13px; color: #64748b;"><i data-lucide="alarm-clock" style="width: 14px; height: 14px; margin-right: 4px;"></i>${typeof formatWakeTimeForDisplay === 'function' ? formatWakeTimeForDisplay(order.waketime) : order.waketime}</div>
                ${order.note ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="file-text" style="width: 13px; height: 13px; margin-right: 4px;"></i>${order.note}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

// ==================== 新账号管理功能 ====================

// 打开账号管理主界面
function openAccountManagement() {
    const modal = document.getElementById('accountManagementModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭账号管理主界面
function closeAccountManagementModal() {
    const modal = document.getElementById('accountManagementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 打开修改密码弹窗
function openChangePasswordModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 关闭修改密码弹窗
function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // 清空输入框
    document.getElementById('cpOldPassword').value = '';
    document.getElementById('cpNewPassword').value = '';
    document.getElementById('cpConfirmPassword').value = '';
}

// 提交修改密码
async function submitChangePassword() {
    const oldPwd = document.getElementById('cpOldPassword').value.trim();
    const newPwd = document.getElementById('cpNewPassword').value.trim();
    const confirmPwd = document.getElementById('cpConfirmPassword').value.trim();

    if (!oldPwd) {
        showToast('请输入旧密码！', 'warning');
        return;
    }
    if (!newPwd) {
        showToast('请输入新密码！', 'warning');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('两次输入的新密码不一致！', 'warning');
        return;
    }
    if (newPwd.length < 4) {
        showToast('新密码至少4位！', 'warning');
        return;
    }

    // 验证旧密码
    const staffList = await getStaffList();
    const currentStaffIndex = staffList.findIndex(s => s.id === user.id);

    if (currentStaffIndex === -1) {
        showToast('用户不存在！', 'danger');
        return;
    }

    if (staffList[currentStaffIndex].password !== oldPwd) {
        showToast('旧密码错误！', 'danger');
        return;
    }

    try {
        await updateCurrentStaffProfile({ password: newPwd });
        closeChangePasswordModal();
        showToast('密码修改成功！', 'success');
    } catch (e) {
        showToast(`密码修改失败：${e.message}`, 'danger');
    }
}

// 打开绑定手机号弹窗
async function openBindPhoneModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('bindPhoneModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载已有手机号
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);
    if (currentStaff && currentStaff.phone) {
        document.getElementById('bpUserPhone').value = currentStaff.phone;
    }
}

// 关闭绑定手机号弹窗
function closeBindPhoneModal() {
    const modal = document.getElementById('bindPhoneModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 提交绑定手机号
async function submitBindPhone() {
    const phone = document.getElementById('bpUserPhone').value.trim();

    if (!phone) {
        showToast('请输入手机号！', 'warning');
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('请输入正确的手机号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({ phone });
        closeBindPhoneModal();
        showToast('手机号绑定成功！', 'success');
    } catch (e) {
        showToast(`手机号绑定失败：${e.message}`, 'danger');
    }
}

// 打开薪资结算方式弹窗
async function openSalaryMethodModal() {
    closeAccountManagementModal();
    const modal = document.getElementById('salaryMethodModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    // 加载已有账号
    const staffList = await getStaffList();
    const currentStaff = staffList.find(s => s.id === user.id);
    if (currentStaff && currentStaff.salaryAccount) {
        document.getElementById('smSalaryAccount').value = currentStaff.salaryAccount;
    }
}

// 关闭薪资结算方式弹窗
function closeSalaryMethodModal() {
    const modal = document.getElementById('salaryMethodModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 提交薪资结算方式
async function submitSalaryMethod() {
    const account = document.getElementById('smSalaryAccount').value.trim();

    if (!account) {
        showToast('请输入支付宝账号！', 'warning');
        return;
    }

    try {
        await updateCurrentStaffProfile({
            salaryMethod: 'alipay',
            salaryAccount: account
        });
        closeSalaryMethodModal();
        showToast('薪资结算方式保存成功！', 'success');
    } catch (e) {
        showToast(`薪资结算方式保存失败：${e.message}`, 'danger');
    }
}

// 渲染余额明细
async function renderBalanceDetail(container) {
    const allDetails = await getSalaryDetails();
    const myDetails = allDetails.filter(item => item.staffid === user.id);

    if (myDetails.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="wallet" style="width: 48px; height: 48px;"></i></div>
                <div>暂无余额变动记录</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    // 计算总余额
    const totalBalance = myDetails.reduce((sum, item) => sum + Number(item.amount), 0);

    let html = `
        <div style="margin-bottom: 16px; padding: 16px; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px;">
            <div style="font-size: 13px; color: #166534; margin-bottom: 4px;">当前余额</div>
            <div style="font-size: 28px; font-weight: 700; color: #166534;">${totalBalance.toFixed(2)} 元</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    myDetails.forEach(item => {
        const amount = Number(item.amount);
        const isPositive = amount >= 0;
        const typeText = item.type || '其他';
        const descText = item.description || '';
        const timeText = item.createdat ? (typeof formatTime === 'function' ? formatTime(item.createdat) : item.createdat) : '';

        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #1e293b;">${typeText}${descText ? ' - ' + descText : ''}</div>
                    <div style="font-size: 12px; color: #94a3b8;">${timeText}</div>
                </div>
                <div style="font-weight: 600; color: ${isPositive ? '#16a34a' : '#dc2626'};">${isPositive ? '+' : ''}${amount.toFixed(2)}</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

// 渲染我的订单详情
async function renderMyOrdersDetail(container) {
    const orders = await getOrders();
    const myWakeOrders = orders.filter(item => item.staffid === user.id);

    let superviseOrders = [];
    try {
        const { data } = await supabaseClient.from("supervise_orders").select("*").eq("staffid", user.id);
        if (data && Array.isArray(data)) {
            superviseOrders = data;
        }
    } catch (e) {
        console.error("读取监督订单失败：", e);
    }

    const allOrders = [
        ...myWakeOrders.map(o => ({ ...o, orderType: 'wake' })),
        ...superviseOrders.map(o => ({ ...o, orderType: 'supervise' }))
    ].sort((a, b) => new Date(b.submittime || b.createdat) - new Date(a.submittime || a.createdat));

    if (allOrders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="margin-bottom: 16px;"><i data-lucide="file-text" style="width: 48px; height: 48px;"></i></div>
                <div>暂无订单记录</div>
            </div>
        `;
        renderLucideIcons();
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    allOrders.forEach(order => {
        const isWake = order.orderType === 'wake';
        const phone = isWake ? order.phone : (order.studentname || order.phone || '-');
        const statusClass = order.status === '已完成' ? '#dcfce7' : order.status === '待接单' ? '#fef3c7' : '#dbeafe';
        const statusColor = order.status === '已完成' ? '#166534' : order.status === '待接单' ? '#92400e' : '#1e40af';
        const time = isWake
            ? (typeof formatWakeTimeForDisplay === 'function' ? formatWakeTimeForDisplay(order.waketime) : order.waketime)
            : (order.waketime || order.duration || '-');
        const submitTime = order.submittime || order.createdat;
        const submitTimeText = typeof formatTime === 'function' ? formatTime(submitTime) : submitTime;

        // 处理监督订单的note，避免显示完整JSON
        let noteText = order.note || '';
        if (!isWake && noteText) {
            // 尝试解析JSON，如果是JSON则只显示部分信息
            try {
                const parsed = JSON.parse(noteText);
                if (parsed.orderno) {
                    noteText = `订单号：${parsed.orderno}`;
                } else {
                    noteText = noteText.substring(0, 50) + (noteText.length > 50 ? '...' : '');
                }
            } catch (e) {
                // 如果不是JSON，只显示前50个字符
                noteText = noteText.substring(0, 50) + (noteText.length > 50 ? '...' : '');
            }
        }

        html += `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #1e293b;">${isWake ? '叫醒' : '监督'}订单 - ${phone}</span>
                    <span style="font-size: 12px; padding: 4px 8px; border-radius: 4px; background: ${statusClass}; color: ${statusColor};">${order.status}</span>
                </div>
                <div style="font-size: 13px; color: #64748b;"><i data-lucide="alarm-clock" style="width: 14px; height: 14px; margin-right: 4px;"></i>${time}</div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="calendar-days" style="width: 13px; height: 13px; margin-right: 4px;"></i>${submitTimeText}</div>
                ${noteText ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i data-lucide="file-text" style="width: 13px; height: 13px; margin-right: 4px;"></i>${noteText}</div>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    renderLucideIcons();
}

