// 加载订单
async function loadOrders() {
    let allOrders = await getOrders();
    allOrders = generateFixedSerial(allOrders);
    await saveOrders(allOrders);

    let displayOrders = [];
    const today = new Date().toLocaleDateString();
    if (isAdmin) {
        displayOrders = [...allOrders].sort((a, b) => a.serialnumber - b.serialnumber);
    } else if (isStaff) {
        displayOrders = allOrders.filter(item => {
            if (item.status === "待接单") {
                return true;
            }
            if (item.staffid && item.staffid === user.id) {
                const orderDate = new Date(item.submittime).toLocaleDateString();
                return orderDate === today;
            }
            return false;
        }).sort((a, b) => {
            // 优先展示未接的订单
            if (a.status === "待接单" && b.status !== "待接单") return -1;
            if (a.status !== "待接单" && b.status === "待接单") return 1;
            // 然后按序号排序
            return a.serialnumber - b.serialnumber;
        });
    }

    // 保存原始订单数据用于搜索
    originalOrders = displayOrders;
    renderOrders(displayOrders);
}

// 渲染订单
function renderOrders(orders) {
    if (isStaff && mobileMQ.matches) {
        renderCards(orders);
    } else {
        renderTable(orders);
    }
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
                        <th>备注</th>
                        <th>状态</th>
                        <th>金额</th>
                        <th>操作</th>
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
                            actionHtml = `<button class="warning" onclick="takeOrder(${item.serialNumber}, '${item.wakeTime}', '${item.phone}')">接单</button>`;
                        } else {
                            actionHtml = `<span class="status-badge ${statusClass}">${item.status}</span>`;
                        }

                        const showTime = item.wakeTime.includes('T') ? item.wakeTime.split('T')[1] : item.wakeTime;

                        html += `
                        <tr>
                            <td>${item.serialNumber}</td>
                            <td>${showTime}</td>
                            <td>${item.phone}</td>
                            <td>${item.note || '-'}</td>
                            <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                            <td>${(item.amount || item.money).toFixed(2)} 元</td>
                            <td>${actionHtml}</td>
                        </tr>
                        `;
                    });
                } else {
                    html = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
                }
                tableContainer.innerHTML = html;
            }
            return;
        }

        let html = "";
        orders.forEach(item => {
            let statusClass = "";
            switch (item.status) {
                case "待接单": statusClass = "status-pending"; break;
                case "进行中": statusClass = "status-processing"; break;
                case "已完成": statusClass = "status-done"; break;
            }

            let actionHtml = "";
            if (isStaff && item.status === "待接单") {
                actionHtml = `<button class="warning" onclick="takeOrder(${item.serialNumber}, '${item.wakeTime}', '${item.phone}')">接单</button>`;
            } else {
                actionHtml = `<span class="status-badge ${statusClass}">${item.status}</span>`;
            }

            const showTime = item.wakeTime.includes('T') ? item.wakeTime.split('T')[1] : item.wakeTime;

            html += `
            <div class="order-card">
                <div class="order-card-header">
                    <div class="order-card-title">
                        <input type="checkbox" class="order-checkbox" value="${item.serialNumber}" ${item.status !== "待接单" ? "data-status='processed'" : ""}>
                        <span class="serial-number">${item.serialNumber}</span>
                        <span class="time">${showTime}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="status-badge ${statusClass}">${item.status}</span>
                        <span class="order-money">${(item.amount || item.money).toFixed(2)} 元</span>
                    </div>
                </div>
                <div class="order-card-body">
                    <div class="order-kv">
                        <div class="k">电话</div>
                        <div class="v">${item.phone}</div>
                    </div>
                    <div class="order-kv">
                        <div class="k">备注</div>
                        <div class="v">${item.note || '-'}</div>
                    </div>
                </div>
                <div class="order-card-footer">
                    <div style="color:#64748b;font-size:12px;">勾选后可一键接单</div>
                    <div>${actionHtml}</div>
                </div>
            </div>`;
        });

        container.innerHTML = html || `<div style="color:#64748b;font-size:14px;padding:12px;">暂无订单</div>`;
    } catch (error) {
        console.error("渲染订单卡片失败：", error);
    }
}

