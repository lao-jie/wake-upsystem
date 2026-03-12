// 格式化时间
function formatTime(timeStr) {
    const d = new Date(timeStr);
    return d.toLocaleString("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
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

// 归一化时间格式
const normalizeTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};

// 生成固定序号
function generateFixedSerial(orders) {
    // 按日期分组
    const ordersByDate = {};
    orders.forEach(order => {
        const orderDate = new Date(order.submitTime).toLocaleDateString();
        if (!ordersByDate[orderDate]) {
            ordersByDate[orderDate] = [];
        }
        ordersByDate[orderDate].push(order);
    });

    // 对每个日期的订单单独排序和编号
    const result = [];
    Object.keys(ordersByDate).forEach(date => {
        const dateOrders = ordersByDate[date].sort((a, b) => {
            const timeA = a.wakeTime.includes('T') ? a.wakeTime.split('T')[1] : a.wakeTime;
            const timeB = b.wakeTime.includes('T') ? b.wakeTime.split('T')[1] : b.wakeTime;
            const timeCompare = timeA.localeCompare(timeB);
            if (timeCompare !== 0) {
                return timeCompare;
            }
            const submitTimeA = new Date(a.submitTime);
            const submitTimeB = new Date(b.submitTime);
            return submitTimeA - submitTimeB;
        });

        // 每个日期的订单从1开始编号
        dateOrders.forEach((item, index) => {
            item.serialNumber = index + 1;
            result.push(item);
        });
    });

    return result;
}
