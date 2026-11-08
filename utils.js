/** PostgREST / JSON 常把 numeric 变成字符串；避免对字符串调用 .toFixed 或错误拼接 */
function formatMoneyDisplay(value) {
    const n = Number.parseFloat(value);
    return (Number.isFinite(n) ? n : 0).toFixed(2);
}

// 格式化时间为北京时间（Asia/Shanghai）。勿在解析后再手动 +8h：与 timeZone 叠加会重复偏移。
function formatTime(timeStr) {
    if (timeStr == null || timeStr === "") return "-";
    const raw = String(timeStr).trim();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw || "-";
    return d.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

function pickAmountFromTimeSlotRules(timeStr, rules) {
    const [hour, minute] = String(timeStr || "").split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
    const totalMin = hour * 60 + minute;
    const r = rules && typeof rules === "object" ? rules : {};

    if (totalMin >= 6 * 60 && totalMin <= 6 * 60 + 30) return Number(r["06:00-06:30"] || 0);
    if (totalMin >= 6 * 60 + 31 && totalMin <= 7 * 60) return Number(r["06:31-07:00"] || 0);
    if (totalMin >= 7 * 60 + 1 && totalMin <= 8 * 60) return Number(r["07:01-08:00"] || 0);
    return Number(r["08:01-24:00"] || 0);
}

function getDefaultVisitPriceRules() {
    if (typeof VISIT_PRICE_RULE === "object" && VISIT_PRICE_RULE) return { ...VISIT_PRICE_RULE };
    return {
        "06:00-06:30": 1.3,
        "06:31-07:00": 1.2,
        "07:01-08:00": 1.1,
        "08:01-24:00": 1.0
    };
}

// 叫醒：按时间段计算金额
function calculateAmountByTime(timeStr) {
    const strategy = (typeof getPriceStrategyCache === "function" ? getPriceStrategyCache() : null) || {};
    const wakeRules = strategy?.wake?.rules && typeof strategy.wake.rules === "object" ? strategy.wake.rules : null;
    const rules = wakeRules || (typeof PRICE_RULE === "object" ? PRICE_RULE : {});
    return pickAmountFromTimeSlotRules(timeStr, rules);
}

/** 回访：按时间段计算金额（与叫醒分段相同，价格独立配置） */
function calculateVisitAmountByTime(timeStr) {
    const strategy = (typeof getPriceStrategyCache === "function" ? getPriceStrategyCache() : null) || {};
    const visitRules =
        strategy?.wake?.visitRules && typeof strategy.wake.visitRules === "object"
            ? strategy.wake.visitRules
            : strategy?.wake?.visit_rules && typeof strategy.wake.visit_rules === "object"
                ? strategy.wake.visit_rules
                : null;
    const rules = visitRules || getDefaultVisitPriceRules();
    return pickAmountFromTimeSlotRules(timeStr, rules);
}

/**
 * 按订单类型算金额：
 * - 叫醒 / 多次叫醒：叫醒时段价
 * - 回访 / 多次回访：回访时段价（多次可传 times 数组求和，或单价×timesCount）
 */
function calculateWakeOrderAmount(waketype, timeStr, timesCount = 1) {
    const type = String(waketype || "");
    const n = Math.max(1, Number(timesCount) || 1);
    const isVisit = /回访/.test(type);
    const calcOne = (t) =>
        isVisit ? Number(calculateVisitAmountByTime(t) || 0) : Number(calculateAmountByTime(t) || 0);

    if (Array.isArray(timeStr)) {
        const sum = timeStr.reduce((acc, t) => acc + calcOne(t), 0);
        return Number(sum.toFixed(2));
    }
    if (isVisit) {
        return Number((calcOne(timeStr) * n).toFixed(2));
    }
    if (n > 1) {
        return Number((calcOne(timeStr) * n).toFixed(2));
    }
    return Number(calcOne(timeStr).toFixed(2));
}

// 价格策略：全局缓存（用于同步计算金额，避免到处 await）
function getPriceStrategyCache() {
    const c = window.__priceStrategyCache;
    return c && typeof c === "object" ? c : null;
}

function setPriceStrategyCache(next) {
    window.__priceStrategyCache = next && typeof next === "object" ? next : null;
}

const WAKE_REASSIGN_PENALTY_DEFAULT = 0.3;

/** 从价格策略读取叫醒单转派处罚金额（元），缺省或非法时用 0.3 */
function getWakeReassignPenaltyAmountFromStrategy(strategy) {
    const s = strategy && typeof strategy === "object" ? strategy : {};
    const raw = s.wake?.reassignPenalty ?? s.wake?.reassign_penalty;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : WAKE_REASSIGN_PENALTY_DEFAULT;
}

/** 叫醒单归属到「叫醒员」的日历锚点：转派/接单后的 wake_staff_since，否则用 submittime */
function getWakeStaffDayAnchorDate(order) {
    const raw = order?.wake_staff_since || order?.wakeStaffSince;
    if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date(order?.submittime || "");
}

/** 某订单是否在该本地自然日内计入指定叫醒员的「今日单」 */
function isWakeOrderAssignedToStaffOnLocalCalendarDay(order, staffId, dayStart, dayEnd) {
    if (String(order?.staffid || "").trim() !== String(staffId || "").trim()) return false;
    const anchor = getWakeStaffDayAnchorDate(order);
    if (Number.isNaN(anchor.getTime())) return false;
    return anchor >= dayStart && anchor < dayEnd;
}

// 归一化时间格式（HH:mm，供批量识别等使用）
const normalizeTime = (timeStr) => {
    if (timeStr == null || timeStr === "") {
        throw new Error("时间为空");
    }
    const s = String(timeStr).trim().replace(/：/g, ":");
    const parts = s.split(":");
    if (parts.length < 2) {
        throw new Error(`无法解析时间: ${timeStr}`);
    }
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        throw new Error(`无效时间: ${timeStr}`);
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// 展示用叫醒时间格式（统一成 HH:mm，去掉秒和时区）
function formatWakeTimeForDisplay(waketime) {
    const raw = String(waketime || "").trim();
    if (!raw) return "-";

    // 优先提取时间部分（支持 07:20:00+00:00 / 2026-04-15T07:20:00+00:00）
    const timeMatch = raw.match(/(?:T|\s)?(\d{1,2}):(\d{2})(?::\d{2})?(?:[+-]\d{2}:?\d{2}|Z)?$/i);
    if (timeMatch) {
        return `${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}`;
    }

    // 兜底：标准日期可解析时按本地时区格式化
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    return raw;
}

// 生成固定序号
function generateFixedSerial(orders) {
    // 按日期分组
    const ordersByDate = {};
    orders.forEach(order => {
        // 处理未定义的submittime
        const submitTime = order.submittime ? new Date(order.submittime) : new Date();
        const orderDate = submitTime.toLocaleDateString();
        if (!ordersByDate[orderDate]) {
            ordersByDate[orderDate] = [];
        }
        ordersByDate[orderDate].push(order);
    });

    // 对每个日期的订单单独排序和编号
    const result = [];
    Object.keys(ordersByDate).forEach(date => {
        const dateOrders = ordersByDate[date].sort((a, b) => {
            const timeA = a.waketime.includes('T') ? a.waketime.split('T')[1] : a.waketime;
            const timeB = b.waketime.includes('T') ? b.waketime.split('T')[1] : b.waketime;
            const timeCompare = timeA.localeCompare(timeB);
            if (timeCompare !== 0) {
                return timeCompare;
            }
            // 处理未定义的submittime
            const submitTimeA = a.submittime ? new Date(a.submittime) : new Date(0);
            const submitTimeB = b.submittime ? new Date(b.submittime) : new Date(0);
            return submitTimeA - submitTimeB;
        });

        // 每个日期的订单从1开始编号
        dateOrders.forEach((item, index) => {
            item.serialnumber = index + 1;
            result.push(item);
        });
    });

    return result;
}

// ==================== Global Loading Overlay ====================
let __globalLoadingCount = 0;

let __globalLoadingWatchdog = null;

function showGlobalLoading(message = "加载中…") {
    __globalLoadingCount += 1;
    const overlay = document.getElementById("globalLoadingOverlay");
    if (!overlay) return;
    const text = overlay.querySelector(".global-loading__text");
    if (text) text.textContent = String(message || "加载中…");
    overlay.classList.add("show");
    // 防止请求挂起时遮罩永久挡住侧栏/页面点击
    if (__globalLoadingWatchdog) clearTimeout(__globalLoadingWatchdog);
    __globalLoadingWatchdog = setTimeout(() => {
        __globalLoadingCount = 0;
        const el = document.getElementById("globalLoadingOverlay");
        if (el) el.classList.remove("show");
    }, 20000);
}

function hideGlobalLoading() {
    __globalLoadingCount = Math.max(0, __globalLoadingCount - 1);
    if (__globalLoadingCount !== 0) return;
    if (__globalLoadingWatchdog) {
        clearTimeout(__globalLoadingWatchdog);
        __globalLoadingWatchdog = null;
    }
    const overlay = document.getElementById("globalLoadingOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
}

function forceHideGlobalLoading() {
    __globalLoadingCount = 0;
    if (__globalLoadingWatchdog) {
        clearTimeout(__globalLoadingWatchdog);
        __globalLoadingWatchdog = null;
    }
    const overlay = document.getElementById("globalLoadingOverlay");
    if (overlay) overlay.classList.remove("show");
}

// ==================== Keyword Highlight ====================
function clearKeywordHighlights(root) {
    const container = typeof root === "string" ? document.querySelector(root) : root;
    if (!container) return;
    container.querySelectorAll("mark.kw").forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
    });
}

function highlightKeyword(root, keyword) {
    const container = typeof root === "string" ? document.querySelector(root) : root;
    if (!container) return;
    const kw = String(keyword || "").trim();
    clearKeywordHighlights(container);
    if (!kw) return;

    const lowerKw = kw.toLowerCase();
    const blockedTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "BUTTON"]);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const v = node?.nodeValue;
            if (!v || !String(v).trim()) return NodeFilter.FILTER_REJECT;
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (blockedTags.has(p.tagName)) return NodeFilter.FILTER_REJECT;
            if (p.closest("mark.kw")) return NodeFilter.FILTER_REJECT;
            if (String(v).toLowerCase().includes(lowerKw)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_REJECT;
        }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
        const text = String(node.nodeValue || "");
        const lower = text.toLowerCase();
        const idx = lower.indexOf(lowerKw);
        if (idx < 0) return;

        const frag = document.createDocumentFragment();
        const before = text.slice(0, idx);
        const hit = text.slice(idx, idx + kw.length);
        const after = text.slice(idx + kw.length);
        if (before) frag.appendChild(document.createTextNode(before));
        const mark = document.createElement("mark");
        mark.className = "kw";
        mark.textContent = hit;
        frag.appendChild(mark);
        if (after) frag.appendChild(document.createTextNode(after));
        node.parentNode.replaceChild(frag, node);
    });
}

