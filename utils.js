// 格式化时间（使用中国时区 UTC+8）
function formatTime(timeStr) {
    const d = new Date(timeStr);
    // 手动调整为 UTC+8
    const chinaTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return chinaTime.toLocaleString("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Asia/Shanghai"
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
