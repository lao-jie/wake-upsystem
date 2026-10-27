let latestLoadOrdersToken = 0;
let renderFrameId = null;
let wakeReassignPendingIdentity = "";

async function getWakeReassignPenaltyAmount() {
    try {
        if (typeof getPriceStrategy === "function") {
            const s = await getPriceStrategy();
            if (typeof getWakeReassignPenaltyAmountFromStrategy === "function") {
                return getWakeReassignPenaltyAmountFromStrategy(s);
            }
        }
    } catch (_) { }
    const cached = typeof getPriceStrategyCache === "function" ? getPriceStrategyCache() : null;
    if (typeof getWakeReassignPenaltyAmountFromStrategy === "function") {
        return getWakeReassignPenaltyAmountFromStrategy(cached);
    }
    return 0.3;
}

function formatWakeTimeDisplay(waketime) {
    if (typeof formatWakeTimeForDisplay === "function") {
        return formatWakeTimeForDisplay(waketime);
    }
    const raw = String(waketime || "").trim();
    const hhmmMatch = raw.match(/(\d{1,2}):(\d{2})/);
    return hhmmMatch ? `${String(Number(hhmmMatch[1])).padStart(2, "0")}:${hhmmMatch[2]}` : raw || "-";
}

const WAKE_TYPE_OPTIONS = ["叫醒", "回访", "多次叫醒", "多次回访"];
const WAKE_TYPE_DEFAULT = "叫醒";

function normalizeWakeType(value, fallback = WAKE_TYPE_DEFAULT) {
    const s = String(value || "").trim();
    if (WAKE_TYPE_OPTIONS.includes(s)) return s;
    if (s.includes("多次回访")) return "多次回访";
    if (s.includes("多次叫醒")) return "多次叫醒";
    if (s.includes("回访")) return "回访";
    if (s.includes("叫醒")) return "叫醒";
    return fallback;
}

function inferWakeTypeFromAiItem(item, timesCount = 1) {
    const explicit = normalizeWakeType(item?.waketype || item?.wakeType || item?.type || "", "");
    if (explicit) return explicit;
    const note = String(item?.note || "");
    const isVisit = /回访/.test(note);
    if (Number(timesCount) > 1) return isVisit ? "多次回访" : "多次叫醒";
    return isVisit ? "回访" : WAKE_TYPE_DEFAULT;
}

function formatWakeTypeDisplay(item) {
    return normalizeWakeType(item?.waketype || item?.wakeType);
}

function buildOrdersSignature(orders) {
    return (orders || []).map((o) => [
        o.id || "",
        o.serialnumber || "",
        o.waketime || "",
        o.phone || "",
        o.waketype || o.wakeType || "",
        o.note || "",
        Number(o.amount || o.money || 0).toFixed(2),
        o.status || "",
        o.staffid || "",
        o.staffname || "",
        o.salarysettled ? "1" : "0",
        o.submittime || ""
    ].join("|")).join("||");
}

function getOrderIdentity(order) {
    if (order && order.id !== undefined && order.id !== null && String(order.id).trim() !== "") {
        return `id:${String(order.id).trim()}`;
    }
    const submit = String(order?.submittime || "").trim();
    const phone = String(order?.phone || "").trim();
    const wake = String(order?.waketime || "").trim();
    return `fallback:${submit}|${phone}|${wake}`;
}

/** 与 loadOrders 去重规则一致：同提交时间+电话+叫醒时间在界面上只显示一行，删一行时应一并删库中重复行 */
function getWakeOrderDisplayDedupeKey(order) {
    return `${order?.submittime || ""}-${order?.phone || ""}-${order?.waketime || ""}`;
}

