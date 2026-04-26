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

// 根据时间计算金额
function calculateAmountByTime(timeStr) {
    const [hour, minute] = timeStr.split(":").map(Number);
    const totalMin = hour * 60 + minute;

    if (totalMin >= 6 * 60 && totalMin <= 6 * 60 + 30) return PRICE_RULE["06:00-06:30"];
    if (totalMin >= 6 * 60 + 31 && totalMin <= 7 * 60) return PRICE_RULE["06:31-07:00"];
    if (totalMin >= 7 * 60 + 1 && totalMin <= 8 * 60) return PRICE_RULE["07:01-08:00"];
    return PRICE_RULE["08:01-24:00"];
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

function showGlobalLoading(message = "加载中…") {
    __globalLoadingCount += 1;
    const overlay = document.getElementById("globalLoadingOverlay");
    if (!overlay) return;
    const text = overlay.querySelector(".global-loading__text");
    if (text) text.textContent = String(message || "加载中…");
    overlay.classList.add("show");
}

function hideGlobalLoading() {
    __globalLoadingCount = Math.max(0, __globalLoadingCount - 1);
    if (__globalLoadingCount !== 0) return;
    const overlay = document.getElementById("globalLoadingOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
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