// 渲染表格（桌面端）
function renderTable(orders) {
    let html = "";

    if (isAdmin) {
        // 按日期分组订单
        const ordersByDate = {};
        orders.forEach(order => {
            const orderDate = new Date(order.submitTime).toLocaleDateString();
            if (!ordersByDate[orderDate]) {
                ordersByDate[orderDate] = [];
            }
            ordersByDate[orderDate].push(order);
        });

        // 按日期倒序排列
        const dates = Object.keys(ordersByDate).sort((a, b) => new Date(b) - new Date(a));

        dates.forEach(date => {
            const dateOrders = ordersByDate[date];
            html += `
            <tr class="date-collapse-header">
                <td colspan="10" style="padding: 0;">
                    <div class="date-header" onclick="toggleDateCollapse('admin-${date}')">
                        <span class="date-title">${date}（${dateOrders.length}单）</span>
                        <span class="date-arrow">▶</span>
                    </div>
                </td>
            </tr>
            <tr class="date-collapse-content" id="collapse-admin-${date}" style="display: none;">
                <td colspan="10" style="padding: 0;">
                    <div style="padding: 12px;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 1000px;">
                            <thead>
                                <tr>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">选择</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">序号</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒时间</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">电话</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">备注</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒员</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">状态</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">金额</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">操作</th>
                                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">提交时间</th>
                                </tr>
                            </thead>
                    `;

            dateOrders.forEach(item => {
                let statusClass = "";
                switch (item.status) {
                    case "待接单": statusClass = "status-pending"; break;
                    case "进行中": statusClass = "status-processing"; break;
                    case "已完成": statusClass = "status-done"; break;
                }

                let actionBtn = "无操作权限";
                if (isAdmin) {
                    if (item.status === "进行中") {
                        actionBtn = `<button class="success" onclick="finishOrder(${item.serialnumber}, '${item.waketime}', '${item.phone}')">手动完成</button>`;
                    } else if (item.status === "待接单") {
                        actionBtn = "待接单";
                    } else {
                        actionBtn = "已完成";
                    }
                } else if (isStaff && item.status === "待接单") {
                    actionBtn = `<button class="warning" onclick="takeOrder(${item.serialnumber}, '${item.waketime}', '${item.phone}')">接单</button>`;
                } else if (item.status === "进行中") {
                    actionBtn = "进行中";
                } else if (item.status === "已完成") {
                    actionBtn = "已完成";
                }

                const showTime = item.waketime.includes('T') ? item.waketime.split('T')[1] : item.waketime;

                html += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px;"><input type="checkbox" class="order-checkbox" value="${item.serialnumber}" ${item.status !== "待接单" ? "data-status='processed'" : ""}></td>
                    <td style="padding: 12px; font-weight: 600; color: #2563eb;">${item.serialnumber}</td>
                    <td style="padding: 12px;">${showTime}</td>
                    <td style="padding: 12px;">${item.phone}</td>
                    <td style="padding: 12px;">${item.note || '-'}</td>
                    <td style="padding: 12px;">${item.staffname || '-'}</td>
                    <td style="padding: 12px;"><span class="status-badge ${statusClass}">${item.status}</span></td>
                    <td style="padding: 12px;">${(item.amount || item.money).toFixed(2)} 元</td>
                    <td style="padding: 12px;">${actionBtn}</td>
                    <td style="padding: 12px;">${formatTime(item.submittime)}</td>
                </tr>
                `;
            });

            html += `
                        </table>
                    </div>
                </td>
            </tr>
            `;
        });
    } else {
        // 非管理员显示普通表格
        html += `
            <thead>
                <tr>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">选择</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">序号</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒时间</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">电话</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">备注</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">叫醒员</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">状态</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">金额</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">操作</th>
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">提交时间</th>
                </tr>
            </thead>
        `;
        orders.forEach(item => {
            let statusClass = "";
            switch (item.status) {
                case "待接单": statusClass = "status-pending"; break;
                case "进行中": statusClass = "status-processing"; break;
                case "已完成": statusClass = "status-done"; break;
            }

            let actionBtn = "无操作权限";
            if (isAdmin) {
                if (item.status === "进行中") {
                    actionBtn = `<button class="success" onclick="finishOrder(${item.serialNumber}, '${item.wakeTime}', '${item.phone}')">手动完成</button>`;
                } else if (item.status === "待接单") {
                    actionBtn = "待接单";
                } else {
                    actionBtn = "已完成";
                }
            } else if (isStaff && item.status === "待接单") {
                actionBtn = `<button class="warning" onclick="takeOrder(${item.serialnumber}, '${item.waketime}', '${item.phone}')">接单</button>`;
            } else if (item.status === "进行中") {
                actionBtn = "进行中";
            } else if (item.status === "已完成") {
                actionBtn = "已完成";
            }

            const showTime = item.waketime.includes('T') ? item.waketime.split('T')[1] : item.waketime;

            html += `
    <tr>
      <td><input type="checkbox" class="order-checkbox" value="${item.serialnumber}" ${item.status !== "待接单" ? "data-status='processed'" : ""}></td>
      <td class="serial-number">${item.serialnumber}</td>
      <td>${showTime}</td>
      <td>${item.phone}</td>
      <td>${item.note || '-'}</td>
      <td>${item.staffname || '-'}</td>
      <td><span class="status-badge ${statusClass}">${item.status}</span></td>
      <td>${(item.amount || item.money).toFixed(2)} 元</td>
      <td>${actionBtn}</td>
      <td>${formatTime(item.submittime)}</td>
    </tr>`;
        });
    }

    document.getElementById("orderTable").innerHTML = html || `<tr><td colspan="10" style="text-align: center; padding: 20px; color: #64748b;">暂无订单</td></tr>`;
}

// 接单
async function takeOrder(serialnumber, waketime, phone) {
    let allOrders = await getOrders();
    // 使用serialnumber、waketime和phone的组合来查找订单，确保找到正确的订单
    const targetIndex = allOrders.findIndex(item =>
        item.serialnumber === serialnumber &&
        item.waketime === waketime &&
        item.phone === phone
    );

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

    await saveOrders(allOrders);
    loadOrders();
    showToast("接单成功。", "success");
}

// 批量接单
async function batchTakeOrders() {
    const checkedBoxes = document.querySelectorAll(".order-checkbox:checked");
    if (checkedBoxes.length === 0) {
        alert("请至少选择一个订单！");
        return;
    }

    const selectedSerials = [];
    let hasProcessedOrder = false;

    checkedBoxes.forEach(box => {
        const serial = parseInt(box.value);
        if (box.dataset.status === "processed") {
            hasProcessedOrder = true;
        }
        selectedSerials.push(serial);
    });

    if (hasProcessedOrder) {
        alert("一键接单仅支持没接过的订单，请重新选择！");
        return;
    }

    let allOrders = await getOrders();
    let successCount = 0;

    allOrders.forEach(order => {
        if (selectedSerials.includes(order.serialnumber) && order.status === "待接单") {
            order.status = "进行中";
            order.staffid = user.id;
            order.staffname = user.name;
            successCount++;
        }
    });

    await saveOrders(allOrders);
    loadOrders();
    showToast(`接单成功，共 ${successCount} 单。`, "success");
}

// 完成订单
async function finishOrder(serialnumber, waketime, phone) {
    let allOrders = await getOrders();
    // 使用serialnumber、waketime和phone的组合来查找订单，确保找到正确的订单
    const targetIndex = allOrders.findIndex(item =>
        item.serialnumber === serialnumber &&
        item.waketime === waketime &&
        item.phone === phone
    );
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
    targetOrder.salarysettled = true;
    await addSalary(targetOrder.staffid, targetOrder.amount || targetOrder.money);

    await saveOrders(allOrders);
    loadOrders();
    showToast("订单已完成，薪资已结算。", "success");
}

// 检查过期订单
async function checkExpiredOrders() {
    let allOrders = await getOrders();
    const now = new Date();
    let isUpdated = false;

    allOrders.forEach(item => {
        if (item.status === "进行中") {
            const submitDate = new Date(item.submittime);
            // 获取订单提交当天的日期（年-月-日）
            const submitDateStr = submitDate.toLocaleDateString();
            // 获取当前日期（年-月-日）
            const currentDateStr = now.toLocaleDateString();

            // 只有当天的订单才会被自动结算
            if (submitDateStr === currentDateStr) {
                const submitMidnight = new Date(submitDate.getFullYear(), submitDate.getMonth(), submitDate.getDate() + 1);

                if (now >= submitMidnight && !item.salarysettled) {
                    item.status = "已完成";
                    item.salarysettled = true;
                    addSalary(item.staffid, item.amount || item.money);
                    isUpdated = true;
                }
            }
        }
    });

    if (isUpdated) {
        await saveOrders(allOrders);
        loadOrders();
    }
}

// 清理过期订单
async function cleanExpiredOrders() {
    let allOrders = await getOrders();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentOrders = allOrders.filter(order => {
        const orderDate = new Date(order.submittime);
        return orderDate >= sevenDaysAgo;
    });

    if (recentOrders.length !== allOrders.length) {
        await saveOrders(recentOrders);
        console.log(`已清理 ${allOrders.length - recentOrders.length} 个过期订单`);
        return true;
    }
    return false;
}

// 添加单个订单
async function addSingleOrder() {
    const waketime = document.getElementById("wakeTime").value;
    const phone = document.getElementById("phone").value.trim();
    const note = document.getElementById("note").value.trim();

    if (!waketime) return alert("请选择叫醒时间！");
    const wakeTimeDate = new Date(waketime);
    const now = new Date();
    if (wakeTimeDate < now) {
        alert("不能选择过去的时间作为叫醒时间！");
        return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) return alert("请输入11位有效手机号！");

    const time = waketime.split('T')[1];
    const amount = calculateAmountByTime(time);

    const newOrder = {
        waketime: waketime,
        phone: phone,
        note: note,
        amount: amount,
        status: "待接单",
        serialnumber: null,
        staffid: "",
        staffname: "",
        salarysettled: false,
        submittime: new Date().toISOString()
    };

    let allOrders = await getOrders();
    allOrders.push(newOrder);
    await saveOrders(allOrders);

    document.getElementById("phone").value = "";
    document.getElementById("note").value = "";
    loadOrders();
    showToast("上传成功。", "success");
}

// 删除选中订单
async function deleteSelected() {
    const checkedSerials = Array.from(document.querySelectorAll(".order-checkbox:checked"))
        .map(cb => parseInt(cb.value));

    if (checkedSerials.length === 0) return alert("请选择要删除的订单！");
    if (!confirm(`确定删除选中的 ${checkedSerials.length} 条订单吗？`)) return;

    let allOrders = await getOrders();
    allOrders = allOrders.filter(item => !checkedSerials.includes(item.serialnumber));
    await saveOrders(allOrders);

    loadOrders();
    alert("删除成功！");
}

// 修改选中订单
async function editSelected() {
    const checkedSerials = Array.from(document.querySelectorAll(".order-checkbox:checked"))
        .map(cb => parseInt(cb.value));

    if (checkedSerials.length !== 1) return alert("请仅选择一条订单进行修改！");

    let allOrders = await getOrders();
    const targetIndex = allOrders.findIndex(item => item.serialnumber === checkedSerials[0]);
    if (targetIndex === -1) return alert("订单不存在！");

    const target = allOrders[targetIndex];
    const newTime = prompt("修改叫醒时间（格式：YYYY-MM-DDTHH:MM）", target.waketime);
    const newPhone = prompt("修改手机号", target.phone);
    const newNote = prompt("修改备注", target.note);

    if (!newTime || !newPhone) return alert("时间和手机号不能为空！");
    if (!/^1[3-9]\d{9}$/.test(newPhone)) return alert("手机号格式错误！");
    const newTimeDate = new Date(newTime);
    const now = new Date();
    if (newTimeDate < now) {
        alert("不能选择过去的时间作为叫醒时间！");
        return;
    }

    target.waketime = newTime;
    target.phone = newPhone;
    target.note = newNote;
    target.money = calculateAmountByTime(newTime.split('T')[1]);

    await saveOrders(allOrders);
    loadOrders();
    alert("修改成功！");
}

// 搜索订单
function searchOrders() {
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput.value.trim().toLowerCase();
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
        const waketime = order.waketime && order.waketime.includes('T') ? order.waketime.split('T')[1] : order.waketime;
        if (waketime && waketime.toLowerCase().includes(searchTerm)) {
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
    // 搜索后清空搜索栏
    searchInput.value = "";
}

// 清空搜索
function clearSearch() {
    document.getElementById("searchInput").value = "";
    renderOrders(originalOrders || []);
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

    try {
        // 直接调用AI API
        const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer bb956b2870b346a39c34b3344a61defb.IOTprsN1opphPYp8"
            },
            body: JSON.stringify({
                model: "glm-4-flash",
                messages: [
                    {
                        role: "system",
                        content: "你是一个叫醒订单识别助手。从文本里提取每一条订单，输出严格JSON数组，不要其他任何内容。每条必须包含：- phone: 11位手机号 - wakeTime: 时间，格式如 07:20 - note: 备注，没有填空"
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.1
            })
        });

        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }

        const resultText = data.choices[0].message.content;
        const orders = JSON.parse(resultText);

        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        parsedBatchOrders = orders.map(o => {
            const time = normalizeTime(o.wakeTime);
            return {
                waketime: `${dateStr}T${time}`,
                phone: o.phone,
                note: o.note || "-",
                amount: calculateAmountByTime(time),
                status: "待接单",
                serialnumber: null,
                staffid: "",
                staffname: "",
                salarysettled: false,
                submittime: new Date().toISOString()
            };
        });

        parsedBatchOrders.sort((a, b) => {
            const t1 = a.waketime.split('T')[1];
            const t2 = b.waketime.split('T')[1];
            const c = t1.localeCompare(t2);
            if (c !== 0) return c;
            return new Date(a.submittime) - new Date(b.submittime);
        });

        let html = "<div>✅ 识别完成：</div>";
        parsedBatchOrders.forEach((it, i) => {
            html += `<div>第${i + 1}单：${it.waketime.split('T')[1]} ${it.phone} 备注：${it.note}</div>`;
        });
        document.getElementById("parsePreview").innerHTML = html;
        document.getElementById("batchUploadBtn").disabled = false;

    } catch (e) {
        document.getElementById("parsePreview").innerHTML = "❌ 识别失败：" + e.message;
        document.getElementById("batchUploadBtn").disabled = true;
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