function escapeJsSingleQuote(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureStaffContactAndAlipayBound() {
    if (!isStaff) return true;

    const staffList = await getStaffList();
    const me = (staffList || []).find((staff) => staff.id === user.id);
    const phone = String(me?.phone || "").trim();
    const alipay = String(me?.salaryAccount || "").trim();

    if (phone && alipay) return true;

    const msg = "请进入个人中心账号管理中绑定手机号以及支付宝账号";
    if (typeof showToast === "function") {
        showToast(msg, "warning");
    } else {
        alert(msg);
    }
    return false;
}

// 加载订单
async function loadOrders() {
    const currentToken = ++latestLoadOrdersToken;
    // 显示加载状态
    const loadingElement = document.getElementById('loadingIndicator');
    if (loadingElement) {
        loadingElement.style.display = 'block';
    }
    if (typeof showGlobalLoading === "function") {
        showGlobalLoading("加载订单中…");
    }

    try {
        let allOrders = await getOrders();

        // 去重处理：按照提交时间、电话和叫醒时间的顺序判断重复订单
        const uniqueOrders = [];
        const orderKeys = new Set();

        allOrders.forEach(order => {
            // 创建唯一键：提交时间 + 电话 + 叫醒时间
            const key = `${order.submittime}-${order.phone}-${order.waketime}`;
            if (!orderKeys.has(key)) {
                orderKeys.add(key);
                uniqueOrders.push(order);
            }
        });

        // 确保至少有一个订单，避免清空数据库
        if (uniqueOrders.length === 0 && allOrders.length > 0) {
            allOrders = allOrders;
        } else {
            allOrders = uniqueOrders;
        }

        // 生成序号
        const ordersWithSerial = generateFixedSerial(allOrders);

        // load 只负责读取和渲染，不在这里回写数据库，避免“读触发全量写”造成卡顿与并发覆盖
        localStorage.setItem("wakeOrdersSignature", buildOrdersSignature(ordersWithSerial));

        let displayOrders = [];
        const now = new Date();
        // 获取今天的开始和结束时间（本地时间）
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        if (isAdmin) {
            displayOrders = [...ordersWithSerial].sort((a, b) => a.serialnumber - b.serialnumber);
        } else if (isStaff) {
            // 员工：待接单池仍为「当日提交」；已接单订单按 wake_staff_since（或提交时间）落在当日则可见（含管理员转派到本日的单）
            displayOrders = ordersWithSerial.filter(item => {
                if (item.status === "待接单") {
                    const orderDate = new Date(item.submittime);
                    return orderDate >= todayStart && orderDate < todayEnd;
                }
                if (item.staffid !== user.id) {
                    return false;
                }
                return typeof isWakeOrderAssignedToStaffOnLocalCalendarDay === "function"
                    ? isWakeOrderAssignedToStaffOnLocalCalendarDay(item, user.id, todayStart, todayEnd)
                    : (() => {
                        const orderDate = new Date(item.submittime);
                        return orderDate >= todayStart && orderDate < todayEnd;
                    })();
            }).sort((a, b) => {
                // 优先展示未接的订单
                if (a.status === "待接单" && b.status !== "待接单") return -1;
                if (a.status !== "待接单" && b.status === "待接单") return 1;
                // 然后按序号排序
                return a.serialnumber - b.serialnumber;
            });
        }

        if (currentToken !== latestLoadOrdersToken) {
            return;
        }

        // 保存原始订单数据用于搜索
        originalOrders = displayOrders;
        renderOrders(displayOrders);
    } catch (error) {
        console.error('加载订单失败:', error);
    } finally {
        // 隐藏加载状态
        if (loadingElement && currentToken === latestLoadOrdersToken) {
            loadingElement.style.display = 'none';
        }
        if (typeof hideGlobalLoading === "function") {
            hideGlobalLoading();
        }
    }
}

function formatSubmitTimeCompact(timeStr) {
    if (timeStr == null || timeStr === "") return "-";
    const d = new Date(String(timeStr).trim());
    if (Number.isNaN(d.getTime())) return String(timeStr);
    return d.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function wakeTimeCellHtml(item) {
    const showTime = formatWakeTimeDisplay(item.waketime);
    const serial = item.serialnumber != null ? `#${item.serialnumber}` : "";
    return `<div class="wake-cell-main">${showTime}</div>${serial ? `<div class="wake-cell-sub">${serial}</div>` : ""}`;
}

function wakePhoneCellHtml(item) {
    const phone = item.phone || "-";
    const type = formatWakeTypeDisplay(item);
    const noteRaw = String(item.note || "").trim();
    const note = noteRaw && noteRaw !== "-" ? noteRaw : "";
    const typeHtml = `<span class="wake-type-tag">${type}</span>`;
    const noteHtml = note ? `<span class="wake-note-inline">${typeof escapeHtml === "function" ? escapeHtml(note) : note}</span>` : "";
    return `<div class="wake-cell-main">${phone}</div><div class="wake-cell-sub">${typeHtml}${noteHtml}</div>`;
}

function getWakeRowActionHtml(item) {
    if (isAdmin) {
        if (item.status === "进行中") {
            const identity = escapeJsSingleQuote(getOrderIdentity(item));
            return `<button class="success" onclick="finishOrderByIdentity('${identity}')">完成</button>`;
        }
        if (item.status === "待接单") return "待接单";
        return "已完成";
    }
    if (isStaff && item.status === "待接单") {
        const identity = escapeJsSingleQuote(getOrderIdentity(item));
        return `<button class="warning" onclick="takeOrderByIdentity('${identity}')">接单</button>`;
    }
    if (item.status === "进行中") return "进行中";
    if (item.status === "已完成") return "已完成";
    return "无操作权限";
}

// 渲染订单
function renderOrders(orders) {
    // 合并同一帧内的多次渲染请求，减少抖动和重排
    if (renderFrameId) {
        cancelAnimationFrame(renderFrameId);
    }
    renderFrameId = requestAnimationFrame(() => {
        renderFrameId = null;
        // 手机端统一卡片；桌面端表格
        try {
            if (mobileMQ.matches) {
                renderCards(orders);
            } else {
                renderTable(orders);
            }
            const kw = String(window.__wakeSearchKeyword || "").trim();
            if (kw && typeof highlightKeyword === "function") {
                highlightKeyword(document.getElementById("orderCards"), kw);
                highlightKeyword(document.getElementById("orderTable"), kw);
            }
        } catch (error) {
            console.error('渲染订单失败:', error);
            // 降级处理：尝试使用表格渲染
            try {
                const tableContainer = document.getElementById("orderTable");
                if (tableContainer) {
                    let html = "";
                    if (orders.length > 0) {
                        html += `
                    <tr>
                        <th>序号</th>
                        <th>叫醒时间</th>
                        <th>电话</th>
                        <th>类型</th>
                        <th>备注</th>
                        <th>状态</th>
                        <th>金额</th>
                        <th>操作</th>
                        <th>提交时间</th>
                    </tr>
                        `;
                        orders.forEach(item => {
                            let statusClass = "";
                            switch (item.status) {
                                case "待接单": statusClass = "status-pending"; break;
                                case "进行中": statusClass = "status-processing"; break;
                                case "已完成": statusClass = "status-done"; break;
                            }

                            let actionHtml = "";
                            if (isStaff && item.status === "待接单") {
                                const identity = escapeJsSingleQuote(getOrderIdentity(item));
                                actionHtml = `<button class="warning" onclick="takeOrderByIdentity('${identity}')">接单</button>`;
                            } else {
                                actionHtml = `<span class="status-badge ${statusClass}">${item.status}</span>`;
                            }

                            const showTime = formatWakeTimeDisplay(item.waketime);

                            html += `
                        <tr>
                            <td>${item.serialnumber}</td>
                            <td>${showTime}</td>
                            <td>${item.phone}</td>
                            <td>${formatWakeTypeDisplay(item)}</td>
                            <td>${item.note || '-'}</td>
                            <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                            <td>${formatMoneyDisplay(item.amount ?? item.money)} 元</td>
                            <td>${actionHtml}</td>
                            <td>${formatTime(item.submittime)}</td>
                        </tr>
                            `;
                        });
                    } else {
                        html = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
                    }
                    tableContainer.innerHTML = html;
                }
            } catch (fallbackError) {
                console.error('降级渲染也失败:', fallbackError);
            }
        }
    });
}

// 渲染卡片（移动端）
function renderCards(orders) {
    try {
        const container = document.getElementById("orderCards");

        if (!container) {
            // 如果没有找到容器，尝试使用表格容器
            const tableContainer = document.getElementById("orderTable");
            if (tableContainer) {
                // 渲染简单的订单列表
                let html = "";
                if (orders.length > 0) {
                    html += `
                    <tr>
                        <th>序号</th>
                        <th>叫醒时间</th>
                        <th>电话</th>
                        <th>类型</th>
                        <th>备注</th>
                        <th>状态</th>
                        <th>金额</th>
                        <th>操作</th>
                        <th>提交时间</th>
                    </tr>
                    `;
                    orders.forEach(item => {
                        let statusClass = "";
                        switch (item.status) {
                            case "待接单": statusClass = "status-pending"; break;
                            case "进行中": statusClass = "status-processing"; break;
                            case "已完成": statusClass = "status-done"; break;
                        }

                        let actionHtml = "";
                        if (isStaff && item.status === "待接单") {
                            const identity = escapeJsSingleQuote(getOrderIdentity(item));
                            actionHtml = `<button class="warning" onclick="takeOrderByIdentity('${identity}')">接单</button>`;
                        } else {
                            actionHtml = `<span class="status-badge ${statusClass}">${item.status}</span>`;
                        }

                        const showTime = formatWakeTimeDisplay(item.waketime);

                        html += `
                        <tr>
                            <td>${item.serialnumber}</td>
                            <td>${showTime}</td>
                            <td>${item.phone}</td>
                            <td>${formatWakeTypeDisplay(item)}</td>
                            <td>${item.note || '-'}</td>
                            <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                            <td>${formatMoneyDisplay(item.amount ?? item.money)} 元</td>
                            <td>${actionHtml}</td>
                            <td>${formatTime(item.submittime)}</td>
                        </tr>
                        `;
                    });
                } else {
                    html = `<tr><td colspan="9" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
                }
                tableContainer.innerHTML = html;
            }
            return;
        }

        let html = "";
        if (orders.length > 0) {
            orders.forEach(item => {
                let statusClass = "";
                switch (item.status) {
                    case "待接单": statusClass = "status-pending"; break;
                    case "进行中": statusClass = "status-processing"; break;
                    case "已完成": statusClass = "status-done"; break;
                }
                const actionHtml = getWakeRowActionHtml(item);
                const showTime = formatWakeTimeDisplay(item.waketime);
                const noteRaw = String(item.note || "").trim();
                const note = noteRaw && noteRaw !== "-" ? noteRaw : "-";
                const footerHint = isStaff ? "勾选后可一键接单" : "勾选后可批量删改";

                html += `
                <div class="order-card">
                    <div class="order-card-header">
                        <div class="order-card-title">
                            <input type="checkbox" class="order-checkbox" value="${escapeJsSingleQuote(getOrderIdentity(item))}" ${item.status !== "待接单" ? "data-status='processed'" : ""}>
                            <span class="serial-number">${item.serialnumber}</span>
                            <span class="time">${showTime}</span>
                            <span class="wake-type-tag">${formatWakeTypeDisplay(item)}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                            <span class="status-badge ${statusClass}">${item.status}</span>
                            <span class="order-money">${formatMoneyDisplay(item.amount ?? item.money)} 元</span>
                        </div>
                    </div>
                    <div class="order-card-body">
                        <div class="order-kv">
                            <div class="k">电话</div>
                            <div class="v">${item.phone || "-"}</div>
                        </div>
                        <div class="order-kv">
                            <div class="k">叫醒员</div>
                            <div class="v">${wakeStaffNameCellHtml(item)}</div>
                        </div>
                        <div class="order-kv">
                            <div class="k">备注</div>
                            <div class="v">${typeof escapeHtml === "function" ? escapeHtml(note) : note}</div>
                        </div>
                        <div class="order-kv">
                            <div class="k">提交</div>
                            <div class="v">${formatSubmitTimeCompact(item.submittime)}</div>
                        </div>
                    </div>
                    <div class="order-card-footer">
                        <div style="color:#64748b;font-size:12px;">${footerHint}</div>
                        <div>${actionHtml}</div>
                    </div>
                </div>`;
            });
        } else {
            html = `<div style="color:#64748b;font-size:14px;padding:12px;">暂无订单</div>`;
        }

        container.innerHTML = html;
        const tableWrap = document.querySelector("#page_wake .table-wrapper");
        if (tableWrap) tableWrap.style.display = "none";
        container.style.display = "grid";
    } catch (error) {
        console.error("渲染订单卡片失败：", error);
    }
}

// 渲染表格（桌面端）— 紧凑：类型/备注并入电话列，序号并入时间列
function renderTable(orders) {
    const cards = document.getElementById("orderCards");
    if (cards) {
        cards.innerHTML = "";
        cards.style.display = "none";
    }
    const tableWrap = document.querySelector("#page_wake .table-wrapper");
    if (tableWrap) tableWrap.style.display = "";

    let html = "";
    const theadCols = `
        <th>选</th>
        <th>时间</th>
        <th>电话 / 类型</th>
        <th>叫醒员</th>
        <th>状态</th>
        <th>金额</th>
        <th>操作</th>
        <th>提交</th>`;

    const buildRow = (item) => {
        let statusClass = "";
        switch (item.status) {
            case "待接单": statusClass = "status-pending"; break;
            case "进行中": statusClass = "status-processing"; break;
            case "已完成": statusClass = "status-done"; break;
        }
        return `
                <tr>
                    <td><input type="checkbox" class="order-checkbox" value="${escapeJsSingleQuote(getOrderIdentity(item))}" ${item.status !== "待接单" ? "data-status='processed'" : ""}></td>
                    <td>${wakeTimeCellHtml(item)}</td>
                    <td class="wake-phone-cell">${wakePhoneCellHtml(item)}</td>
                    <td>${wakeStaffNameCellHtml(item)}</td>
                    <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                    <td>${formatMoneyDisplay(item.amount ?? item.money)}</td>
                    <td>${getWakeRowActionHtml(item)}</td>
                    <td title="${formatTime(item.submittime)}">${formatSubmitTimeCompact(item.submittime)}</td>
                </tr>`;
    };

    if (isAdmin) {
        const ordersByDate = {};
        orders.forEach(order => {
            const orderDate = new Date(order.submittime).toLocaleDateString();
            if (!ordersByDate[orderDate]) ordersByDate[orderDate] = [];
            ordersByDate[orderDate].push(order);
        });
        const dates = Object.keys(ordersByDate).sort((a, b) => new Date(b) - new Date(a));

        dates.forEach(date => {
            const dateOrders = ordersByDate[date];
            html += `
            <tr class="date-collapse-header">
                <td colspan="8" style="padding: 0;">
                    <div class="date-header" onclick="toggleDateCollapse('admin-${date}')">
                        <span class="date-title">${date}（${dateOrders.length}单）</span>
                        <span class="date-arrow">▶</span>
                    </div>
                </td>
            </tr>
            <tr class="date-collapse-content" id="collapse-admin-${date}" style="display: none;">
                <td colspan="8" style="padding: 0;">
                    <div class="order-detail-wrap">
                        <table class="order-detail-table wake-order-compact">
                            <colgroup>
                                <col><col><col><col><col><col><col><col>
                            </colgroup>
                            <thead>
                                <tr>${theadCols}</tr>
                            </thead>
                    `;
            dateOrders.forEach(item => {
                html += buildRow(item);
            });
            html += `
                        </table>
                    </div>
                </td>
            </tr>`;
        });
    } else {
        html += `
            <thead>
                <tr>${theadCols}</tr>
            </thead>
        `;
        orders.forEach(item => {
            html += buildRow(item);
        });
    }

    document.getElementById("orderTable").innerHTML = html || `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
}

function wakeStaffNameCellHtml(item) {
    const rawName = item.staffname || "-";
    const hasStaff = String(item.staffid || "").trim() !== "";
    if (!isAdmin || item.status !== "进行中" || !hasStaff || rawName === "-") {
        if (typeof escapeHtml === "function") return escapeHtml(rawName);
        return String(rawName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    }
    const safeName = typeof escapeHtml === "function"
        ? escapeHtml(rawName)
        : String(rawName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const identity = escapeJsSingleQuote(getOrderIdentity(item));
    return `<button type="button" class="wake-staff-link" title="转派给其他叫醒员" onclick="openWakeReassignModal('${identity}')">${safeName}</button>`;
}

function closeWakeReassignModal() {
    wakeReassignPendingIdentity = "";
    const modal = document.getElementById("wakeReassignModal");
    if (modal) modal.style.display = "none";
}

async function openWakeReassignModal(identity) {
    if (!isAdmin) return;
    const modal = document.getElementById("wakeReassignModal");
    const listEl = document.getElementById("wakeReassignStaffList");
    const metaEl = document.getElementById("wakeReassignMeta");
    if (!modal || !listEl || !metaEl) return;

    wakeReassignPendingIdentity = String(identity || "").trim();
    if (!wakeReassignPendingIdentity) return;

    const allOrders = await getOrders();
    const idx = findOrderIndexByIdentity(allOrders, wakeReassignPendingIdentity);
    if (idx < 0) {
        alert("订单不存在或已变更。");
        wakeReassignPendingIdentity = "";
        return;
    }
    const order = allOrders[idx];
    if (order.status !== "进行中") {
        alert("仅「进行中」的订单可以转派叫醒员。");
        wakeReassignPendingIdentity = "";
        return;
    }

    metaEl.textContent = `当前：${order.staffname || "-"}（${order.staffid || "-"}）｜电话 ${order.phone || "-"}｜${formatWakeTimeDisplay(order.waketime)}`;

    const hintEl = document.getElementById("wakeReassignHint");
    if (hintEl) {
        const p = await getWakeReassignPenaltyAmount();
        const pText = typeof formatMoneyDisplay === "function" ? formatMoneyDisplay(p) : String(p);
        hintEl.textContent =
            p > 0
                ? `仅显示已绑定手机号与支付宝账号的员工；原叫醒员将扣 ${pText} 元并记入余额明细（因接错等原因处罚），金额取自「价格策略」— 叫醒订单 — 转接处罚。`
                : "仅显示已绑定手机号与支付宝账号的员工；当前「转接处罚」为 0 元，原叫醒员不会因转派被扣款。";
    }

    const staffList = await getStaffList();
    const eligible = staffList.filter((s) => {
        const phone = String(s.phone || "").trim();
        const acct = String(s.salaryAccount || "").trim();
        const sid = String(s.id || "").trim();
        return phone && acct && sid && sid !== String(order.staffid || "").trim();
    });

    if (eligible.length === 0) {
        listEl.innerHTML = `<div style="color:#64748b;font-size:14px;">没有可转派的员工（需已绑定手机号与支付宝，且不能仍是当前叫醒员）。</div>`;
        modal.style.display = "flex";
        return;
    }

    listEl.innerHTML = eligible
        .map((s) => {
            const sid = escapeJsSingleQuote(s.id);
            const snm = escapeJsSingleQuote(s.name || s.id);
            const label = typeof escapeHtml === "function"
                ? escapeHtml(`${s.name || s.id}（${s.id}）`)
                : `${String(s.name || s.id).replace(/&/g, "&amp;")}（${String(s.id).replace(/&/g, "&amp;")}）`;
            return `
            <div class="wake-reassign-row">
                <div style="font-size:14px;color:#1e293b;">${label}</div>
                <button type="button" class="success" onclick="confirmWakeReassignToStaff('${sid}','${snm}')">转派给 TA</button>
            </div>`;
        })
        .join("");

    modal.style.display = "flex";
}

async function confirmWakeReassignToStaff(newStaffId, newStaffName) {
    const identity = wakeReassignPendingIdentity;
    if (!identity || !isAdmin) return;

    const sid = String(newStaffId || "").trim();
    const sname = String(newStaffName || "").trim();
    if (!sid) return;

    let allOrders = await getOrders();
    const idx = findOrderIndexByIdentity(allOrders, identity);
    if (idx < 0) {
        alert("订单不存在或已变更。");
        closeWakeReassignModal();
        return;
    }
    const order = allOrders[idx];
    if (order.status !== "进行中") {
        alert("仅「进行中」的订单可以转派。");
        closeWakeReassignModal();
        return;
    }

    const oldStaffId = String(order.staffid || "").trim();
    if (sid === oldStaffId) {
        if (typeof showToast === "function") showToast("请选择其他员工。", "warning");
        else alert("请选择其他员工。");
        return;
    }

    const staffList = await getStaffList();
    const target = staffList.find((s) => String(s.id || "").trim() === sid);
    if (!target || !String(target.phone || "").trim() || !String(target.salaryAccount || "").trim()) {
        alert("该员工未绑定手机号或支付宝账号，无法转派。");
        return;
    }

    const nextName = String(target.name || sname || sid).trim() || sname;
    const penaltyAmt = await getWakeReassignPenaltyAmount();
    const confirmMsg =
        penaltyAmt > 0
            ? `确认将本单转派给「${nextName}」？\n原叫醒员将被扣款 ${formatMoneyDisplay(penaltyAmt)} 元（余额明细：因接错等原因处罚）。`
            : `确认将本单转派给「${nextName}」？\n当前价格策略中转接处罚为 0 元，原叫醒员不会被扣款。`;
    if (!confirm(confirmMsg)) {
        return;
    }

    order.staffid = sid;
    order.staffname = nextName;
    order.wake_staff_since = getChinaTimeISO();

    await saveOrders(allOrders);
    closeWakeReassignModal();

    if (oldStaffId && penaltyAmt > 0) {
        const oid = order.id !== undefined && order.id !== null && String(order.id).trim() !== "" ? String(order.id) : identity;
        const settleKey = `wake_reassign_penalty:${oid}:${oldStaffId}->${sid}`;
        const detailRes = await addSalaryDetail(
            oldStaffId,
            -Math.abs(penaltyAmt),
            "惩罚",
            "因接错等原因处罚（叫醒单转派）",
            new Date(),
            { settleKey }
        );
        const dup = detailRes && detailRes.reason === "duplicate";
        const ins = detailRes && detailRes.inserted === true;
        if (ins) {
            const okSal = await addStaffSalary(oldStaffId, -Math.abs(penaltyAmt));
            if (!okSal) {
                console.warn("转派后扣款：余额更新失败", { oldStaffId, settleKey });
                if (typeof showToast === "function") {
                    showToast("转派已保存，但对原叫醒员扣款未写入余额，请在团队管理中核对。", "warning");
                }
            }
        } else if (!dup) {
            console.warn("转派后扣款：明细未写入", detailRes);
            if (typeof showToast === "function") {
                showToast("转派已保存，但处罚明细未写入，请在团队管理中手动处理。", "warning");
            }
        }
    }

    if (typeof loadOrders === "function") loadOrders();
    if (typeof showToast === "function") {
        showToast(`已转派给「${nextName}」。订单完成后，收入将按新叫醒员结算。`, "success");
    } else {
        alert("转派成功。");
    }
}

function findOrderIndexByIdentity(allOrders, identity) {
    const targetIdentity = String(identity || "").trim();
    if (!targetIdentity) return -1;
    return allOrders.findIndex((item) => getOrderIdentity(item) === targetIdentity);
}

// 接单
async function takeOrderByIdentity(identity) {
    if (!(await ensureStaffContactAndAlipayBound())) {
        return;
    }

    let allOrders = await getOrders();
    const targetIndex = findOrderIndexByIdentity(allOrders, identity);

    if (targetIndex === -1) {
        alert("订单不存在！");
        return;
    }

    const targetOrder = allOrders[targetIndex];
    if (targetOrder.status !== "待接单") {
        alert("该订单已被接单，无法重复操作！");
        return;
    }

    targetOrder.status = "进行中";
    targetOrder.staffid = user.id;
    targetOrder.staffname = user.name;
    targetOrder.wake_staff_since = getChinaTimeISO();

    await saveOrders(allOrders);
    loadOrders();
    showToast("接单成功。", "success");
}

// 批量接单
async function batchTakeOrders() {
    if (!(await ensureStaffContactAndAlipayBound())) {
        return;
    }

    const checkedBoxes = document.querySelectorAll(".order-checkbox:checked");
    if (checkedBoxes.length === 0) {
        alert("请至少选择一个订单！");
        return;
    }

    const selectedOrderKeys = [];
    let hasProcessedOrder = false;

    checkedBoxes.forEach(box => {
        if (box.dataset.status === "processed") {
            hasProcessedOrder = true;
        }
        selectedOrderKeys.push(String(box.value || "").trim());
    });

    if (hasProcessedOrder) {
        alert("一键接单仅支持没接过的订单，请重新选择！");
        return;
    }

    let allOrders = await getOrders();
    let successCount = 0;

    allOrders.forEach(order => {
        if (selectedOrderKeys.includes(getOrderIdentity(order)) && order.status === "待接单") {
            order.status = "进行中";
            order.staffid = user.id;
            order.staffname = user.name;
            order.wake_staff_since = getChinaTimeISO();
            successCount++;
        }
    });

    await saveOrders(allOrders);
    loadOrders();
    showToast(`接单成功，共 ${successCount} 单。`, "success");
}

// 完成订单
async function finishOrderByIdentity(identity) {
    let allOrders = await getOrders();
    const targetIndex = findOrderIndexByIdentity(allOrders, identity);
    if (targetIndex === -1) {
        alert("订单不存在！");
        return;
    }
    const targetOrder = allOrders[targetIndex];
    if (targetOrder.status !== "进行中") {
        alert("仅能完成「进行中」的订单！");
        return;
    }
    targetOrder.status = "已完成";
    // 传递当前时间作为完成时间
    const completedTime = new Date();
    const settleRes = await settleOrderIncomeOnce(targetOrder, completedTime);
    targetOrder.salarysettled = settleRes.settled === true || settleRes.reason === "already_settled";

    await saveOrders(allOrders);
    loadOrders();
    if (targetOrder.salarysettled) {
        showToast("订单已完成，薪资已结算。", "success");
    } else {
        showToast("订单已完成，但薪资结算失败，请稍后重试。", "error");
    }
}

// 检查过期订单
async function checkExpiredOrders() {
    let allOrders = await getOrders();
    // 获取当前时间（本地时间，中国电脑就是UTC+8）
    const now = new Date();
    let isUpdated = false;

    for (const item of allOrders) {
        if (item.status === "已完成" && !item.salarysettled) {
            const settleRes = await settleOrderIncomeOnce(item, now);
            const settled = settleRes.settled === true || settleRes.reason === "already_settled";
            if (settled) {
                item.salarysettled = true;
                isUpdated = true;
            }
            continue;
        }
        if (item.status === "进行中") {
            // 获取订单提交时间（JavaScript 会自动将 UTC 时间转换为本地时间）
            const submitDate = new Date(item.submittime);

            // 获取订单提交日期（年-月-日，本地时间）
            const submitYear = submitDate.getFullYear();
            const submitMonth = submitDate.getMonth();
            const submitDay = submitDate.getDate();

            // 获取当前日期（年-月-日，本地时间）
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const currentDay = now.getDate();

            // 检查是否是昨天的订单（提交日期早于当前日期）
            const submitDateObj = new Date(submitYear, submitMonth, submitDay);
            const currentDateObj = new Date(currentYear, currentMonth, currentDay);

            if (submitDateObj < currentDateObj && !item.salarysettled) {
                item.status = "已完成";
                // 传递当前时间作为完成时间
                const settleRes = await settleOrderIncomeOnce(item, now);
                item.salarysettled = settleRes.settled === true || settleRes.reason === "already_settled";
                isUpdated = true;
            } else if (submitDateObj.getTime() === currentDateObj.getTime()) {
                // 计算提交日期的午夜（本地时间）
                const submitMidnight = new Date(submitYear, submitMonth, submitDay + 1);

                if (now >= submitMidnight && !item.salarysettled) {
                    item.status = "已完成";
                    // 传递当前时间作为完成时间
                    const settleRes = await settleOrderIncomeOnce(item, now);
                    item.salarysettled = settleRes.settled === true || settleRes.reason === "already_settled";
                    isUpdated = true;
                }
            }
        }
    }

    if (isUpdated) {
        await saveOrders(allOrders);
        loadOrders();
    }
}

// 清理过期订单（按 submittime 保留最近 7 天；须同步删除 Supabase 行，否则下次拉取仍会带回旧数据）
//
// 重要：此处只做「归档删行」，绝不调用 rollbackWakeOrderIncomeIfSettled。
// 与管理员「删除选中」不同——过期清理不扣员工余额，已结算工资保持不动。
async function cleanExpiredOrders() {
    let allOrders = await getOrders();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentOrders = allOrders.filter(order => {
        const orderDate = new Date(order.submittime);
        // JavaScript会自动将ISO字符串转换为本地时间
        return orderDate >= sevenDaysAgo;
    });

    if (recentOrders.length === allOrders.length) {
        return false;
    }

    const expiredOrders = allOrders.filter((order) => new Date(order.submittime) < sevenDaysAgo);
    const idsToDelete = [
        ...new Set(
            expiredOrders
                .map((o) => o.id)
                .filter((id) => id !== undefined && id !== null && String(id).trim() !== "")
        )
    ];

    if (typeof deleteWakeOrdersFromSupabase === "function" && idsToDelete.length > 0) {
        const delRes = await deleteWakeOrdersFromSupabase(idsToDelete);
        if (!delRes.ok) {
            console.warn("清理超期叫醒订单：云端删除失败，已跳过本次清理以免数据不一致。", delRes.error);
            return false;
        }
    }

    await saveOrders(recentOrders);
    return true;
}

// 获取当前时间（本地时间，中国电脑就是UTC+8）
function getChinaTime() {
    return new Date();
}

// 获取当前时间的 ISO 字符串（UTC 时间，与 Supabase 兼容）
function getChinaTimeISO() {
    return new Date().toISOString();
}

function getDefaultWakeDateTimeLocal() {
    const now = typeof getChinaTime === "function" ? getChinaTime() : new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}T06:00`;
}

function updateAddWakeAutoAmount() {
    const waketime = document.getElementById("addWakeTime")?.value || "";
    const amountInput = document.getElementById("addWakeAmount");
    if (!amountInput) return;
    const timePart = String(waketime).split("T")[1] || "";
    if (!timePart) {
        amountInput.value = "";
        return;
    }
    const amount = Number(calculateAmountByTime(timePart));
    amountInput.value = Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function openAddWakeOrderModal() {
    if (!isAdmin) {
        alert("只有管理员可以新增叫醒订单");
        return;
    }
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value == null ? "" : String(value);
    };
    setVal("addWakeTime", getDefaultWakeDateTimeLocal());
    setVal("addWakePhone", "");
    setVal("addWakeType", WAKE_TYPE_DEFAULT);
    setVal("addWakeNote", "");
    updateAddWakeAutoAmount();
    const modal = document.getElementById("addWakeOrderModal");
    if (modal) modal.style.display = "flex";
    const first = document.getElementById("addWakePhone");
    if (first) setTimeout(() => first.focus(), 50);
}

function closeAddWakeOrderModal() {
    const modal = document.getElementById("addWakeOrderModal");
    if (modal) modal.style.display = "none";
}

async function saveAddWakeOrder() {
    if (!isAdmin) {
        alert("只有管理员可以新增叫醒订单");
        return;
    }
    const waketime = document.getElementById("addWakeTime")?.value || "";
    const phone = document.getElementById("addWakePhone")?.value.trim() || "";
    const waketype = normalizeWakeType(document.getElementById("addWakeType")?.value);
    const note = document.getElementById("addWakeNote")?.value.trim() || "";
    const amountRaw = String(document.getElementById("addWakeAmount")?.value || "").trim();
    const inputAmount = parseFloat(amountRaw);

    if (!waketime) return alert("请选择叫醒时间！");
    const wakeTimeDate = new Date(waketime);
    const now = getChinaTime();
    if (wakeTimeDate < now) {
        alert("不能选择过去的时间作为叫醒时间！");
        return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) return alert("请输入11位有效手机号！");

    const time = waketime.split("T")[1];
    const autoAmount = Number(calculateAmountByTime(time));
    let amount = autoAmount;
    if (amountRaw !== "" && Number.isFinite(inputAmount)) {
        amount = inputAmount;
    }

    const newOrder = {
        waketime,
        phone,
        waketype,
        note,
        amount: Number.isFinite(amount) ? amount : 0,
        status: "待接单",
        serialnumber: null,
        staffid: "",
        staffname: "",
        salarysettled: false,
        submittime: getChinaTimeISO()
    };

    let allOrders = await getOrders();
    allOrders.push(newOrder);
    await saveOrders(allOrders);

    closeAddWakeOrderModal();
    loadOrders();
    showToast("上传成功。", "success");
}

/** 兼容旧按钮名 */
async function addSingleOrder() {
    return saveAddWakeOrder();
}

window.addEventListener("DOMContentLoaded", () => {
    const timeInput = document.getElementById("addWakeTime");
    if (timeInput && !timeInput.__wakeAmountBound) {
        timeInput.__wakeAmountBound = true;
        timeInput.addEventListener("change", updateAddWakeAutoAmount);
        timeInput.addEventListener("input", updateAddWakeAutoAmount);
    }
});

/** 仅用于管理员主动「删除选中」；自动清理超期订单（cleanExpiredOrders）不得调用，以免扣回已发工资。 */
async function rollbackWakeOrderIncomeIfSettled(order, rollbackTime = new Date()) {
    if (!order) return { rolledBack: false, reason: "no_order" };
    if (order.salarysettled !== true) return { rolledBack: false, reason: "not_settled" };
    const staffId = String(order.staffid || "").trim();
    if (!staffId) return { rolledBack: false, reason: "no_staff" };
    const amount = parseFloat(order.amount || order.money || 0);
    if (!Number.isFinite(amount) || amount === 0) return { rolledBack: false, reason: "bad_amount" };

    const ok = await addStaffSalary(staffId, -Math.abs(amount));
    if (!ok) return { rolledBack: false, reason: "balance_update_failed" };

    await addSalaryDetail(
        staffId,
        -Math.abs(amount),
        "订单收入",
        "叫醒订单删除，回退已结算收入",
        rollbackTime,
        { settleKey: `wake_income_rollback:${order.id ?? `${order.submittime || ""}:${order.phone || ""}:${order.waketime || ""}`}`, orderId: order.id ?? null }
    );
    return { rolledBack: true };
}

// 删除选中订单
async function deleteSelected() {
    const checkedKeys = Array.from(document.querySelectorAll(".order-checkbox:checked"))
        .map((cb) => String(cb.value || "").trim())
        .filter(Boolean);

    if (checkedKeys.length === 0) return alert("请选择要删除的订单！");
    if (!confirm(`确定删除选中的 ${checkedKeys.length} 条订单吗？`)) return;

    let allOrders = await getOrders();
    const selectedSet = new Set(checkedKeys);
    const selectedOrders = allOrders.filter((order) => selectedSet.has(getOrderIdentity(order)));
    if (selectedOrders.length === 0) {
        alert("未找到对应订单，列表可能已更新，请刷新页面后重试。");
        return;
    }

    const dedupeKeys = new Set(selectedOrders.map((o) => getWakeOrderDisplayDedupeKey(o)));
    const ordersToRemove = allOrders.filter((o) => dedupeKeys.has(getWakeOrderDisplayDedupeKey(o)));
    const idsToDelete = [
        ...new Set(
            ordersToRemove
                .map((o) => o.id)
                .filter((id) => id !== undefined && id !== null && String(id).trim() !== "")
        )
    ];

    // 先回退已结算收入，避免删单后账目不一致（含同键重复行）
    let rollbackFailedCount = 0;
    for (const order of ordersToRemove) {
        if (order.status === "已完成" && order.salarysettled === true) {
            const res = await rollbackWakeOrderIncomeIfSettled(order, new Date());
            if (res.rolledBack !== true) {
                rollbackFailedCount += 1;
                console.error("删除叫醒订单时回退结算失败：", { orderId: order.id, serialnumber: order.serialnumber, reason: res.reason });
            }
        }
    }
    if (rollbackFailedCount > 0) {
        alert(`删除已中止：有 ${rollbackFailedCount} 条已结算订单回退失败，请先核对员工余额后重试。`);
        return;
    }

    if (typeof deleteWakeOrdersFromSupabase === "function") {
        const delRes = await deleteWakeOrdersFromSupabase(idsToDelete);
        if (!delRes.ok) {
            const msg = delRes.error && delRes.error.message ? delRes.error.message : String(delRes.error || "");
            alert(msg ? `云端删除失败：${msg}` : "云端删除失败，请稍后重试。");
            return;
        }
    }

    allOrders = allOrders.filter((item) => !dedupeKeys.has(getWakeOrderDisplayDedupeKey(item)));
    await saveOrders(allOrders);

    loadOrders();
    if (typeof showToast === "function") {
        showToast("删除成功。", "success");
    } else {
        alert("删除成功！");
    }
}

// 修改选中订单
async function editSelected() {
    const checkedKeys = Array.from(document.querySelectorAll(".order-checkbox:checked"))
        .map((cb) => String(cb.value || "").trim())
        .filter(Boolean);

    if (checkedKeys.length !== 1) return alert("请仅选择一条订单进行修改！");

    let allOrders = await getOrders();
    const targetIndex = allOrders.findIndex((item) => getOrderIdentity(item) === checkedKeys[0]);
    if (targetIndex === -1) return alert("订单不存在！");

    const target = allOrders[targetIndex];
    const newTime = prompt("修改叫醒时间（格式：YYYY-MM-DDTHH:MM）", target.waketime);
    const newPhone = prompt("修改手机号", target.phone);
    const newType = prompt(
        `修改类型（${WAKE_TYPE_OPTIONS.join(" / ")}）`,
        formatWakeTypeDisplay(target)
    );
    const newNote = prompt("修改备注", target.note);

    if (!newTime || !newPhone) return alert("时间和手机号不能为空！");
    if (!/^1[3-9]\d{9}$/.test(newPhone)) return alert("手机号格式错误！");
    if (newType == null) return;
    const normalizedType = normalizeWakeType(newType, "");
    if (!normalizedType) return alert(`类型无效，请填写：${WAKE_TYPE_OPTIONS.join("、")}`);
    const newTimeDate = new Date(newTime);
    const now = new Date();
    if (newTimeDate < now) {
        alert("不能选择过去的时间作为叫醒时间！");
        return;
    }

    target.waketime = newTime;
    target.phone = newPhone;
    target.waketype = normalizedType;
    target.note = newNote;
    target.amount = calculateAmountByTime(newTime.split('T')[1]);
    target.money = target.amount;

    await saveOrders(allOrders);
    loadOrders();
    alert("修改成功！");
}

// 搜索订单
function searchOrders() {
    const searchInput = document.getElementById("searchInput");
    const rawTerm = String(searchInput?.value || "").trim();
    const searchTerm = rawTerm.toLowerCase();
    window.__wakeSearchKeyword = rawTerm;
    if (!searchTerm) {
        renderOrders(originalOrders || []);
        return;
    }

    const filteredOrders = (originalOrders || []).filter(order => {
        // 搜索电话
        if (order.phone && order.phone.toLowerCase().includes(searchTerm)) {
            return true;
        }
        // 搜索时间
        const waketime = formatWakeTimeDisplay(order.waketime);
        if (waketime && waketime.toLowerCase().includes(searchTerm)) {
            return true;
        }
        // 搜索类型
        const waketype = formatWakeTypeDisplay(order);
        if (waketype && waketype.toLowerCase().includes(searchTerm)) {
            return true;
        }
        // 搜索备注
        if (order.note && order.note.toLowerCase().includes(searchTerm)) {
            return true;
        }
        // 搜索状态
        if (order.status && order.status.toLowerCase().includes(searchTerm)) {
            return true;
        }
        // 搜索叫醒员
        if (order.staffname && order.staffname.toLowerCase().includes(searchTerm)) {
            return true;
        }
        return false;
    });

    renderOrders(filteredOrders);
}

// 清空搜索
function clearSearch() {
    document.getElementById("searchInput").value = "";
    renderOrders(originalOrders || []);
}

const AI_ORDER_PARSE_SYSTEM_PROMPT = `你是叫醒订单识别助手。用户粘贴微信群/表格/备忘录里的多行文本，你要只提取「叫醒订单」，忽略无关闲聊、广告、空行。

【输出要求】
- 仅输出一个 JSON 数组，不要 markdown、不要代码块、不要解释、不要注释。
- 必须是合法 JSON：键和字符串一律用英文双引号 "；不要尾逗号；note 内若有引号请去掉或改成空格。
- 每个元素表示「同一行或同一条连续文案里、同一个手机号」的一批叫醒。

【字段】
- phone: 字符串，11 位中国大陆手机号，仅数字（去掉空格、短横线、+86 等后剩下的 11 位）。
- wakeTime: 可选，单个叫醒时刻，必须是 24 小时制字符串 HH:mm（如 07:20、09:05）。
- wakeTimes: 可选，字符串数组；同一行同一号码有多个叫醒点时，把所有点都放进这里，每项均为 HH:mm。
- wakeDate: 可选，字符串 YYYY-MM-DD；仅当原文明确「明天/后天/大后天/具体日期」对应叫醒日时才填，否则不要填（系统会用当天）。
- waketype: 字符串，订单类型，只能是「叫醒」「回访」「多次叫醒」「多次回访」之一；原文未写则填「叫醒」。同一号码一行多个时刻优先「多次叫醒」；文案含回访且多时刻用「多次回访」；仅回访单次用「回访」。
- note: 字符串，除电话与时间外的提醒内容；没有则 ""。不要把类型词单独塞进 note（类型放 waketype）。

【识别规则】
1. 一行里只有一个号码、多个时间（如「13900001111 7:00 7:20 7:40」「10点 10点20 10点40 189xxx」），只输出 1 个对象，多个时刻全部进 wakeTimes，不要拆成多个对象；waketype 用「多次叫醒」（若文案含回访则「多次回访」）。
2. 原文换行后再次出现同一号码，视为另一批订单，单独输出对象（各自时间与备注）。
3. 若同时有 wakeTime 与 wakeTimes，合并所有时刻并去重，不要丢 wakeTime。
4. 电话与时间顺序可互换；可带圆圈序号①、破折号、逗号、中文逗号，一律忽略。
5. 中文时间必须换算为 HH:mm：早上七点半→07:30、早9点30/早9:30→09:30、上午8点→08:00、中午12点→12:00、下午2点→14:00、下午2点半→14:30、晚上8点15→20:15、今晚9点→21:00、零点/凌晨0点30→00:30、凌晨3点→03:00、8點整→08:00。
6. 「明天早上7点」：wakeDate 用明天日期，wakeTime 用 07:00；只有「明天」没有钟点则不要臆造时间。
7. 备注里若包含与叫醒无关的长说明，保留简短可执行信息即可；不要把手机号写进 note。
8. 原文出现「回访」「多次叫醒」「多次回访」等字样时，正确填入 waketype。

【输出示例 1】
输入一行：18953772567 10点 10点20 10点40
输出：[{"phone":"18953772567","wakeTimes":["10:00","10:20","10:40"],"waketype":"多次叫醒","note":""}]

【输出示例 2】
输入：今天9:45，17371992416
输出：[{"phone":"17371992416","wakeTime":"09:45","waketype":"叫醒","note":""}]

【输出示例 3】
输入两行同一号码不同时间：
18900001111 7:00 第一条
18900001111 8:30 第二条
输出：[{"phone":"18900001111","wakeTime":"07:00","waketype":"叫醒","note":"第一条"},{"phone":"18900001111","wakeTime":"08:30","waketype":"叫醒","note":"第二条"}]

【输出示例 4】
输入：回访 15200001111 9:00
输出：[{"phone":"15200001111","wakeTime":"09:00","waketype":"回访","note":""}]`;

function repairAiJsonText(text) {
    let t = String(text || "");
    // 去掉常见前后缀杂质
    t = t.replace(/^\uFEFF/, "").trim();
    // 中文/弯引号 → 英文双引号
    t = t.replace(/[“”„‟「」『』]/g, '"').replace(/[‘’‚‛]/g, "'");
    // 全角冒号/逗号（仅在结构性位置尽量替换）
    t = t.replace(/\uFF1A/g, ":").replace(/\uFF0C/g, ",");
    // 尾逗号：,{ 或 ,]
    t = t.replace(/,\s*([}\]])/g, "$1");
    // 无引号 key：{phone: → {"phone":
    t = t.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    // 单引号字符串 → 双引号（简单场景）
    t = t.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => `"${inner.replace(/"/g, '\\"')}"`);
    return t.trim();
}

function tryParseJsonArrayLoose(text) {
    const candidates = [];
    const raw = String(text || "").trim();
    if (!raw) return null;
    candidates.push(raw);
    candidates.push(repairAiJsonText(raw));

    const idx = raw.indexOf("[");
    const last = raw.lastIndexOf("]");
    if (idx !== -1 && last > idx) {
        const sliced = raw.slice(idx, last + 1);
        candidates.push(sliced);
        candidates.push(repairAiJsonText(sliced));
    }

    for (let i = 0; i < candidates.length; i += 1) {
        try {
            const parsed = JSON.parse(candidates[i]);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === "object") return [parsed];
        } catch (_) { }
    }

    // 逐个对象抢救：匹配 {...} 片段再拼数组
    const repaired = repairAiJsonText(raw);
    const objects = [];
    const objRe = /\{[^{}]*\}/g;
    let m;
    while ((m = objRe.exec(repaired)) !== null) {
        try {
            const obj = JSON.parse(repairAiJsonText(m[0]));
            if (obj && typeof obj === "object") objects.push(obj);
        } catch (_) { }
    }
    if (objects.length > 0) return objects;
    return null;
}

function extractJsonArrayFromAiContent(raw) {
    if (raw == null || typeof raw !== "string") {
        throw new Error("模型返回为空");
    }
    let t = raw.trim();
    const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
        t = fenced[1].trim();
    } else if (t.startsWith("```")) {
        t = t.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/i, "").trim();
    }
    const parsed = tryParseJsonArrayLoose(t);
    if (parsed) return parsed;
    throw new Error("无法解析 JSON：模型返回格式异常，请重试或简化文本");
}

/** AI 失败时的本地兜底：按行提取手机号 + 时间 */
function parseWakeOrdersLocallyFromText(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const out = [];
    lines.forEach((line) => {
        const phoneMatch = line.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/);
        if (!phoneMatch) return;
        const phone = phoneMatch[1];
        const withoutPhone = line.replace(phoneMatch[0], " ");
        const times = [];
        const pushTime = (hh, mm) => {
            const h = Number(hh);
            const m = Number(mm);
            if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        };
        // 6:30 / 06：30 / 14:15 / 6.30
        let re = /(\d{1,2})\s*[:：.]\s*(\d{1,2})/g;
        let tm;
        while ((tm = re.exec(withoutPhone)) !== null) {
            pushTime(tm[1], tm[2]);
        }
        // 六点半 / 早上六点半
        re = /(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*(\d{1,2}|[零一二三四五六七八九十两]+)\s*点\s*(半)?/g;
        while ((tm = re.exec(withoutPhone)) !== null) {
            const cnMap = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
            let h = Number(tm[2]);
            if (!Number.isFinite(h)) {
                const s = String(tm[2]);
                if (s === "十") h = 10;
                else if (s.startsWith("十")) h = 10 + (cnMap[s.slice(1)] || 0);
                else h = cnMap[s];
            }
            if (!Number.isFinite(h)) continue;
            const period = tm[1] || "";
            if (/下午|晚上|今晚/.test(period) && h < 12) h += 12;
            if (/中午/.test(period) && h < 11) h = 12;
            pushTime(h, tm[3] ? 30 : 0);
        }
        const uniq = [...new Set(times)];
        if (uniq.length === 0) return;
        const note = withoutPhone
            .replace(/(\d{1,2})\s*[:：.]\s*(\d{1,2})/g, " ")
            .replace(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*(\d{1,2}|[零一二三四五六七八九十两]+)\s*点\s*(半)?/g, " ")
            .replace(/电话|手机|号码|[:：,，]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        out.push({
            phone,
            wakeTimes: uniq,
            wakeTime: uniq[0],
            note,
            waketype: inferWakeTypeFromAiItem({ note }, uniq.length)
        });
    });
    return out;
}

function normalizePhoneForAiBatch(phone) {
    const digits = String(phone ?? "").replace(/\D/g, "");
    if (/^1[3-9]\d{9}$/.test(digits)) {
        return digits;
    }
    return "";
}

function collectWakeTimesFromAiObject(o) {
    const list = [];
    const pushOne = (s) => {
        const v = String(s ?? "").trim().replace(/：/g, ":");
        if (v) {
            list.push(v);
        }
    };
    if (Array.isArray(o.wakeTimes)) {
        o.wakeTimes.forEach(pushOne);
    }
    if (Array.isArray(o.wake_times)) {
        o.wake_times.forEach(pushOne);
    }
    const single = o.wakeTime ?? o.waketime ?? o.wake_time;
    if (single != null && String(single).trim() !== "") {
        const s = String(single).trim().replace(/：/g, ":");
        const matches = s.match(/\d{1,2}:\d{2}/g);
        if (matches && matches.length > 1) {
            matches.forEach(pushOne);
        } else {
            pushOne(single);
        }
    }
    const seen = new Set();
    const unique = [];
    for (const item of list) {
        const key = item.replace(/：/g, ":");
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }
    return unique;
}

function padHm(h, m) {
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return null;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function adjustHourByMeridiem(h, ctx) {
    if (/下午|晚上|午后|今晚/.test(ctx)) {
        if (h >= 1 && h <= 11) {
            return h + 12;
        }
    }
    return h;
}

function parseChineseClockToken(token, lineContext) {
    const ctx = lineContext || token || "";
    let t = String(token ?? "").trim().replace(/：/g, ":");
    if (!t) {
        return null;
    }
    t = t.replace(
        /^(?:今天|明日|明天|今早|明早|早晨|早上|早|上午|中午|下午|晚上|午后|今晚|凌晨)+/,
        ""
    );

    let mm;
    if ((mm = t.match(/^(?:零点|0点)(?:(\d{1,2})分?)?$/))) {
        const min = mm[1] != null && mm[1] !== "" ? parseInt(mm[1], 10) : 0;
        return padHm(0, Number.isNaN(min) ? 0 : min);
    }
    if ((mm = t.match(/^(\d{1,2})点半$/)) || (mm = t.match(/^(\d{1,2})点30$/))) {
        const h0 = parseInt(mm[1], 10);
        if (Number.isNaN(h0)) {
            return null;
        }
        return padHm(adjustHourByMeridiem(h0, ctx), 30);
    }
    if ((mm = t.match(/^(\d{1,2})点整$/)) || (mm = t.match(/^(\d{1,2})点$/))) {
        const h0 = parseInt(mm[1], 10);
        if (Number.isNaN(h0)) {
            return null;
        }
        return padHm(adjustHourByMeridiem(h0, ctx), 0);
    }
    if ((mm = t.match(/^(\d{1,2})点(\d{1,2})分?$/))) {
        const h0 = parseInt(mm[1], 10);
        const m0 = parseInt(mm[2], 10);
        if (Number.isNaN(h0) || Number.isNaN(m0)) {
            return null;
        }
        return padHm(adjustHourByMeridiem(h0, ctx), m0);
    }
    return null;
}

function coerceTimeToHHmm(token, lineContext) {
    const t = String(token ?? "").trim().replace(/：/g, ":");
    if (!t) {
        return null;
    }
    try {
        return normalizeTime(t);
    } catch (_) {
        /* fall through */
    }
    const fromCn = parseChineseClockToken(t, lineContext || t);
    if (fromCn) {
        return fromCn;
    }
    const colonHit = t.match(/\d{1,2}:\d{2}/);
    if (colonHit) {
        try {
            return normalizeTime(colonHit[0]);
        } catch (_) {
            /* fall through */
        }
    }
    return null;
}

/** 把「和/与/、」及纯空格隔开的多个时间片拆开（不拆单个 HH:mm） */
function expandTimeStringsBeforeNormalize(rawList) {
    const splitRe = /(?:和|与|以及|再到|然后|各|[/、，,;|｜])+/;
    const out = [];
    for (const raw of rawList) {
        const s = String(raw).trim();
        if (!s) {
            continue;
        }
        const bySep = s.split(splitRe).map((x) => x.trim()).filter(Boolean);
        if (bySep.length > 1) {
            bySep.forEach((p) => out.push(p));
            continue;
        }
        const bySpace = s.split(/\s+/).filter(Boolean);
        if (bySpace.length > 1 && bySpace.every((p) => /点|[:：]/.test(p))) {
            bySpace.forEach((p) => out.push(p));
            continue;
        }
        out.push(s);
    }
    return out;
}

function pickWakeDateStr(o, fallbackDateStr) {
    const raw = o.wakeDate ?? o.date ?? o.wakeupDate ?? o.wake_date;
    if (raw == null) {
        return fallbackDateStr;
    }
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return fallbackDateStr;
    }
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
        return fallbackDateStr;
    }
    return s;
}

// 批量识别订单
async function parseBatchOrders() {
    const text = document.getElementById("batchText").value.trim();
    if (!text) {
        alert("请粘贴订单文本！");
        return;
    }

    document.getElementById("parsePreview").innerHTML = "🤖 识别中...";
    document.getElementById("batchUploadBtn").disabled = true;
    parsedBatchOrders = [];

    try {
        // 直接调用AI API
        const res = await fetch("/api/ai-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    {
                        role: "system",
                        content: AI_ORDER_PARSE_SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content:
                            "以下为待识别文本。只提取其中的叫醒订单，忽略闲聊与无关内容；输出必须是 JSON 数组。\n\n<<<ORDER_TEXT\n" +
                            text +
                            "\nORDER_TEXT>>>"
                    }
                ],
                temperature: 0.05,
                top_p: 0.75,
                max_tokens: 8192
            })
        });

        const data = await res.json();
        if (data.error) {
            const errMsg = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
            throw new Error(errMsg);
        }
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("模型返回格式异常");
        }

        const resultText = data.choices[0].message.content;
        let orders = [];
        let usedLocalFallback = false;
        try {
            orders = extractJsonArrayFromAiContent(resultText);
        } catch (jsonErr) {
            orders = parseWakeOrdersLocallyFromText(text);
            usedLocalFallback = true;
            if (!orders.length) {
                throw jsonErr;
            }
        }
        if (!Array.isArray(orders) || orders.length === 0) {
            orders = parseWakeOrdersLocallyFromText(text);
            usedLocalFallback = true;
        }

        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const built = [];
        const warnings = [];
        if (usedLocalFallback) {
            warnings.push("AI 返回 JSON 异常，已改用本地规则识别（请核对预览结果）");
        }

        orders.forEach((o, idx) => {
            const phone = normalizePhoneForAiBatch(o.phone);
            if (!phone) {
                warnings.push(`第 ${idx + 1} 条原始记录：手机号无效，已跳过`);
                return;
            }
            let rawTimes = collectWakeTimesFromAiObject(o);
            rawTimes = expandTimeStringsBeforeNormalize(rawTimes);
            if (rawTimes.length === 0) {
                warnings.push(`第 ${idx + 1} 条原始记录（${phone}）：未解析到叫醒时间，已跳过`);
                return;
            }
            const noteRaw = o.note != null ? String(o.note).trim() : "";
            const note = noteRaw === "" ? "-" : noteRaw;
            const waketype = inferWakeTypeFromAiItem(o, rawTimes.length);
            const dateForRow = pickWakeDateStr(o, dateStr);
            const lineHint = [noteRaw, o.wakeTime, o.waketime, o.wake_time, Array.isArray(o.wakeTimes) ? o.wakeTimes.join(" ") : ""]
                .filter((x) => x != null && String(x).trim() !== "")
                .join(" ");

            rawTimes.forEach((timeRaw) => {
                const time = coerceTimeToHHmm(timeRaw, lineHint);
                if (!time) {
                    warnings.push(`号码 ${phone}：时刻「${timeRaw}」无法解析，已跳过`);
                    return;
                }
                built.push({
                    waketime: `${dateForRow}T${time}`,
                    phone,
                    waketype,
                    note,
                    amount: calculateAmountByTime(time),
                    status: "待接单",
                    serialnumber: null,
                    staffid: "",
                    staffname: "",
                    salarysettled: false,
                    submittime: getChinaTimeISO()
                });
            });
        });

        if (built.length === 0) {
            throw new Error("没有生成任何有效订单，请检查文本或重试识别");
        }

        parsedBatchOrders = built;

        parsedBatchOrders.sort((a, b) => {
            const t1 = formatWakeTimeDisplay(a.waketime);
            const t2 = formatWakeTimeDisplay(b.waketime);
            const c = t1.localeCompare(t2);
            if (c !== 0) return c;
            return new Date(a.submittime) - new Date(b.submittime);
        });

        let html = "<div>✅ 识别完成：</div>";
        parsedBatchOrders.forEach((it, i) => {
            html += `<div>第${i + 1}单：${formatWakeTimeDisplay(it.waketime)} ${it.phone} ${formatWakeTypeDisplay(it)} 备注：${it.note}</div>`;
        });
        if (warnings.length) {
            html += '<div style="margin-top:10px;color:#b45309;font-size:13px;">⚠ 部分提示（已跳过无效项）：<br>' + warnings.map(w => `· ${w}`).join("<br>") + "</div>";
        }
        document.getElementById("parsePreview").innerHTML = html;
    } catch (e) {
        parsedBatchOrders = [];
        document.getElementById("parsePreview").innerHTML = "❌ 识别失败：" + e.message;
    } finally {
        document.getElementById("batchUploadBtn").disabled = parsedBatchOrders.length === 0;
    }
}

// 批量上传订单
async function uploadBatchOrders() {
    if (parsedBatchOrders.length === 0) return alert("请先识别订单！");

    const uploadCount = parsedBatchOrders.length;
    let allOrders = await getOrders();
    allOrders = [...allOrders, ...parsedBatchOrders];

    await saveOrders(allOrders);
    loadOrders();

    document.getElementById("batchText").value = "";
    document.getElementById("parsePreview").innerHTML = "";
    document.getElementById("batchUploadBtn").disabled = true;
    parsedBatchOrders = [];

    showToast(`批量上传成功，共 ${uploadCount} 条。`, "success");
}