// ==================== Auth Helpers ====================
function getLoginUserSafe() {
    try {
        const raw = localStorage.getItem("loginUser");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const id = String(parsed.id || "").trim();
        if (!id) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function requireLoginOrRedirect(redirectTo = "index.html") {
    const user = getLoginUserSafe();
    if (user) return user;
    try {
        window.location.href = redirectTo;
    } catch (_) {
        // ignore
    }
    return null;
}

// ==================== 移动端左侧抽屉导航 ====================
function isSubMenuPanelOpen(sub) {
    if (!sub) return false;
    if (sub.style.display === "none") return false;
    if (sub.style.display === "block") return true;
    return window.getComputedStyle(sub).display !== "none";
}

function positionTaobaoSubmenuMobile() {
    // 手机端已改为左侧抽屉，子菜单在侧栏内展开，不再贴底栏定位
    const sub = document.getElementById("subMenu");
    if (!sub) return;
    sub.style.left = "";
    sub.style.width = "";
}

function isMobileNavViewport() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches;
}

function openMobileNav() {
    if (!isMobileNavViewport()) return;
    document.body.classList.add("side-open");
    const mask = document.getElementById("sidebarMask");
    if (mask) mask.setAttribute("aria-hidden", "false");
}

function closeMobileNav() {
    document.body.classList.remove("side-open");
    const mask = document.getElementById("sidebarMask");
    if (mask) mask.setAttribute("aria-hidden", "true");
    if (typeof closeSubMenu === "function") closeSubMenu();
}

function toggleMobileNav() {
    if (document.body.classList.contains("side-open")) closeMobileNav();
    else openMobileNav();
}

if (typeof window !== "undefined") {
    window.openMobileNav = openMobileNav;
    window.closeMobileNav = closeMobileNav;
    window.toggleMobileNav = toggleMobileNav;
    window.addEventListener(
        "resize",
        () => {
            if (!isMobileNavViewport()) closeMobileNav();
            const sub = document.getElementById("subMenu");
            if (sub && isSubMenuPanelOpen(sub)) positionTaobaoSubmenuMobile();
        },
        { passive: true }
    );
}
